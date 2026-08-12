// ===== 刷新登录会话（代理 Supabase refresh_token 换新 access_token） =====

import { checkRateLimit } from '../utils/rate-limit.js';
import { jsonResp } from '../utils/response.js';

export async function handleRefresh(request, env, corsHeaders) {
  const rl = await checkRateLimit(request, env, 'normal');
  if (!rl.allowed) {
    return jsonResp({ error: '请求过于频繁' }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON' }, 400, corsHeaders);
  }
  const refresh_token = (body?.refresh_token || '').trim();
  if (!refresh_token) {
    return jsonResp({ error: '缺少 refresh_token' }, 400, corsHeaders);
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token }),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
