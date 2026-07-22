// ===== 管理员 - 用户列表（分页）=====

import { isAdmin } from '../utils/jwt.js';
import { makeSupabase } from '../utils/supabase.js';
import { fetchEmailMap } from '../utils/email-map.js';
import { jsonResp } from '../utils/response.js';
import { getPublicBaseUrl } from '../utils/site-url.js';

// 辅助：根据站点名称构建正确的 URL 路径
function buildSiteUrl(name) {
  if (name.startsWith('md/')) {
    const slug = name.replace('md/', '');
    return `/md/${encodeURIComponent(slug)}`;
  } else {
    return `/s/${encodeURIComponent(name)}`;
  }
}

export async function handleAdminUsers(request, env, corsHeaders) {
  if (!isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

  const urlParams = new URL(request.url).searchParams;
  const limit = Math.min(100, Math.max(1, parseInt(urlParams.get('limit')) || 50));
  const offsetParam = urlParams.get('offset');
  const offset = offsetParam !== null
    ? Math.max(0, parseInt(offsetParam) || 0)
    : (Math.max(1, parseInt(urlParams.get('page')) || 1) - 1) * limit;

  try {
    const supabase = makeSupabase(env);
    const emailMap = await fetchEmailMap(env);

    const { data, error } = await supabase
      .rpc('get_users_paginated', { p_limit: limit, p_offset: offset });

    if (error) {
      console.error('RPC get_users_paginated failed, falling back:', error.message);
      
      const { data: allSites, error: sitesError } = await supabase
        .from('gh_site')
        .select('owner_id, name, created_at')
        .order('created_at', { ascending: false });

      if (sitesError) {
        return jsonResp({ error: 'DB error: ' + sitesError.message }, 500, corsHeaders);
      }

      const owners = {};
      const ownerOrder = [];

      allSites?.forEach(s => {
        if (!owners[s.owner_id]) {
          owners[s.owner_id] = {
            id: s.owner_id,
            email: emailMap[s.owner_id] || s.owner_id,
            siteCount: 0,
            sites: [],
            createdAt: s.created_at,
          };
          ownerOrder.push(s.owner_id);
        }
        owners[s.owner_id].sites.push({ 
          name: s.name, 
          url: `${getPublicBaseUrl(env)}${buildSiteUrl(s.name)}` 
        });
        owners[s.owner_id].siteCount++;
        if (new Date(s.created_at) < new Date(owners[s.owner_id].createdAt)) {
          owners[s.owner_id].createdAt = s.created_at;
        }
      });

      const users = ownerOrder.map(id => owners[id]);

      return jsonResp({
        users,
        pagination: { page: 1, limit, total: users.length, hasMore: false }
      }, 200, corsHeaders);
    }

    const users = (data || []).map(row => ({
      id: row.owner_id,
      email: row.email,
      siteCount: parseInt(row.site_count),
      createdAt: row.created_at,
      sites: (row.sites || []).map(s => ({ 
        name: s.name, 
        url: `${getPublicBaseUrl(env)}${buildSiteUrl(s.name)}` 
      }))
    }));

    const totalCount = users.length > 0 ? parseInt(users[0]?.total_count || users.length) : 0;

    return jsonResp({
      users,
      pagination: {
        page: 1,
        limit,
        total: totalCount,
        hasMore: offset + users.length < totalCount
      }
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}