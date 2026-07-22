// ===== 更新站点 =====

import { marked } from 'marked';
import { getUserId, isValidSlug } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase, storageUrl } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

export async function handleUpdate(request, env, corsHeaders) {
  const userId = getUserId(request);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  await checkRateLimit(request, env, 'update');

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const slug = (body?.slug || '').trim();
  const htmlInput = body?.html || '';
  const mdInput = body?.md || '';

  // 处理 md/ 前缀
  const isMdSite = slug.startsWith('md/');
  const actualSlug = isMdSite ? slug.replace('md/', '') : slug;

  if (!isValidSlug(actualSlug)) {
    return jsonResp({ error: '站点名称无效' }, 400, corsHeaders);
  }

  const isMd = !!mdInput;
  const finalSlug = isMd ? `md/${actualSlug}` : actualSlug;

  try {
    const supabase = makeSupabase(env);

    // 检查站点是否存在且属于当前用户
    const { data: site, error: siteError } = await supabase
      .from('gh_site')
      .select('owner_id')
      .eq('name', finalSlug)
      .maybeSingle();

    if (siteError || !site) {
      return jsonResp({ error: 'Site not found' }, 404, corsHeaders);
    }

    if (site.owner_id !== userId) {
      return jsonResp({ error: 'Forbidden' }, 403, corsHeaders);
    }

    // 如果是 Markdown 模式，先转换为 HTML
    let html = htmlInput;
    let storageContent = htmlInput;
    let contentType = 'text/html; charset=utf-8';

    if (isMd) {
      html = marked.parse(mdInput);
      storageContent = mdInput;
      contentType = 'text/markdown; charset=utf-8';
    }

    if (html.length > 500 * 1024) {
      return jsonResp({ error: '内容超过 500KB' }, 400, corsHeaders);
    }

    // 更新文件 - Markdown 用 md/public，HTML 用 sites/
    const storagePath = isMd
      ? `md/public/${actualSlug}/index.md`
      : `sites/${userId}/${actualSlug}/index.html`;

    const storageRes = await fetch(storageUrl(env, storagePath), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: storageContent,
    });

    if (!storageRes.ok) {
      return jsonResp({ error: '文件上传失败' }, 500, corsHeaders);
    }

    return jsonResp({ success: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
