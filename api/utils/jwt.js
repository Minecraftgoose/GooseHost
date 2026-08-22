// ===== JWT 工具 =====

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

async function getUserId(request, env) {
  const header = request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.substring(7);

  // 向 Supabase Auth 验证 token
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

export { decodeJWTPayload, getUserId, isAdmin, isValidSlug };