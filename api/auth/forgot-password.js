// ===== 忘记密码：发送重置邮件 =====

import { checkRateLimit } from '../utils/rate-limit.js';
import { jsonResp } from '../utils/response.js';
import { fetchEmailMap } from '../utils/email-map.js';

const RESET_PAGE = 'https://host.goose.cc.cd/reset-password.html';

export async function handleForgotPassword(request, env, corsHeaders) {
  const rl_ip = await checkRateLimit(request, env, 'forgot_ip');
  if (!rl_ip.allowed) {
    return jsonResp({ error: `请求过于频繁，请在 ${Math.ceil(rl_ip.resetIn / 60)} 分钟后重试，有问题请联系support@mail.goose.cc.cd` }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const email = (body?.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{1,64}$/.test(email)) {
    return jsonResp({ error: '邮箱格式不正确' }, 400, corsHeaders);
  }

  const rl_email = await checkRateLimit(request, env, 'forgot_email', email);
  if (!rl_email.allowed) {
    return jsonResp({ error: '该邮箱请求过于频繁，请稍后再试' }, 429, corsHeaders);
  }

  try {
    const map = await fetchEmailMap(env);
    const emailExists = Object.values(map).includes(email);
    if (!emailExists) {
      return jsonResp({
        success: true,
        message: '如果该邮箱已注册，重置链接已发送，请查收邮件'
      }, 200, corsHeaders);
    }

    await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, redirect_to: RESET_PAGE }),
    });
    return jsonResp({
      success: true,
      message: '重置链接已发送，请检查收件箱'
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: '发送失败，请稍后再试' }, 500, corsHeaders);
  }
}
