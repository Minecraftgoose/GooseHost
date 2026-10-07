// ===== API Key 作用域（白名单）=====
//
// 为什么用白名单而不是黑名单
// --------------------------
// 黑名单意味着「新增接口默认可用」，一旦有人加了新接口却忘了登记，
// 就会出现「一枚写着 gooseh- 的长期凭证能干本不该干的事」。
// 白名单反过来：**新接口默认拒绝**，必须显式登记才放行。
//
// 判定原则
// --------
// API Key 的定位是「CLI / CI 用的部署凭证」，只应覆盖**资源管理**：
// 建站、改站、删站、读写文件 —— 这些是无人值守场景真正需要的。
//
// 以下三类一律拒绝：
//   1. **花钱的**     —— AI Copilot（token 按量计费，等于把你的额度公开出去）
//   2. **以你名义的** —— 广场发帖/评论/点赞/关注/改资料、提交 macOS 审核
//                        （脚本代你社交，且容易被刷）
//   3. **账号级的**   —— 改昵称、注销账号、管理密钥本身（见 403_FORBIDDEN 提示）
//
// 将来若做 scopes 细分权限，这里就是「无 scopes 时的默认集合」。

import { isApiKeyRequest } from './jwt.js';

/** 允许 API Key 访问的路由（方法 + 路径模板，`:x` 为占位符） */
const ALLOWLIST = [
  // ---- 身份校验 ----
  ['GET',    '/api/me'],

  // ---- 站点管理（CLI 核心用途）----
  ['GET',    '/api/my-sites'],
  ['POST',   '/api/create'],
  ['POST',   '/api/update'],
  ['POST',   '/api/delete'],

  // ---- 文件内容读写 ----
  ['GET',    '/api/file/:slug'],
  ['GET',    '/api/file/:slug/:path'],
  ['GET',    '/api/site-files/:slug'],
  ['GET',    '/api/proj-file/:slug/:path'],
  ['PUT',    '/api/proj-file/:slug/:path'],
  ['DELETE', '/api/proj-file/:slug/:path'],

  // ---- 广场只读（浏览无害，写入见下）----
  ['GET',    '/api/play/posts'],
  ['GET',    '/api/play/posts/:id/comments'],
  ['GET',    '/api/play/my-sites'],
  ['GET',    '/api/play/me'],
  ['GET',    '/api/play/profile/:id'],
  ['GET',    '/api/play/profile/:id/posts'],
  ['GET',    '/api/play/follow/:type'],
  ['GET',    '/api/play/feed'],

  // ---- macOS 审核状态查询（只读）----
  ['GET',    '/api/macos/status'],
];

/** 编译成匹配用结构：预存分段，避免每次请求都 split */
const COMPILED = ALLOWLIST.map(([m, p]) => ({
  method: m,
  parts: p.split('/').filter(Boolean)
}));

function matchRule(rule, parts) {
  if (rule.parts.length !== parts.length) return false;
  for (let i = 0; i < parts.length; i++) {
    const rp = rule.parts[i];
    if (rp.startsWith(':')) continue;      // 占位符任意匹配
    if (rp !== parts[i]) return false;
  }
  return true;
}

/** 该请求使用的凭证是否有权访问此路由 */
function scopeAllows(method, pathParts) {
  for (const rule of COMPILED) {
    if (rule.method !== method) continue;
    if (matchRule(rule, pathParts)) return true;
  }
  return false;
}

/**
 * 统一的作用域闸门。
 * 只对「使用 API Key 的请求」生效；登录会话不受任何限制。
 *
 * @returns {Response|null} 需要拦截时返回 403 响应，否则 null
 */
function enforceApiKeyScope(request, env, corsHeaders, method, pathParts) {
  if (!isApiKeyRequest(request)) return null;   // 会话凭证：不受限
  if (scopeAllows(method, pathParts)) return null;

  console.warn('[apikey] blocked out-of-scope request', {
    method,
    path: '/' + pathParts.join('/')
  });
  return jsonResp({
    error: '该接口不支持 API 密钥，请使用登录会话',
    hint: 'API 密钥仅用于站点管理与文件操作；AI Copilot、广场互动、账号设置需登录后操作'
  }, 403, corsHeaders);
}

// jsonResp 从 response.js 引入会形成 utils 内部循环依赖的隐患，
// 这里内联一个最小实现保持模块自洽。
function jsonResp(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) }
  });
}

export { enforceApiKeyScope, ALLOWLIST };
