// ===== JWT / 凭证工具 =====

import { resolveApiKey, isApiKeyFormat } from './apikey.js';

function decodeJWTPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(b64 + pad);
    return JSON.parse(new TextDecoder().decode(new Uint8Array([...binary].map(c => c.charCodeAt(0)))));
  } catch { return null; }
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.substring(7).trim();
}

/** 本次请求是否使用 API Key 认证（而非登录会话 JWT） */
function isApiKeyRequest(request) {
  const t = bearerToken(request);
  return !!(t && isApiKeyFormat(t));
}

/**
 * 从请求中解析出用户 ID。
 *
 * 两条路径：
 *   · gooseh- 前缀 → 查 KV 里的 API Key（长期凭证，不参与 refresh 轮换，适合 CLI）
 *   · 其它         → 走 Supabase /auth/v1/user 校验会话 JWT
 *
 * 这样设计的好处：所有已存在的业务路由无需改动，
 * 只要它们调用 getUserId 就自动支持 API Key。
 */
async function getUserId(request, env) {
  const token = bearerToken(request);
  if (!token) return null;

  // ---- 路径 1：API Key ----
  if (isApiKeyFormat(token)) {
    const rec = await resolveApiKey(token, env);
    return rec ? rec.userId : null;
  }

  // ---- 路径 2：Supabase 会话 JWT ----
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  if (!supabaseUrl) {
    return decodeJWTPayload(token)?.sub || null;
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'apikey': env.SUPABASE_ANON_KEY || '',
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) {
      console.error('Auth verify failed:', res.status, await res.text().catch(()=>''));
      return null;
    }
    const user = await res.json();
    return user.id || null;
  } catch (e) {
    console.error('Auth verify error:', e.message);
    return null;
  }
}

async function isAdmin(request, env) {
  const userId = await getUserId(request, env);
  if (!userId) return false;
  const adminIds = (env.ADMIN_USER_IDS || '').split(',').filter(Boolean);
  return adminIds.includes(userId);
}

function isValidSlug(slug) {
  return slug?.length >= 1 && slug.length <= 64 && /^[a-zA-Z0-9_\-.~]+$/.test(slug);
}

export { decodeJWTPayload, getUserId, isAdmin, isValidSlug, isApiKeyRequest, bearerToken };
