// ===== 公告 =====

import { isAdmin } from '../utils/jwt.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

// GET /api/announcement - 激活公告
export async function handleGetAnnouncement(request, env, corsHeaders) {
  try {
    const supabase = makeSupabase(env);
    const { data, error } = await supabase
      .from('gh_announcement')
      .select('content, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonResp({ announcement: null }, 200, corsHeaders);
    return jsonResp({ announcement: data.content, created_at: data.created_at }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// POST /api/admin/announcement - admin 发公告 / 停用
// body: { content?: string, action: 'set' | 'clear' }
export async function handleAdminAnnouncement(request, env, corsHeaders) {
  if (!await isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }
  let body;
  try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400, corsHeaders); }

  const supabase = makeSupabase(env);
  const action = body?.action || 'set';

  try {
    if (action === 'clear') {
      const { error } = await supabase
        .from('gh_announcement')
        .update({ is_active: false })
        .eq('is_active', true);
      if (error) throw error;
      return jsonResp({ success: true, message: '公告已清除' }, 200, corsHeaders);
    }

    const content = (body?.content || '').trim();
    if (!content) return jsonResp({ error: '公告内容不能为空' }, 400, corsHeaders);
    if (content.length > 500) return jsonResp({ error: '公告内容超过 500 字符' }, 400, corsHeaders);

    await supabase.from('gh_announcement').update({ is_active: false }).eq('is_active', true);
    const { data, error } = await supabase
      .from('gh_announcement')
      .insert({ content, is_active: true })
      .select('id, content, created_at')
      .single();
    if (error) throw error;
    return jsonResp({ success: true, announcement: data }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
