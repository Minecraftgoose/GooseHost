// ===== 管理员 - 同步邮箱 =====

import { isAdmin } from '../utils/jwt.js';
import { syncEmailMap } from '../utils/email-map.js';
import { jsonResp } from '../utils/response.js';

export async function handleAdminSyncEmails(request, env, corsHeaders) {
  if (!isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

  const map = await syncEmailMap(env);
  if (!map) {
    return jsonResp({ error: '同步失败（无法访问 Supabase Auth API）' }, 500, corsHeaders);
  }

  return jsonResp({ success: true, count: Object.keys(map).length }, 200, corsHeaders);
}
