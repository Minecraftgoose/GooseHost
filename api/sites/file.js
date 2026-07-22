// ===== 获取站点文件内容 =====

import { getUserId, isValidSlug } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase, storageUrl } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

export async function handleGetFile(request, env, corsHeaders, slug) {
  const userId = getUserId(request);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  // 处理 md/ 前缀
  const isMdSite = slug.startsWith('md/');
  const actualSlug = isMdSite ? slug.replace('md/', '') : slug;

  if (!isValidSlug(actualSlug)) {
    return jsonResp({ error: '站点名称无效' }, 400, corsHeaders);
  }

  await checkRateLimit(request, env, 'rapid');

  try {
    const supabase = makeSupabase(env);

    // 用完整 slug 查询（包括 md/ 前缀）
    const fullSlug = isMdSite ? slug : actualSlug;
    const { data: site, error: siteError } = await supabase
      .from('gh_site')
      .select('owner_id')
      .eq('name', fullSlug)
      .maybeSingle();

    if (siteError || !site) {
      return jsonResp({ error: 'Site not found' }, 404, corsHeaders);
    }

    if (site.owner_id !== userId) {
      return jsonResp({ error: 'Forbidden' }, 403, corsHeaders);
    }

    // 获取文件内容 - Markdown 用 md/public，HTML 用 sites/
    const storagePath = isMdSite
      ? `md/public/${actualSlug}/index.md`
      : `sites/${userId}/${actualSlug}/index.html`;

    const storageRes = await fetch(storageUrl(env, storagePath), {
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });

    if (!storageRes.ok) {
      return jsonResp(isMdSite ? { md: '' } : { html: '' }, 200, corsHeaders);
    }

    const content = await storageRes.text();
    return jsonResp(isMdSite ? { md: content } : { html: content }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
