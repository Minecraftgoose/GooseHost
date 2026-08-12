// ===== Debug 接口 =====

import { makeSupabase } from './utils/supabase.js';
import { syncEmailMap } from './utils/email-map.js';
import { jsonResp } from './utils/response.js';
import { cleanupOrphanUsers } from './jobs/cleanup.js';

// Service Role Key 验证的同步邮箱
export async function handleDebugSyncEmails(request, env, corsHeaders) {
  const header = request.headers.get('Authorization') || '';
  if (header !== `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  const map = await syncEmailMap(env);
  if (!map) {
    return jsonResp({ error: '同步失败（无法访问 Supabase Auth API）' }, 500, corsHeaders);
  }

  return jsonResp({ success: true, count: Object.keys(map).length }, 200, corsHeaders);
}

// 测试 Supabase SDK deleteUser
export async function handleDebugTestAuth(request, env, corsHeaders) {
  const url = new URL(request.url);
  const testId = url.searchParams.get('id') || '789c1a30-bd1d-4a4b-9c41-0e56d6ff536f';

  const supabase = makeSupabase(env);

  try {
    const r = await supabase.auth.admin.deleteUser(testId);
    return jsonResp({
      result: { message: r.error?.message, status: r.error?.status, code: r.error?.code },
      userId: testId
    }, 200, corsHeaders);
  } catch (e) {
    return jsonResp({ threw: e.message, userId: testId }, 500, corsHeaders);
  }
}

// 手动触发清理孤立用户（带 Secret）
export async function handleDebugCleanup(request, env, corsHeaders) {
  const secret = request.headers.get('X-Cron-Secret') || '';
  if (secret !== env.CRON_SECRET) {
    return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  try {
    const result = await cleanupOrphanUsers(env);
    return jsonResp(result, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// 版本信息
export async function handleVersion(request, env, corsHeaders) {
  return new Response(JSON.stringify({ v: 6, ts: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
