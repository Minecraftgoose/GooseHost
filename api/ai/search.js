// ===== 联网检索（Tavily）=====
//
// 设计要点：检索被做成【一个工具】，由模型决定要不要调，而不是每次对话都先搜一遍。
// 之前的实现是在 handleAiChat 里串行 await 搜索、把结果塞进 system 再发给模型，
// 等于给每次对话白加 1～5 秒，还会把 prompt 撑长、拖慢首 token。
// 现在改成：模型想搜 → 前端调本接口 → 拿到结构化结果 → 回喂模型。

import { getUserId } from '../utils/jwt.js';
import { jsonResp } from '../utils/response.js';

const MAX_QUERY = 500;
const DEFAULT_MAX_RESULTS = 5;
// 超时从原来的 15s 降到 4s：检索只是辅助，宁可跳过也不能卡住整轮对话
const SEARCH_TIMEOUT_MS = 4000;

function numEnv(env, key, fallback, min, max) {
  const v = Number(env && env[key]);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, min), max);
}

async function tavilySearch(query, env) {
  const key = String((env && env.TAVILY_API_KEY) || '').trim();
  // 区分「未配置」与「检索失败」：以前一律返回 null，
  // 结果模型只会说「我无法搜索」，用户根本不知道是没配 Key。
  if (!key) return { state: 'unconfigured', hits: null };
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: String(query).slice(0, MAX_QUERY),
        max_results: numEnv(env, 'SEARCH_MAX_RESULTS', DEFAULT_MAX_RESULTS, 1, 10),
        search_depth: 'basic'
      }),
      signal: AbortSignal.timeout(numEnv(env, 'SEARCH_TIMEOUT_MS', SEARCH_TIMEOUT_MS, 1000, 15000))
    });
    if (!r.ok) return { state: 'error', hits: null };
    const d = await r.json();
    const list = Array.isArray(d && d.results) ? d.results : [];
    if (!list.length) return { state: 'empty', hits: null };
    return {
      state: 'ok',
      hits: list.slice(0, numEnv(env, 'SEARCH_MAX_RESULTS', DEFAULT_MAX_RESULTS, 1, 10)).map(x => ({
        title: x.title || '',
        url: x.url || '',
        content: String(x.content || '').slice(0, 800)
      }))
    };
  } catch (e) {
    return { state: 'error', hits: null, error: (e && e.message) || String(e) };
  }
}

/**
 * POST /api/ai/search — 供 Copilot 的 web_search 工具调用。
 * 需要登录（避免被当成免费搜索接口滥用），但不限流（AI 链路不设限流）。
 */
export async function handleAiSearch(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  let payload;
  try { payload = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  const q = String((payload && payload.query) || '').trim().slice(0, MAX_QUERY);
  if (!q) return jsonResp({ error: 'query 不能为空' }, 400, corsHeaders);

  const t0 = Date.now();
  const sr = await tavilySearch(q, env);
  const elapsed = Date.now() - t0;

  if (sr.state !== 'ok') {
    const msg = {
      unconfigured: '联网检索未生效：服务端还没配置 TAVILY_API_KEY',
      empty: '没有检索到相关资料，换个说法再试',
      error: '检索服务暂时不可用：' + (sr.error || '')
    }[sr.state] || '检索失败';
    return jsonResp({ ok: false, state: sr.state, error: msg, elapsedMs: elapsed },
      sr.state === 'unconfigured' ? 503 : 502, corsHeaders);
  }

  // 返回结构化列表，由前端格式化后回喂模型
  return jsonResp({
    ok: true,
    state: 'ok',
    query: q,
    results: sr.hits,
    elapsedMs: elapsed
  }, 200, corsHeaders);
}

export { tavilySearch };
