// ===== 用户注册 =====

import { checkRateLimit } from '../utils/rate-limit.js';
import { fetchEmailMap, saveEmailMap } from '../utils/email-map.js';
import { jsonResp } from '../utils/response.js';
import { isDisposableEmail } from './blocked-emails.js';

export async function handleRegister(request, env, corsHeaders) {
  // Check per-IP registration limit (5 per hour)
  const rl_ip = await checkRateLimit(request, env, 'reg_ip');
  if (!rl_ip.allowed) {
    return jsonResp({ error: '注册过于频繁，请稍后再试' }, 429, corsHeaders);
  }
  
  const rl = await checkRateLimit(request, env, 'create');
  if (!rl.allowed) {
    return jsonResp({
      error: `操作过于频繁，请在 ${Math.ceil((rl.resetIn || 60) / 60)} 分钟后重试`,
      retryAfter: Math.ceil(rl.resetIn || 60)
    }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const email = (body?.email || '').trim().toLowerCase();
  const password = body?.password || '';

  if (!email || !password) {
    return jsonResp({ error: '邮箱和密码不能为空' }, 400, corsHeaders);
  }

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResp({ error: '邮箱格式不正确' }, 400, corsHeaders);
  }

  // Block disposable/temporary email domains
  if (isDisposableEmail(email)) {
    return jsonResp({ error: '暂不支持该临时邮箱，请使用真实邮箱' }, 400, corsHeaders);
  }

  // Register via Supabase Auth REST API
  const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const authData = await authRes.json();

  if (!authRes.ok) {
    return jsonResp({ error: authData.msg || authData.error || '注册失败' }, authRes.status, corsHeaders);
  }

  // Save email to the map (best effort)
  if (authData.id) {
    const map = await fetchEmailMap(env);
    map[authData.id] = email;
    await saveEmailMap(env, map);
  }

  return jsonResp({ success: true }, 200, corsHeaders);
}
