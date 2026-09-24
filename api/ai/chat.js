import { getUserId } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { jsonResp } from '../utils/response.js';
const DEFAULT_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODELS = ['glm-4.7-flash', 'glm-4.6', 'glm-4-flash'];

// ===== 内置 Provider 预设（一键接入）=====
// 当 AI_PROVIDER 命中下表时，自动套用对应的 base url 与默认模型，
// 无需再手写完整的 AI_BASE_URL / AI_MODEL。
// 新增 provider 只需在此登记——保持 OpenAI 兼容协议即可。
const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    // DeepSeek 官方 API 兼容 OpenAI 与 Anthropic 两种协议：
    //   base_url (OpenAI 格式)   = https://api.deepseek.com      → /chat/completions
    //   base_url (Anthropic 格式) = https://api.deepseek.com/anthropic
    // 本代理走 OpenAI 兼容通道（参见 api-docs.deepseek.com/quick_start）。
    baseURL: 'https://api.deepseek.com',
    // 官方当前在售模型仅两个：deepseek-flash（DeepSeek-V4.1-Flash）与
    // deepseek-v4-pro（DeepSeek-V4-Pro-0813）。
    // ⚠️ deepseek-v4-flash 是【已退役模型的旧别名】：官方仍接受该名称，但请求会由
    // DeepSeek-V4.1-Flash 承接并按 Flash 计价，不应再作为首选值（api-docs 首页脚注 1）。
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    // 思维模式参数：thinking 开关 + reasoning_effort 档位，官方 curl 示例即用此组合。
    // 官方说明：thinking 默认开启、默认 effort 为 high；reasoning_effort 取值 low/high/max。
    extraBody: { thinking: { type: 'enabled' }, reasoning_effort: 'high' },
    // 官方明确：思维模式下 temperature / presence_penalty / frequency_penalty 不生效
    // （为兼容旧软件不会报错，但会被忽略）。故开启 thinking 时不再透传 temperature，
    // 避免出现「以为调了温度、实际没效果」的误解。
    noTemperatureWithThinking: true
  },
  // OpenCode Zen：官方精选模型网关（https://opencode.ai/docs/zen）。
  // 鉴权：Authorization: Bearer <登录 opencode.ai/zen 后复制的 API Key>。
  //
  // ⚠️ 关键：Zen 的 endpoint 是【按模型族区分的】，不是统一的 /chat/completions。
  //   /chat/completions → DeepSeek V4.x、MiniMax M2.x/M3、GLM 5.x、Kimi K2.x/K3、
  //                       big-pickle、mimo-*-free、ling-3.0-flash-fin-free、nemotron-*-free、
  //                       hy3-free、deepseek-v4-flash-free
  //   /responses        → GPT 5.x / GPT 6 Astra、Grok 4.x、grok-build、Muse Spark
  //   /messages         → Claude（Opus/Sonnet/Haiku/Fable）、Qwen3.x
  //   /models/<id>      → Gemini 3.x
  //   /systemone        → jev-1.13 / jev-1.13-free（结构化判定，非文本生成）
  // 本代理只实现了 OpenAI Chat Completions 的请求/响应体，因此默认模型链【只放
  // /chat/completions 的模型】；用户若指定了别的模型族，下面 zenPathFor() 会识别
  // 并直接给出明确报错，而不是静默打到错误端点上。
  //
  // 免费模型（官方定价表标为 Free，多为限时提供）：
  //   big-pickle / mimo-v2.5-free / ling-3.0-flash-fin-free /
  //   nemotron-3-ultra-free / nemotron-3.5-lightning-free / hy3-free
  //   （muse-spark-1.2-contributor-free、muse-spark-1.3-contributor-free 也免费，但走 /responses）
  // 按量付费（节选，$/1M tokens）：deepseek-v4-pro、deepseek-v4.1-flash、glm-5.3-flash、
  //   minimax-m3、kimi-k3、deepseek-v4-flash。
  // 全量模型与元数据可拉取：https://opencode.ai/zen/v1/models
  // ⚠️ deepseek-v4-flash 不带 -free 后缀，是【付费模型】；免费端点是
  // deepseek-v4-flash-free（已在列表中）。两者不要混用。
  'opencode-zen': {
    label: 'OpenCode Zen',
    baseURL: 'https://opencode.ai/zen/v1',
    models: [
      // 免费（/chat/completions）
      'big-pickle',
      'mimo-v2.5-free',
      'ling-3.0-flash-fin-free',
      'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free',
      'hy3-free', 'deepseek-v4-flash-free',
      // 按量（/chat/completions）
      'deepseek-v4-pro', 'deepseek-v4.1-flash',
      'glm-5.3-flash', 'minimax-m3', 'kimi-k3',
      'deepseek-v4-flash'
    ],
    // Zen 不强制 thinking 参数；计费由 opencode.ai/zen 控制台侧管理，后端不做改写。
    extraBody: {}
  },
  // 示例：可继续扩展 openai / qwen 等 OpenAI 兼容 provider
  // openai: { label: 'OpenAI', baseURL: 'https://api.openai.com/v1', models: ['gpt-5'] }
};

