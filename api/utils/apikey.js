// ===== API Key 工具 =====
//
// 设计要点
// --------
// 1. **只存哈希，不存明文**
//    Key 明文只在「创建成功」那一次响应里出现，之后无法再次读取。
//    存储被读也只拿得到 SHA-256 摘要，无法反推出 Key。
//
// 2. **前缀可识别**
//    `gooseh-<base58>`
//    带前缀的好处：日志里一眼认出是自家凭证；便于泄露扫描工具识别；
//    后端能快速分流「走 API Key 校验」还是「走 Supabase JWT 校验」。
//    用 base58（去掉 0/O/I/l）而非 base64，避免手抄或复制时认错字符。
//
// 3. **吊销即时生效**
//    鉴权路径只需一次 KV 读取；吊销时直接删除 key:<hash>，
//    旧 Key 立刻失效（KV 边缘节点有约 60 秒传播延迟，属可接受范围）。
//
// 存储结构（KV: API_KEYS_KV）
//   key:<sha256hex>  → { id, userId, name, masked, createdAt, lastUsedAt }
//   kid:<keyId>      → "<sha256hex>"        （吊销时反查用；hash 不可逆推明文，存它安全）
//   user:<userId>    → [ { id, name, masked, createdAt, lastUsedAt } ]  （列表索引）

const PREFIX = 'gooseh-';
const RANDOM_BYTES = 24;          // → base58 约 33 字符
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAX_KEYS_PER_USER = 20;
// lastUsedAt 最小回写间隔：KV 写入成本高，没必要每次请求都写
const LASTUSED_THROTTLE = 5 * 60 * 1000;

/* ---------------------------------------------------------------
 * 生成与格式化
 * --------------------------------------------------------------- */

/** 生成 Key 明文：gooseh-<33 位 base58> */
export function generateApiKey() {
  const bytes = new Uint8Array(RANDOM_BYTES);
  crypto.getRandomValues(bytes);

  // 大整数转 base58
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  let out = '';
  while (num > 0n) {
    out = BASE58[Number(num % 58n)] + out;
    num = num / 58n;
  }
  // 前导零字节在大整数运算中丢失，按字节数补齐，保证长度稳定
  while (out.length < 33) out = BASE58[0] + out;

  return PREFIX + out;
}

export function isApiKeyFormat(token) {
  return typeof token === 'string' &&
         token.startsWith(PREFIX) &&
         token.length > PREFIX.length + 8;
}

/** SHA-256 → 十六进制 */
export async function hashKey(plain) {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 展示用脱敏：gooseh-AbcdEfgh…Wxyz */
export function maskKey(plain) {
  if (!isApiKeyFormat(plain)) return '••••';
  const body = plain.slice(PREFIX.length);
  return PREFIX + body.slice(0, 8) + '…' + body.slice(-4);
}

function kvOk(env) {
  return !!(env && env.API_KEYS_KV && typeof env.API_KEYS_KV.get === 'function');
}

/* ---------------------------------------------------------------
 * 鉴权路径
 * --------------------------------------------------------------- */

/**
 * 用明文 Key 换身份。命中返回记录，否则 null。
 *
 * 这是热路径（每个业务请求都会过），因此：
 *   - 只做一次 KV get
 *   - lastUsedAt 回写做了节流，且失败也不影响鉴权结果
 */
export async function resolveApiKey(plain, env) {
  if (!kvOk(env) || !isApiKeyFormat(plain)) return null;

  let hash;
  try { hash = await hashKey(plain); } catch { return null; }

  let rec;
  try {
    rec = await env.API_KEYS_KV.get(`key:${hash}`, 'json');
  } catch {
    return null;
  }
  if (!rec || !rec.userId) return null;   // 未找到 = 已吊销或压根不存在

  // 节流回写最近使用时间。
  // 直接读记录里的 lastUsedAt 判断，省掉每次请求额外一次 KV get：
  // 节流窗口内本路径只有 1 次 KV 读取（主记录），仅在需要时才产生写入。
  try {
    const now = Date.now();
    const lastUsed = rec.lastUsedAt || 0;
    if (now - lastUsed > LASTUSED_THROTTLE) {
      const patch = { lastUsedAt: now };
      await env.API_KEYS_KV.put(`key:${hash}`, JSON.stringify({ ...rec, ...patch }));
      const list = (await env.API_KEYS_KV.get(`user:${rec.userId}`, 'json')) || [];
      const idx = list.findIndex(k => k.id === rec.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...patch };
        await env.API_KEYS_KV.put(`user:${rec.userId}`, JSON.stringify(list));
      }
    }
  } catch (_) { /* 统计回写失败无所谓，不影响鉴权 */ }

  return rec;
}

