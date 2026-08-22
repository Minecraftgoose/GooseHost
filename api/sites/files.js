// ===== 获取站点文件列表）=====

import { getUserId } from '../utils/jwt.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

// 递归列出桶内文件，返回相对路径
async function listAllFiles(env, bucket, prefix) {
  const out = [];
  async function walk(pfx, rel) {
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
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
        out.push({ name: rel + it.name, size: it.metadata?.size || 0 });
      }
    }
  }
  await walk(prefix, '');
  return out;
}

export async function handleSiteFiles(request, env, corsHeaders, slug) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  const actualSlug = slug.startsWith('md/') ? slug.replace('md/', '') : slug;

  try {
    const supabase = makeSupabase(env);
    const { data: site, error: siteError } = await supabase
      .from('gh_site')
      .select('owner_id, type, name, created_at, updated_at, visit_count')
      .eq('name', actualSlug)
      .maybeSingle();

    if (siteError || !site) {
      return jsonResp({ error: 'Site not found' }, 404, corsHeaders);
    }
    if (site.owner_id !== userId) {
      return jsonResp({ error: 'Forbidden' }, 403, corsHeaders);
    }

    let files = [];
    if (site.type === 'project') {
      files = await listAllFiles(env, 'projects', `${site.owner_id}/${actualSlug}/`);
    } else {
      files = [{ name: site.type === 'md' ? 'index.md' : 'index.html', size: null }];
    }

    return jsonResp({ site, files }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
