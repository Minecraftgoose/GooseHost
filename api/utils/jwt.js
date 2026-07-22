// ===== JWT 工具 =====

function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}

function getUserId(request) {
  const header = request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  return decodeJWT(header.substring(7))?.sub || null;
}

function isAdmin(request, env) {
  const userId = getUserId(request);
  if (!userId) return false;
  const adminIds = (env.ADMIN_USER_IDS || '').split(',').filter(Boolean);
  return adminIds.includes(userId);
}

function isValidSlug(slug) {
  return slug?.length >= 1 && slug.length <= 64 && /^[a-zA-Z0-9_\-.~]+$/.test(slug);
}

export { decodeJWT, getUserId, isAdmin, isValidSlug };
