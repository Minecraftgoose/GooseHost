// ===== 重置密码：用邮件里的 token 设置新密码 =====

import { checkRateLimit } from '../utils/rate-limit.js';
import { jsonResp } from '../utils/response.js';

export async function handleResetPassword(request, env, corsHeaders) {
  const rl = await checkRateLimit(request, env, 'reset');
  if (!rl.allowed) {
    return jsonResp({ error: `请求过于频繁，请在 ${Math.ceil(rl.resetIn / 60)} 分钟后重试` }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const token = (body?.token || '').trim();
  const password = body?.password || '';

  if (!token) {
    return jsonResp({ error: '无效的重置链接' }, 400, corsHeaders);
  }
  if (!password || password.length < 6) {
    return jsonResp({ error: '密码至少 6 位' }, 400, corsHeaders);
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return jsonResp({ error: data.msg || '重置失败，链接可能已过期' }, res.status, corsHeaders);
    }
    return jsonResp({ success: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: '重置失败，请重试' }, 500, corsHeaders);
  }
}
