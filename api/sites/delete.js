// ===== 删除站点 =====

import { getUserId, isValidSlug } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

export async function handleDelete(request, env, corsHeaders) {
  const userId = getUserId(request);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  await checkRateLimit(request, env, 'normal');

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const slug = (body?.slug || '').trim();

  // 处理 md/ 前缀
  const isMarkdown = slug.startsWith('md/');
  const actualSlug = isMarkdown ? slug.replace('md/', '') : slug;
  const finalSlug = isMarkdown ? slug : actualSlug;

  if (!isValidSlug(actualSlug)) {
    return jsonResp({ error: '站点名称无效' }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    // 先获取站点信息（需要 owner_id 来删除存储文件）
    const { data: site, error: fetchError } = await supabase
      .from('gh_site')
      .select('owner_id')
      .eq('name', finalSlug)
      .eq('owner_id', userId)
      .maybeSingle();

    if (fetchError || !site) {
      return jsonResp({ error: 'Site not found' }, 404, corsHeaders);
    }

    // 删除数据库记录
    const { error: delError } = await supabase
      .from('gh_site')
      .delete()
      .eq('name', finalSlug)
      .eq('owner_id', userId);

    if (delError) throw delError;

    // 删除存储文件（区分 HTML 和 Markdown）
    const bucket = isMarkdown ? 'md' : 'sites';
    const filePath = isMarkdown 
      ? `public/${actualSlug}/index.md` 
      : `${userId}/${actualSlug}/index.html`;
    
    try {
      await supabase.storage.from(bucket).remove([filePath]);
    } catch (err) {
      console.error('删除存储文件失败:', err.message);
      // 不影响整体操作，只记录错误
    }

    return jsonResp({ success: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}