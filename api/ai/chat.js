import { getUserId } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { jsonResp } from '../utils/response.js';
const DEFAULT_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODELS = ['glm-4.7-flash', 'glm-4.6', 'glm-4-flash'];
function modelChain(env) {
  const raw = (env.AI_MODEL || '').trim();
  const list = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_MODELS;
  return list.length ? list : DEFAULT_MODELS;
}
function keyChain(env) {
  const raw = env.AI_API_KEYS || env.AI_API_KEY || '';
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}
let rrCursor = 0;
function rotateKeys(keys) {
  if (keys.length <= 1) return keys.slice();
  const start = (rrCursor++) % keys.length;
  return keys.slice(start).concat(keys.slice(0, start));
}
function buildBody(model, payload, env, stream) {
  const maxTokens = Number(env.AI_MAX_TOKENS) || 4096;
  const body = {
    model,
    messages: payload.messages,
    max_tokens: maxTokens,
    stream: !!stream
  };
  if (Array.isArray(payload.tools) && payload.tools.length) {
    body.tools = payload.tools;
    body.tool_choice = payload.tool_choice || 'auto';
  }
  if (typeof payload.temperature === 'number') body.temperature = payload.temperature;
  return body;
}
function sseHeaders(corsHeaders, model, keyIdx, keyCount, errors, elapsedMs) {
  const h = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...corsHeaders,
    'X-Copilot-Model': model
  };
  if (typeof elapsedMs === 'number') h['X-Copilot-Elapsed'] = String(elapsedMs);
  if (keyCount > 1) h['X-Copilot-Key'] = `${keyIdx}/${keyCount}`;
  if (errors.length) h['X-Copilot-Fallback'] = errors.join(' | ');
  return h;
}
const DEFAULT_UPSTREAM_TIMEOUT = 30000;
const DEFAULT_BUDGET = 60000;
const MAX_ROUNDS = 1;         
const DEFAULT_429_WAIT = 2;   
const MAX_RETRY_SLEEP = 20;   
const sleep = ms => new Promise(r => setTimeout(r, ms));
function numEnv(env, name, fallback) {
  const v = Number(env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
async function fetchUpstream(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const resp = await fetch(url, { ...opts, signal: ctrl.signal });
    return { resp, ctrl, timer, elapsed: Date.now() - t0 };
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e && e.name)));
    return { error: aborted ? `超时（>${timeoutMs}ms）` : ((e && e.message) || String(e)), aborted, elapsed: Date.now() - t0 };
  }
}
async function fetchUpstreamText(url, opts, timeoutMs) {
  const r = await fetchUpstream(url, opts, timeoutMs);
  if (r.error) return { ...r, text: '' };
  try {
    const text = await r.resp.text();
    return { resp: r.resp, text, elapsed: Date.now() - (Date.now() - r.elapsed) };
  } catch (e) {
    return { error: (e && e.message) || String(e), aborted: true, text: '', elapsed: r.elapsed };
  } finally {
    clearTimeout(r.timer);
  }
}
function parseRetryAfter(resp) {
  const raw = resp.headers && resp.headers.get ? resp.headers.get('Retry-After') : null;
  if (!raw) return 0;
  const n = Number(raw);
  if (!isNaN(n) && n >= 0) return Math.min(n, MAX_RETRY_SLEEP);
  const t = Date.parse(raw);
  if (!isNaN(t)) {
    const d = Math.round((t - Date.now()) / 1000);
    return d > 0 ? Math.min(d, MAX_RETRY_SLEEP) : 0;
  }
  return 0;
}
export async function handleAiChat(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);
  const rl = await checkRateLimit(request, env, 'ai_chat');
  if (!rl.allowed) {
    const msg = rl.locked
      ? `操作过于频繁，请在 ${Math.ceil(rl.resetIn / 60)} 分钟后重试`
      : `请求过于频繁，请在 ${Math.ceil(rl.resetIn)} 秒后重试`;
    return jsonResp({ error: msg, retryAfter: Math.ceil(rl.resetIn) }, 429, corsHeaders);
  }
  const keyList = keyChain(env);
  if (!keyList.length) {
    return jsonResp({ error: '服务端未配置 AI_API_KEYS 或 AI_API_KEY' }, 500, corsHeaders);
  }
  let payload;
  try { payload = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  if (!Array.isArray(payload?.messages) || !payload.messages.length) {
    return jsonResp({ error: 'messages 不能为空' }, 400, corsHeaders);
  }
  const base = (env.AI_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const models = modelChain(env);
  const errors = [];   
  const wantStream = payload.stream === true;   
  const budgetMs = numEnv(env, 'AI_BUDGET_MS', DEFAULT_BUDGET);
  const upstreamTimeout = numEnv(env, 'AI_UPSTREAM_TIMEOUT_MS', DEFAULT_UPSTREAM_TIMEOUT);
  const deadline = Date.now() + budgetMs;
  const remain = () => deadline - Date.now();
  async function tryModelOnce(model, keys) {
    let maxWait = 0;
    for (let k = 0; k < keys.length; k++) {
      if (remain() <= 0) {
        errors.push(`${model}: 预算耗尽`);
        return { wait: 0, exhausted: true };
      }
      let upstream = null, text = '';
      const opts = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + keys[k]
        },
        body: JSON.stringify(buildBody(model, payload, env, wantStream))
      };
      const thisTimeout = Math.min(upstreamTimeout, Math.max(remain(), 1000));
      try {
        if (wantStream) {
          const r = await fetchUpstream(base + '/chat/completions', opts, thisTimeout);
          if (r.error) {
            errors.push(`${model}: key#${k + 1} ${r.error}`);
            maxWait = Math.max(maxWait, DEFAULT_429_WAIT);
            continue;
          }
          upstream = r.resp;
          clearTimeout(r.timer);   
          if (upstream.ok && upstream.body) {
            return { ok: true, streamResp: upstream, keyIdx: k + 1, elapsed: r.elapsed };
          }
          text = await upstream.text().catch(() => '');
        } else {
          const r = await fetchUpstreamText(base + '/chat/completions', opts, thisTimeout);
          if (r.error) {
            errors.push(`${model}: key#${k + 1} ${r.error}`);
            maxWait = Math.max(maxWait, DEFAULT_429_WAIT);
            continue;
          }
          upstream = r.resp;
          text = r.text;
        }
      } catch (e) {
        errors.push(`${model}: key#${k + 1} ${(e && e.message) || e}`);
        maxWait = Math.max(maxWait, DEFAULT_429_WAIT);
        continue;
      }
      const st = upstream.status;
      if (st === 400) {
        errors.push(`${model}: HTTP 400`);
        return { fatalModel: true };      
      }
      if (st === 401) {
        errors.push(`${model}: key#${k + 1} HTTP 401`);
        continue;                          
      }
      if (st === 429 || st >= 500) {
        const w = parseRetryAfter(upstream) || DEFAULT_429_WAIT;
        maxWait = Math.max(maxWait, w);
        errors.push(`${model}: key#${k + 1} HTTP ${st}`);
        continue;
      }
      return { ok: true, text, status: st, keyIdx: k + 1 };
    }
    return { wait: maxWait };
  }
  const t0 = Date.now();
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    for (let round = 0; round <= MAX_ROUNDS; round++) {
      if (remain() <= 0) { errors.push('预算耗尽，中止后续尝试'); break; }
      const keys = rotateKeys(keyList);
      const r = await tryModelOnce(model, keys);
      if (r.ok) {
        const elapsed = Date.now() - t0;
        if (r.streamResp) {
          return new Response(r.streamResp.body, {
            status: 200,
            headers: sseHeaders(corsHeaders, model, r.keyIdx, keyList.length, errors, elapsed)
          });
        }
        const headers = {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders,
          'X-Copilot-Model': model,
          'X-Copilot-Elapsed': String(elapsed)
        };
        if (keyList.length > 1) headers['X-Copilot-Key'] = `${r.keyIdx}/${keyList.length}`;
        if (errors.length) headers['X-Copilot-Fallback'] = errors.join(' | ');
        return new Response(r.text, { status: r.status, headers });
      }
      if (r.fatalModel) break;
      if (round < MAX_ROUNDS && r.wait > 0) {
        const waitMs = Math.min(r.wait * 1000, Math.max(remain(), 0));
        if (waitMs > 0) await sleep(waitMs);
      }
      if (r.exhausted) break;
    }
  }
  const toolCount = Array.isArray(payload.tools) ? payload.tools.length : 0;
  let payloadBytes = 0;
  try { payloadBytes = JSON.stringify(payload).length; } catch {  }
  return jsonResp({
    error: '所有模型与 API Key 均调用失败',
    tried: errors,
    models,
    elapsedMs: Date.now() - t0,
    payloadBytes,
    msgCount: payload.messages.length,
    toolCount,
    hint: '依次排查：1) 模型名是否有效（智谱模型迭代快，HTTP 400 即模型不存在）；'
      + '2) API Key 是否有效、额度是否用完（HTTP 401）；'
      + '3) 是否触发限流（HTTP 429，各 Key 独立计数，多填几个可缓解）；'
      + '4) 端点是否正确——通用场景用 /api/paas/v4，Coding Plan 才是 /api/coding/paas/v4；'
      + '5) 若大量「超时」且 payloadBytes 很大，说明请求太重导致上游慢'
      + '（可精简对话历史或减少工具数）；若 payloadBytes 很小仍超时，'
      + '则是到上游的网络不通，可调小 AI_UPSTREAM_TIMEOUT_MS 快速失败'
  }, 502, corsHeaders);
}
