// ===== 速率限制 =====

const RATE_LIMIT = {
  rapid:  { limit: 10, windowSec: 10 },
  create: { limit: 2,  windowSec: 60, lockoutSec: 600 },
  reg_ip: { limit: 5,  windowSec: 3600, lockoutSec: 3600 },
  update: { limit: 10, windowSec: 60 },
  normal: { limit: 100, windowSec: 60 },
  login:  { limit: 20, windowSec: 60 },   // 新增
};

function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
         'unknown';
}

async function checkRateLimit(request, env, action = 'normal') {
  const ip = getClientIP(request);
  const cfg = RATE_LIMIT[action] || RATE_LIMIT.normal;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / cfg.windowSec) * cfg.windowSec;
  const countKey = `rl:${ip}:${action}:${windowStart}`;

  if (action === 'create' && cfg.lockoutSec) {
    const lockKey = `lck:${ip}:create`;
    try {
      const locked = await env.RATE_LIMIT_KV.get(lockKey, 'text');
      if (locked) {
        const expiresAt = parseInt(locked, 10);
        if (expiresAt > now) {
          return { allowed: false, resetIn: expiresAt - now, locked: true };
        }
        await env.RATE_LIMIT_KV.delete(lockKey);
      }
    } catch (_) {}
  }

  if (!env.RATE_LIMIT_KV) {
    return { allowed: true };
  }

  try {
    const raw = await env.RATE_LIMIT_KV.get(countKey, 'text');
    const count = raw ? parseInt(raw, 10) : 0;

    if (count >= cfg.limit) {
      if (action === 'create' && cfg.lockoutSec) {
        const lockKey = `lck:${ip}:create`;
        const expiresAt = now + cfg.lockoutSec;
        await env.RATE_LIMIT_KV.put(lockKey, String(expiresAt), { expirationTtl: cfg.lockoutSec });
        await env.RATE_LIMIT_KV.delete(countKey);
        return { allowed: false, resetIn: cfg.lockoutSec, locked: true };
      }
      return { allowed: false, resetIn: cfg.windowSec - (now - windowStart) };
    }

    await env.RATE_LIMIT_KV.put(countKey, String(count + 1), { expirationTtl: cfg.windowSec + 30 });
  } catch (_) {}

  return { allowed: true };
}

export { RATE_LIMIT, getClientIP, checkRateLimit };