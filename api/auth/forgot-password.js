// ===== 忘记密码：发送重置邮件 =====

import { checkRateLimit } from '../utils/rate-limit.js';
import { jsonResp } from '../utils/response.js';
import { fetchEmailMap } from '../utils/email-map.js';

// 重置邮件点击后跳回的前端页面（必须在 Supabase Auth 的 Redirect URLs 白名单内）
const RESET_PAGE = 'https://host.goose.gs.cn/reset-password.html';

export async function handleForgotPassword(request, env, corsHeaders) {
  // 每 IP 限流：每小时最多 5 次，防批量探测邮箱
  const rl_ip = await checkRateLimit(request, env, 'forgot_ip');
  if (!rl_ip.allowed) {
    return jsonResp({ error: `请求过于频繁，请在 ${Math.ceil(rl_ip.resetIn / 60)} 分钟后重试` }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const email = (body?.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResp({ error: '邮箱格式不正确' }, 400, corsHeaders);
  }

  // 每邮箱限流：每小时最多 3 次，防对单一邮箱邮件轰炸
  const rl_email = await checkRateLimit(request, env, 'forgot_email', email);
  if (!rl_email.allowed) {
    return jsonResp({ error: '该邮箱请求过于频繁，请稍后再试' }, 429, corsHeaders);
  }

  try {
    // 先查 email-map，邮箱不存在则直接返回成功（防枚举，不调 Supabase）
    const map = await fetchEmailMap(env);
    const emailExists = Object.values(map).includes(email);
    if (!emailExists) {
      return jsonResp({
        success: true,
        message: '如果该邮箱已注册，重置链接已发送，请查收邮件'
      }, 200, corsHeaders);
    }

    // 邮箱存在，发送重置邮件
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
      message: '如果该邮箱已注册，重置链接已发送，请查收邮件'
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: '发送失败，请稍后再试' }, 500, corsHeaders);
  }
}
