// ===== 管理员 - 站点详情 =====

import { isAdmin } from '../utils/jwt.js';
import { makeSupabase, storageUrl } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

// 宽松校验：支持中文、字母、数字、_ - . ~ /，长度 1~128
function isValidSlugWithSlash(slug) {
  return slug && slug.length >= 1 && slug.length <= 128 && /^[\u4e00-\u9fa5a-zA-Z0-9_\-.~/]+$/.test(slug);
}

export async function handleAdminSiteDetail(request, env, corsHeaders, slugEncoded) {
  if (!isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

  // 解码 slug
  let slug;
  try {
    slug = decodeURIComponent(slugEncoded);
  } catch {
    return jsonResp({ error: '站点名称无效' }, 400, corsHeaders);
  }

  if (!isValidSlugWithSlash(slug)) {
    return jsonResp({ error: '站点名称无效' }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    const { data: site, error: siteError } = await supabase
      .from('gh_site')
      .select('*')
      .eq('name', slug)
      .maybeSingle();

    if (siteError || !site) {
      return jsonResp({ error: 'Site not found' }, 404, corsHeaders);
    }

    const isMarkdown = site.name.startsWith('md/');
    const cleanSlug = isMarkdown ? site.name.replace('md/', '') : site.name;

    let content = '';
    const responseData = { ...site };

    if (isMarkdown) {
      const storagePath = `md/public/${cleanSlug}/index.md`;
      const storageRes = await fetch(storageUrl(env, storagePath), {
        headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      });
      if (storageRes.ok) content = await storageRes.text();
      responseData.md = content;
    } else {
      const storagePath = `sites/${site.owner_id}/${cleanSlug}/index.html`;
      const storageRes = await fetch(storageUrl(env, storagePath), {
        headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      });
      if (storageRes.ok) content = await storageRes.text();
      responseData.html = content;
    }

    return jsonResp(responseData, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

export async function handleAdminSiteUpdate(request, env, corsHeaders, slugEncoded) {
  if (!isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

  // 解码 slug
  let slug;
  try {
    slug = decodeURIComponent(slugEncoded);
  } catch {
    return jsonResp({ error: '站点名称无效' }, 400, corsHeaders);
  }

  if (!isValidSlugWithSlash(slug)) {
    return jsonResp({ error: '站点名称无效' }, 400, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    const { data: site, error: siteError } = await supabase
      .from('gh_site')
      .select('owner_id, name')
      .eq('name', slug)
      .maybeSingle();

    if (siteError || !site) {
      return jsonResp({ error: 'Site not found' }, 404, corsHeaders);
    }

    const isMarkdown = site.name.startsWith('md/');
    const cleanSlug = isMarkdown ? site.name.replace('md/', '') : site.name;

    let storagePath, contentType, content;

    if (isMarkdown) {
      const md = body?.md;
      if (md === undefined) {
        return jsonResp({ success: true, message: '没有内容需要更新' }, 200, corsHeaders);
      }
      if (md.length > 500 * 1024) {
        return jsonResp({ error: 'Markdown 内容超过 500KB' }, 400, corsHeaders);
      }
      storagePath = `md/public/${cleanSlug}/index.md`;
      contentType = 'text/markdown; charset=utf-8';
      content = md;
    } else {
      const html = body?.html;
      if (html === undefined) {
        return jsonResp({ success: true, message: '没有内容需要更新' }, 200, corsHeaders);
      }
      if (html.length > 500 * 1024) {
        return jsonResp({ error: 'HTML 超过 500KB' }, 400, corsHeaders);
      }
      storagePath = `sites/${site.owner_id}/${cleanSlug}/index.html`;
      contentType = 'text/html; charset=utf-8';
      content = html;
    }

    const storageRes = await fetch(storageUrl(env, storagePath), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: content,
    });

    if (!storageRes.ok) {
      return jsonResp({ error: '文件上传失败' }, 500, corsHeaders);
    }

    return jsonResp({ success: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}