// OpenCode Zen 各模型族对应的 endpoint 路径（依据 https://opencode.ai/docs/zen 的 Endpoints 表）。
// 未列入的模型按官方约定归入 /chat/completions（DeepSeek/GLM/Kimi/MiniMax/big-pickle/免费模型）。
const ZEN_NON_CHAT_COMPLETIONS = {
  '/responses': [
    'gpt-', 'grok-', 'grok-build', 'muse-spark',
    'muse-spark-1.3-contributor-free'
  ],
  '/messages': ['claude-', 'qwen3'],
  '/systemone': ['jev-']
};
// Gemini 使用 /models/<model-id> 形式，单独处理。
function zenPathFor(model) {
  const m = String(model || '').trim().toLowerCase();
  if (!m) return '/chat/completions';
  if (/^gemini-/.test(m)) return `/models/${m}`;
  for (const path of Object.keys(ZEN_NON_CHAT_COMPLETIONS)) {
    if (ZEN_NON_CHAT_COMPLETIONS[path].some(p => m === p || m.startsWith(p))) return path;
  }
  return '/chat/completions';
}
// 判定一个 endpoint 是否指向 OpenCode Zen。
// 只看 host + path，不看 query/fragment——否则形如
// https://other.com/?u=opencode.ai/zen 这种地址会被误判成 Zen 而套错校验规则。
function isZenEndpoint(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === 'zen.opencode.ai') return true;
    return (host === 'opencode.ai' || host.endsWith('.opencode.ai'))
      && /^\/zen(\/|$)/i.test(u.pathname);
  } catch {
    // 非合法 URL（用户随手填的片段）时退化为「host/path 部分」的字面匹配
    const hostPath = raw.split(/[?#]/)[0];
    return /\/\/(zen\.)?opencode\.ai\/zen(\/|$)/i.test(hostPath)
      || /\/\/zen\.opencode\.ai(\/|$)/i.test(hostPath);
  }
}
function resolveProvider(env) {
  const name = String(env.AI_PROVIDER || '').trim().toLowerCase();
  return name ? PROVIDERS[name] || null : null;
}
function modelChain(env) {
  const provider = resolveProvider(env);
  const fallback = provider ? provider.models : DEFAULT_MODELS;
  const raw = (env.AI_MODEL || '').trim();
  const list = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : fallback;
  return list.length ? list : fallback;
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
function buildBody(model, payload, env, stream, providerOverride) {
  const maxTokens = Number(env.AI_MAX_TOKENS) || 4096;
  const provider = providerOverride || resolveProvider(env);
  const body = {
    model,
    messages: payload.messages,
    max_tokens: maxTokens,
    stream: !!stream
  };
  // 合并 provider 预设的额外字段（如 DeepSeek 的 thinking / reasoning_effort；
  // OpenCode Zen 为 {}，不额外注入参数，保持 Chat Completions 兼容）。
  if (provider && provider.extraBody && typeof provider.extraBody === 'object') {
    for (const k of Object.keys(provider.extraBody)) body[k] = provider.extraBody[k];
  }
  if (Array.isArray(payload.tools) && payload.tools.length) {
    body.tools = payload.tools;
    body.tool_choice = payload.tool_choice || 'auto';
  }
  // DeepSeek 官方文档（Thinking Mode）：思维模式下 temperature / presence_penalty /
  // frequency_penalty 不生效——为兼容旧软件不会报错，但值会被忽略。
  // 既然本预设默认开启 thinking，就不再透传 temperature，避免误导排查方向。
  const thinkingOn = body.thinking && body.thinking.type === 'enabled';
  if (typeof payload.temperature === 'number'
    && !(provider && provider.noTemperatureWithThinking && thinkingOn)) {
    body.temperature = payload.temperature;
  }
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
  const serverKeyList = keyChain(env);
  const errors = [];                       // 函数级作用域：tryModelOnce 闭包与汇总返回都会 push
  let payload;
  try { payload = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  if (!Array.isArray(payload?.messages) || !payload.messages.length) {
    return jsonResp({ error: 'messages 不能为空' }, 400, corsHeaders);
  }
  const provider = resolveProvider(env);
  // 「一键接入」透传：前端自定义模型把 endpoint / apiKey 放进请求体，走本代理转发。
  // 预检实测（2026-09-22，Origin: https://example.com，请求头 authorization,content-type）：
  //   · OpenCode Zen  https://opencode.ai/zen/v1/chat/completions → OPTIONS 404，
  //     且无任何 Access-Control-Allow-* 响应头 → 浏览器直连必然被 CORS 拦，必须走代理；
  //   · DeepSeek      https://api.deepseek.com/chat/completions → OPTIONS 200，
  //     带 access-control-allow-origin/methods/headers → 直连预检其实是通过的。
  //     仍统一走代理，是为了隐藏用户 Key、复用 Key 轮换与限流，而不是因为 CORS。
  // 优先级：请求体 endpoint > AI_BASE_URL > provider 预设 > 默认 GLM
  //
  // ⚠️ Endpoint 归一化策略（2026-09 调整）：
  // 前端已移除「自动补全 /chat/completions」，用户填的 URL 被视为【完整地址】，
  // 后端必须【原样使用】，不再做路径假设——否则用户填第三方网关
  // （如 /api/v1/chat、/completions、带子路径的代理）会被强制改坏。
  // 这里只做：去尾斜杠 + 兼容旧数据（若仍以 /chat/completions 结尾则保留，不再剥离）。
  const customEndpoint = String(payload.endpoint || '').trim().replace(/\/+$/, '');
  // OpenCode Zen 识别：Endpoint 命中 opencode.ai/zen 时，自动套用 opencode-zen
  // provider 预设（免费模型列表、计费提示），无需前端额外传 provider 名。
  // 仅做路由匹配，不读取、不持久化用户的 API Key。
  // 注意：用【原始 endpoint】匹配，因为用户可能填的是完整 URL
  // （如 https://opencode.ai/zen/v1/chat/completions），只要包含路径片段即命中。
  const zenDetected = isZenEndpoint(customEndpoint);
  const zenProvider = zenDetected ? PROVIDERS['opencode-zen'] : null;
  const activeProvider = provider || zenProvider;
  // base：用户填的自定义 endpoint 的处理——
  // ⚠️ 2026-09 调整：前端已移除「自动补全 /chat/completions」，用户填的 URL 被视为
  // 【完整请求地址】，后端【原样使用，绝不追加任何路径】。
  // 理由：自定义模型端点可能是任意 OpenAI 兼容网关（/api/v1/chat、/completions、
  // 带子路径的代理、第三方中转），若后端再硬拼 /chat/completions 会把这些地址改坏。
  // 一键接入（PRESETS）在前端就已填入完整地址（如 https://opencode.ai/zen/v1/chat/completions），
  // 用户手动填时也按「填什么请求什么」处理。仅做去尾斜杠规范化。
  const customBase = customEndpoint ? customEndpoint.replace(/\/$/, '') : '';
  const base = customBase
    ? customBase
    : (env.AI_BASE_URL || (provider && provider.baseURL) || DEFAULT_BASE).replace(/\/$/, '');
  // 前端传了自定义 key（用户自己的 DeepSeek Key）时，以它作为唯一 key；
  // 否则沿用服务端配置的 key 轮换列表。
  const customKey = String(payload.apiKey || '').trim();
  const keyList = customKey ? [customKey] : serverKeyList;
  if (!keyList.length) {
    return jsonResp({ error: '服务端未配置 AI_API_KEYS 或 AI_API_KEY' }, 500, corsHeaders);
  }
  const models = customEndpoint || customKey
    ? (String(payload.model || '').trim() ? [String(payload.model).trim()] : (activeProvider ? activeProvider.models : modelChain(env)))
    : modelChain(env);
  // OpenCode Zen：本代理只会发 Chat Completions 格式的请求体，
  // 但 Zen 的 GPT / Grok / Claude / Qwen / Gemini / Jev 走的是别的 endpoint 和别的协议。
  // 与其静默打到 /chat/completions 拿一个难懂的错误，不如直接告诉用户该用哪个端点。
  if (zenDetected || resolveProvider(env) === PROVIDERS['opencode-zen']) {
    const unsupported = models
      .map(m => ({ model: m, path: zenPathFor(m) }))
      .filter(x => x.path !== '/chat/completions');
    const usable = models.filter(m => zenPathFor(m) === '/chat/completions');
    if (!usable.length) {
      return jsonResp({
        error: 'OpenCode Zen：所选模型不走 Chat Completions 端点，本代理暂不支持',
        models: unsupported.map(x => ({ model: x.model, endpoint: 'https://opencode.ai/zen/v1' + x.path })),
        hint: 'OpenCode Zen 的 endpoint 按模型族区分：GPT/Grok/Muse Spark 用 /responses，'
          + 'Claude/Qwen 用 /messages，Gemini 用 /models/<model-id>，Jev 用 /systemone；'
          + '只有 DeepSeek/GLM/Kimi/MiniMax/big-pickle 及各 *-free 模型走 /chat/completions。'
          + '详见 https://opencode.ai/docs/zen 的 Endpoints 表；'
          + '全量模型可查 https://opencode.ai/zen/v1/models'
      }, 400, corsHeaders);
    }
    // 部分可用：把不支持的记进 errors，继续用可用的模型链跑完
    errors.push(...unsupported.map(x => `${x.model}: 需 ${x.path} 端点，已跳过`));
    models.length = 0;
    models.push(...usable);
  }
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
        body: JSON.stringify(buildBody(model, payload, env, wantStream, activeProvider))
      };
      const thisTimeout = Math.min(upstreamTimeout, Math.max(remain(), 1000));
      // 组装最终上游 URL：
      //   · 用户自定义 endpoint（customEndpoint）→ 视为完整地址，原样请求；
      //   · 服务端 base（AI_BASE_URL / provider 预设 / 默认 GLM）→ 裸 base，补 /chat/completions。
      // 例外：OpenCode Zen 的 endpoint 按模型族区分（见 zenPathFor），
      //   若命中的是 /chat/completions 之外的模型族，前面已做校验拦截，这里不会走到。
      const upstreamUrl = customEndpoint
        ? base
        : (/\/chat\/completions$/i.test(base) ? base : base + '/chat/completions');
      try {
        if (wantStream) {
          const r = await fetchUpstream(upstreamUrl, opts, thisTimeout);
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
          const r = await fetchUpstreamText(upstreamUrl, opts, thisTimeout);
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
    hint: '依次排查：1) 模型名是否有效（DeepSeek 官方在售为 deepseek-flash 与 deepseek-v4-pro；'
      + 'deepseek-v4-flash / deepseek-v4-flash-vision-exp 是旧别名，仍被接受但对应模型已退役，'
      + '请求由 DeepSeek-V4.1-Flash 承接、按 Flash 计价；智谱模型迭代也快，HTTP 400 即模型不存在）；'
      + '2) API Key 是否有效、额度是否用完（HTTP 401；DeepSeek Key 在 platform.deepseek.com 申请，'
      + 'OpenCode Zen 的 Key 在登录 opencode.ai/zen 后复制，两者不通用）；'
      + '3) 是否触发限流（HTTP 429，各 Key 独立计数，多填几个可缓解）；'
      + '4) 端点是否正确——DeepSeek（OpenAI 格式）为 https://api.deepseek.com，'
      + '请求 /chat/completions；Anthropic 格式则是 https://api.deepseek.com/anthropic。'
      + 'AI_PROVIDER=deepseek 可一键套用。'
      + 'OpenCode Zen 的 base 为 https://opencode.ai/zen/v1，且 endpoint 按模型族区分：'
      + '/chat/completions（DeepSeek、GLM、Kimi、MiniMax、big-pickle、各 *-free）、'
      + '/responses（GPT、Grok、Muse Spark）、/messages（Claude、Qwen）、'
      + '/models/<model-id>（Gemini）、/systemone（Jev）；'
      + '5) 若大量「超时」且 payloadBytes 很大，说明请求太重导致上游慢'
      + '（可精简对话历史或减少工具数）；若 payloadBytes 很小仍超时，'
      + '则是到上游的网络不通，可调小 AI_UPSTREAM_TIMEOUT_MS 快速失败'
  }, 502, corsHeaders);
}