/* ---------------------------------------------------------------
 * 管理路径
 * --------------------------------------------------------------- */

/** 列出某用户的所有 Key（不含明文，只返回脱敏展示串） */
export async function listUserKeys(userId, env) {
  if (!kvOk(env)) return [];
  try {
    const list = (await env.API_KEYS_KV.get(`user:${userId}`, 'json')) || [];
    return list.map(k => ({
      id: k.id,
      name: k.name,
      masked: k.masked,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt || null
    }));
  } catch {
    return [];
  }
}

/**
 * 创建一个 Key。
 * @returns {{ok:true, plain:string, record:object} | {ok:false, status:number, error:string}}
 */
export async function createUserKey(userId, name, env) {
  if (!kvOk(env)) {
    return { ok: false, status: 503, error: 'API Key 服务未配置，请联系管理员' };
  }

  const existing = await listUserKeys(userId, env);
  if (existing.length >= MAX_KEYS_PER_USER) {
    return { ok: false, status: 400, error: `每个账号最多创建 ${MAX_KEYS_PER_USER} 个 API Key` };
  }

  const plain = generateApiKey();
  const hash = await hashKey(plain);
  const now = Date.now();
  const id = (crypto.randomUUID && crypto.randomUUID()) ||
             (String(now) + Math.random().toString(36).slice(2));

  const summary = {
    id,
    name: name || '未命名',
    masked: maskKey(plain),
    createdAt: now,
    lastUsedAt: null
  };

  try {
    // 三条记录：主记录、keyId→hash 反查、用户索引
    await env.API_KEYS_KV.put(`key:${hash}`, JSON.stringify({ ...summary, userId }));
    await env.API_KEYS_KV.put(`kid:${id}`, hash);
    await env.API_KEYS_KV.put(`user:${userId}`, JSON.stringify([...existing, summary]));
  } catch {
    return { ok: false, status: 500, error: '写入失败，请重试' };
  }

  return { ok: true, plain, record: summary };
}

/**
 * 吊销 Key。强制校验归属：只能吊销属于自己的。
 * @returns {{ok:true} | {ok:false, status:number, error:string}}
 */
export async function revokeUserKey(userId, keyId, env) {
  if (!kvOk(env)) return { ok: false, status: 503, error: 'API Key 服务未配置' };

  let list;
  try {
    list = (await env.API_KEYS_KV.get(`user:${userId}`, 'json')) || [];
  } catch {
    return { ok: false, status: 500, error: '读取失败' };
  }

  const target = list.find(k => k.id === keyId);
  if (!target) return { ok: false, status: 404, error: '未找到该 API Key' };

  try {
    // 拿到 hash 后直接删主记录 —— 旧 Key 立刻失效
    const hash = await env.API_KEYS_KV.get(`kid:${keyId}`, 'text');
    if (hash) {
      await env.API_KEYS_KV.delete(`key:${hash}`);
      await env.API_KEYS_KV.delete(`kid:${keyId}`);
    }
    const next = list.filter(k => k.id !== keyId);
    await env.API_KEYS_KV.put(`user:${userId}`, JSON.stringify(next));
  } catch {
    return { ok: false, status: 500, error: '吊销失败，请重试' };
  }

  return { ok: true };
}

export { MAX_KEYS_PER_USER };
