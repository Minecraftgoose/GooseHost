// ===== 管理员 - 站点详情 =====

import { isAdmin } from '../utils/jwt.js';
import { makeSupabase, storageUrl } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

// 宽松校验：支持中文、字母、数字、_ - . ~ /，长度 1~128
function isValidSlugWithSlash(slug) {
  return slug && slug.length >= 1 && slug.length <= 128 && /^[\u4e00-\u9fa5a-zA-Z0-9_\-.~/]+$/.test(slug);
}

async function listProjectFiles(env, ownerId, slug) {
  const out = [];
  let total = 0;
  async function walk(pfx, rel) {
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: pfx, limit: 1000, offset: 0 }),
    });
    if (!res.ok) return;
    const items = await res.json();
    for (const it of (items || [])) {
      const isDir = it.metadata == null;
      if (isDir) {
        await walk(pfx + it.name + '/', rel + it.name + '/');
      } else {
        const size = it.metadata?.size || 0;
        total += size;
        out.push({ name: rel + it.name, size });
      }
    }
  }
  await walk(`${ownerId}/${slug}/`, '');
  return { files: out, totalSize: total };
}

export async function handleAdminSiteDetail(request, env, corsHeaders, slugEncoded) {
  if (!await isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

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

    const isMarkdown = site.type === 'md';
    const cleanSlug = site.name;

    let content = '';
    const responseData = { ...site };

    if (site.type === 'project') {
      // 多文件站点：返回文件列表
      responseData.files = await listProjectFiles(env, site.owner_id, cleanSlug);
    } else if (isMarkdown) {
      const storagePath = `md/${site.owner_id}/${cleanSlug}/index.md`;
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
  if (!await isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

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
      .select('owner_id, name, type')
      .eq('name', slug)
      .maybeSingle();

    if (siteError || !site) {
      return jsonResp({ error: 'Site not found' }, 404, corsHeaders);
    }

    const isMarkdown = site.type === 'md';
    const cleanSlug = site.name;

    let storagePath, contentType, content;

    if (isMarkdown) {
      const md = body?.md;
      if (md === undefined) {
        return jsonResp({ success: true, message: '没有内容需要更新' }, 200, corsHeaders);
      }
      if (md.length > 500 * 1024) {
        return jsonResp({ error: 'Markdown 内容超过 500KB，你想撑死GooseHost吗？' }, 400, corsHeaders);
      }
      storagePath = `md/${site.owner_id}/${cleanSlug}/index.md`;
      contentType = 'text/markdown; charset=utf-8';
      content = md;
    } else {
      const html = body?.html;
      if (html === undefined) {
        return jsonResp({ success: true, message: '没有内容需要更新' }, 200, corsHeaders);
      }
      if (html.length > 500 * 1024) {
        return jsonResp({ error: 'HTML 超过 500KB，你想撑死GooseHost吗？' }, 400, corsHeaders);
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