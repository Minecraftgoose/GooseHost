// ===== 代理登录 =====

import { checkRateLimit } from '../utils/rate-limit.js';
import { jsonResp } from '../utils/response.js';

export async function handleLogin(request, env, corsHeaders) {
  const rl_ip = await checkRateLimit(request, env, 'login');
  if (!rl_ip.allowed) {
    return jsonResp({
      error: rl_ip.locked
        ? `操作过于频繁，请在 ${Math.ceil(rl_ip.resetIn / 60)} 分钟后重试`
        : `请求过于频繁，请在 ${Math.ceil(rl_ip.resetIn)} 秒后重试`,
      retryAfter: Math.ceil(rl_ip.resetIn)
    }, 429, corsHeaders);
  }

  try {
    const { email, password } = await request.json();
    
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch {
    return jsonResp({ error: '服务器错误' }, 500, corsHeaders);
  }
}