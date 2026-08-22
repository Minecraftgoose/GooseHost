// ===== 删除站点 =====

import { getUserId, isValidSlug } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

export async function handleDelete(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  await checkRateLimit(request, env, 'normal');

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const slug = (body?.slug || '').trim();

  // 兼容旧格式：slug 带 md/ 前缀时剥掉
  const actualSlug = slug.startsWith('md/') ? slug.replace('md/', '') : slug;

  if (!isValidSlug(actualSlug)) {
    return jsonResp({ error: '站点名称无效' }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    // 先获取站点信息
    const { data: site, error: fetchError } = await supabase
      .from('gh_site')
      .select('owner_id, type')
      .eq('name', actualSlug)
      .eq('owner_id', userId)
      .maybeSingle();

    if (fetchError || !site) {
      return jsonResp({ error: 'Site not found' }, 404, corsHeaders);
    }

    // 删除数据库记录
    const { error: delError } = await supabase
      .from('gh_site')
      .delete()
      .eq('name', actualSlug)
      .eq('owner_id', userId);

    if (delError) throw delError;

    // 删除存储文件
    const isMarkdown = site.type === 'md';
    const bucket = isMarkdown ? 'md' : 'sites';
    const filePath = isMarkdown 
      ? `${site.owner_id}/${actualSlug}/index.md` 
      : `${userId}/${actualSlug}/index.html`;
    
    try {
      await supabase.storage.from(bucket).remove([filePath]);
    } catch (err) {
      console.error('删除存储文件失败:', err.message);
    }

    return jsonResp({ success: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}