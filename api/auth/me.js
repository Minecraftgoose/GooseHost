// ===== 当前用户信息=====

import { jsonResp } from '../utils/response.js';
import { checkRateLimit } from '../utils/rate-limit.js';

function extractNickname(user) {
  if (!user) return '';
  const meta = user.user_metadata || user.raw_user_meta_data || {};
  const nick = meta && meta.nickname;
  return (typeof nick === 'string') ? nick.trim() : '';
}

// GET /api/me - 返回当前用户基本信息
export async function handleGetMe(request, env, corsHeaders) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);
  }
  const token = auth.substring(7);

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': env.SUPABASE_ANON_KEY || '',
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);
    const user = await res.json();
    return jsonResp({
      id: user.id,
      email: user.email,
      nickname: extractNickname(user)
    }, 200, corsHeaders);
  } catch {
    return jsonResp({ error: '服务器错误' }, 500, corsHeaders);
  }
}

// PUT /api/me - 更新昵称
export async function handleUpdateMe(request, env, corsHeaders) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);
  }
  const token = auth.substring(7);

  const rl = await checkRateLimit(request, env, 'me_update');
  if (!rl.allowed) {
    return jsonResp({ error: `操作过于频繁，请在 ${Math.ceil(rl.resetIn)} 秒后重试` }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const nickname = (body?.nickname || '').trim();
  if (!nickname) {
    return jsonResp({ error: '昵称不能为空' }, 400, corsHeaders);
  }
  if (nickname.length < 2 || nickname.length > 20) {
    return jsonResp({ error: '昵称长度需为 2-20 个字符' }, 400, corsHeaders);
  }
  if (!/^[一-龥a-zA-Z0-9_ \-]+$/.test(nickname)) {
    return jsonResp({ error: '昵称仅支持中英文、数字、下划线、空格和连字符' }, 400, corsHeaders);
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY || '',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: { nickname } })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return jsonResp({ error: err.msg || err.message || '更新失败' }, res.status, corsHeaders);
    }
    const user = await res.json();
    return jsonResp({ success: true, nickname: extractNickname(user) }, 200, corsHeaders);
  } catch {
    return jsonResp({ error: '服务器错误' }, 500, corsHeaders);
  }
}
