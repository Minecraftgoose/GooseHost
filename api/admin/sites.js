// ===== 管理员 - 站点列表（分页）=====

import { isAdmin } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { fetchEmailMap } from '../utils/email-map.js';
import { jsonResp } from '../utils/response.js';

export async function handleAdminSites(request, env, corsHeaders) {
  if (!isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

  await checkRateLimit(request, env, 'normal');

  // 解析分页参数
  const urlParams = new URL(request.url).searchParams;
  const limit = Math.min(100, Math.max(1, parseInt(urlParams.get('limit')) || 50));
  const offsetParam = urlParams.get('offset');
  const offset = offsetParam !== null
    ? Math.max(0, parseInt(offsetParam) || 0)
    : (Math.max(1, parseInt(urlParams.get('page')) || 1) - 1) * limit;
  const orderBy = urlParams.get('order') || 'updated_at';
  const orderDir = urlParams.get('dir') || 'DESC';

  try {
    const supabase = makeSupabase(env);

    // 获取 email map
    const emailMap = await fetchEmailMap(env);

    // 尝试使用 RPC 函数获取分页站点列表
    const { data, error } = await supabase
      .rpc('get_sites_paginated', {
        p_limit: limit,
        p_offset: offset,
        p_order_by: orderBy,
        p_order_dir: orderDir
      });

    if (error) {
      console.error('RPC get_sites_paginated failed, falling back:', error.message);

      // 回退到原来的方式
      const { data: sites, error: fetchError } = await supabase
        .from('gh_site')
        .select('id, name, owner_id, ip_address, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);

      if (fetchError) throw fetchError;

      // 获取总数
      const { count } = await supabase
        .from('gh_site')
        .select('id', { count: 'exact', head: true });

      const sitesWithEmail = (sites || []).map(s => ({
        ...s,
        ownerEmail: emailMap[s.owner_id] || s.owner_id,
      }));

      return jsonResp({
        sites: sitesWithEmail,
        pagination: {
          page: 1,
          limit,
          total: count || 0,
          hasMore: offset + (sites?.length || 0) < (count || 0)
        }
      }, 200, corsHeaders);
    }

    // 格式化 RPC 返回数据
    const sites = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      owner_id: row.owner_id,
      ip_address: row.ip_address,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ownerEmail: emailMap[row.owner_id] || row.owner_id,
      totalCount: parseInt(row.total_count) || 0
    }));

    const totalCount = sites.length > 0 ? sites[0].totalCount : 0;
    // 移除 totalCount 字段
    sites.forEach(s => delete s.totalCount);

    return jsonResp({
      sites,
      pagination: {
        page: 1,
        limit,
        total: totalCount,
        hasMore: offset + sites.length < totalCount
      }
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
