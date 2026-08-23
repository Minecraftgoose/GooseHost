// ===== 获取站点文件内容 =====

import { getUserId, isValidSlug } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase, storageUrl } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

export async function handleGetFile(request, env, corsHeaders, slug) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  const actualSlug = slug.startsWith('md/') ? slug.replace('md/', '') : slug;

  if (!isValidSlug(actualSlug)) {
    return jsonResp({ error: '站点名称无效' }, 400, corsHeaders);
  }

  await checkRateLimit(request, env, 'rapid');

  try {
    const supabase = makeSupabase(env);

    const { data: site, error: siteError } = await supabase
      .from('gh_site')
      .select('owner_id, type')
      .eq('name', actualSlug)
      .maybeSingle();

    if (siteError || !site) {
      return jsonResp({ error: 'Site not found' }, 404, corsHeaders);
    }

    if (site.owner_id !== userId) {
      return jsonResp({ error: 'Forbidden' }, 403, corsHeaders);
    }

    const isMdSite = site.type === 'md';
    const storagePath = isMdSite
      ? `md/${site.owner_id}/${actualSlug}/index.md`
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
