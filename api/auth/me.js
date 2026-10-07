// ===== 当前用户信息=====

import { jsonResp } from '../utils/response.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { resolveApiKey, isApiKeyFormat } from '../utils/apikey.js';
import { makeSupabase } from '../utils/supabase.js';

function extractNickname(user) {
  if (!user) return '';
  const meta = user.user_metadata || user.raw_user_meta_data || {};
  const nick = meta && meta.nickname;
  return (typeof nick === 'string') ? nick.trim() : '';
}

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.substring(7).trim();
}

/**
 * 用 API Key 时无法通过 Supabase 的 /auth/v1/user 拿资料
 * （那个接口只认会话 JWT），这里改用 service role 按 userId 反查。
 */
async function meByApiKey(userId, env) {
  try {
    const supabase = makeSupabase(env);
    const { data } = await supabase.auth.admin.getUserById(userId);
    const user = data?.user;
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      nickname: extractNickname(user),
      authType: 'api_key'
    };
  } catch {
    return null;
  }
}

// GET /api/me - 返回当前用户基本信息
export async function handleGetMe(request, env, corsHeaders) {
  const token = bearerToken(request);
  if (!token) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  // ---- API Key 路径 ----
  if (isApiKeyFormat(token)) {
    const rec = await resolveApiKey(token, env);
    if (!rec) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);
    const info = await meByApiKey(rec.userId, env);
    if (!info) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);
    return jsonResp(info, 200, corsHeaders);
  }

  // ---- 会话 JWT 路径 ----
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
      nickname: extractNickname(user),
      authType: 'session'
    }, 200, corsHeaders);
  } catch {
    return jsonResp({ error: '服务器错误' }, 500, corsHeaders);
  }
}

// PUT /api/me - 更新昵称
export async function handleUpdateMe(request, env, corsHeaders) {
  const token = bearerToken(request);
  if (!token) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  // 改昵称属于账号设置，只允许登录会话操作
  if (isApiKeyFormat(token)) {
    return jsonResp({ error: '修改账号信息需使用登录会话' }, 403, corsHeaders);
  }

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
