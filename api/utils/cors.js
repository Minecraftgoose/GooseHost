// ===== CORS 配置 =====
//
// 默认【允许所有跨域】：任何来源的浏览器都能直接调用本 API。
//
// 为什么敢全开
// ------------
// CORS 本身不是访问控制，它只是告诉浏览器「允许这个来源的 JS 读取响应」。
// 真正的访问控制是 Authorization 头里的凭证：
//   · API 密钥（gooseh-）由用户自己保管，存在自己域下的 localStorage / CI 里，
//     第三方页面读不到；
//   · 放开 CORS 不等于把凭证交出去 —— 拿不到 key 的站点照样 401。
// 所以全开的实际收益是：你可以在任意域名（自己做的工具页、本地 localhost、
// 第三方集成）直接用浏览器调 API，不必逐一登记白名单。
//
// 想收紧就设 CORS_ALLOW_ALL = "off"，回到白名单模式（见下）。

// 白名单模式下的严格列表：精确匹配才允许
const ALLOWED_ORIGINS = [
  'https://host.goose.cc.cd',
  'https://www.host.goose.cc.cd',
];

// 全开模式：* 通配。
// 注意：* 与 Access-Control-Allow-Credentials: true 互斥，
// 但本服务不用 Cookie、只认 Authorization 头，所以不受影响。
const WILDCARD = '*';

// 同站子域通配：只要 host 是 goose.cc.cd 本身或其子域就放行。
// 仅在白名单模式下生效（*.pages.dev 不在此列，需用 CORS_EXTRA_ORIGINS 登记）。
function isSameSiteOrigin(origin) {
  if (!origin) return false;
  let h;
  try { h = new URL(origin).host.toLowerCase(); } catch { return false; }
  return h === 'goose.cc.cd' || h.endsWith('.goose.cc.cd');
}

function extraOrigins(env) {
  return String((env && env.CORS_EXTRA_ORIGINS) || '')
    .split(',').map(x => x.trim()).filter(Boolean);
}

function allowAll(env) {
  // 未配置时视为全开；显式设为 "off" 才回到白名单
  return String((env && env.CORS_ALLOW_ALL) || 'on').toLowerCase() !== 'off';
}

// 自定义响应头：跨域时默认只暴露 7 个「安全」头，
// 想读自定义头必须在 Expose-Headers 里点名，否则 res.headers.get() 一律返回 null。
const EXPOSE_HEADERS = [
  'X-Copilot-Model',
  'X-Copilot-Key',
  'X-Copilot-Fallback',
  'X-Copilot-Elapsed',
  'Retry-After'
].join(', ');

/**
 * 白名单模式下的来源判定。
 * ⚠️ 以前这里「不在白名单就回落成 ALLOWED_ORIGINS[0]」：
 *    浏览器拿到的 Allow-Origin 与自己的 Origin 不匹配 → CORS 校验失败 →
 *    fetch 直接抛 "NetworkError when attempting to fetch resource"，
 *    而 NetworkError 不携带任何状态码，用户根本无从判断是 429、500 还是域名没配对。
 */
function resolveOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return ALLOWED_ORIGINS[0];          // 同源 / 服务端直调
  const extra = extraOrigins(env);
  if (ALLOWED_ORIGINS.includes(origin) || extra.includes(origin) || isSameSiteOrigin(origin)) {
    return origin;                                  // 精确回显，浏览器才认
  }
  return null;                                      // 明确拒绝，交给上层返回可读错误
}

function getCorsHeaders(request, env) {
  // ---- 全开模式：任何来源都放行 ----
  if (allowAll(env)) {
    return {
      'Access-Control-Allow-Origin': WILDCARD,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Expose-Headers': EXPOSE_HEADERS,
      'Access-Control-Max-Age': '86400',
    };
  }

  // ---- 白名单模式 ----
  const allowed = resolveOrigin(request, env);
  if (!allowed) {
    // 非法来源：仍然返回 CORS 头（带 fallback），但额外打标记便于排查
    return {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Copilot-Cors-Origin-Rejected': '1',
      'Access-Control-Max-Age': '86400',
    };
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': EXPOSE_HEADERS,
    'Access-Control-Max-Age': '86400',
  };
}

export { ALLOWED_ORIGINS, getCorsHeaders };
