// ===== API Key 管理接口 =====
//
// 路由：
//   GET    /api/tokens          列出当前账号的全部 Key（只返回脱敏串）
//   POST   /api/tokens          创建 Key，明文仅在本次响应返回
//   DELETE /api/tokens/:id      吊销 Key
//
// 鉴权：只能用自己的登录会话（Supabase JWT）管理 Key，
//       不接受「用 API Key 再创建 API Key」—— 避免凭证被拿去自我增殖。

import { jsonResp } from '../utils/response.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { getUserId, isApiKeyRequest } from '../utils/jwt.js';
import {
  createUserKey,
  listUserKeys,
  revokeUserKey,
  MAX_KEYS_PER_USER
} from '../utils/apikey.js';

/** 管理类操作：每 IP 每分钟 10 次 */
const RL_ACTION = 'token_manage';

async function currentUserId(request, env) {
  return await getUserId(request, env);
}

// GET /api/tokens
export async function handleListTokens(request, env, corsHeaders) {
  const rl = await checkRateLimit(request, env, RL_ACTION);
  if (!rl.allowed) {
    return jsonResp({ error: '请求过于频繁，请稍后重试' }, 429, corsHeaders);
  }

  // 不允许用 API Key 管理 API Key
  if (isApiKeyRequest(request)) {
    return jsonResp({ error: '管理 API Key 需使用登录会话' }, 403, corsHeaders);
  }

  const userId = await currentUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  const keys = await listUserKeys(userId, env);
  return jsonResp({ keys, max: MAX_KEYS_PER_USER }, 200, corsHeaders);
}

// POST /api/tokens  body: { name?: string }
export async function handleCreateToken(request, env, corsHeaders) {
  const rl = await checkRateLimit(request, env, RL_ACTION);
  if (!rl.allowed) {
    return jsonResp({ error: '请求过于频繁，请稍后重试' }, 429, corsHeaders);
  }

  if (isApiKeyRequest(request)) {
    return jsonResp({ error: '创建 API Key 需使用登录会话' }, 403, corsHeaders);
  }

  const userId = await currentUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  let body = {};
  try { body = await request.json(); } catch { /* 允许空 body */ }

  const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
  if (rawName.length > 40) {
    return jsonResp({ error: '名称不能超过 40 个字符' }, 400, corsHeaders);
  }

  const result = await createUserKey(userId, rawName, env);
  if (!result.ok) {
    return jsonResp({ error: result.error }, result.status, corsHeaders);
  }

  // ⚠️ 明文只在这一次响应里出现，之后无法再取回
  return jsonResp({
    success: true,
    key: result.plain,
    token: {
      id: result.record.id,
      name: result.record.name,
      masked: result.record.masked,
      createdAt: result.record.createdAt
    },
    hint: '请立即保存，此密钥仅显示一次'
  }, 200, corsHeaders);
}

// DELETE /api/tokens/:id
export async function handleRevokeToken(request, env, corsHeaders, keyId) {
  const rl = await checkRateLimit(request, env, RL_ACTION);
  if (!rl.allowed) {
    return jsonResp({ error: '请求过于频繁，请稍后重试' }, 429, corsHeaders);
  }

  if (isApiKeyRequest(request)) {
    return jsonResp({ error: '吊销 API Key 需使用登录会话' }, 403, corsHeaders);
  }

  const userId = await currentUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  if (!keyId) return jsonResp({ error: '缺少 Key ID' }, 400, corsHeaders);

  const result = await revokeUserKey(userId, keyId, env);
  if (!result.ok) {
    return jsonResp({ error: result.error }, result.status, corsHeaders);
  }

  return jsonResp({ success: true }, 200, corsHeaders);
}
