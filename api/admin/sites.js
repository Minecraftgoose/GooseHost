// ===== 管理员 - 站点列表（服务端分页 + 服务端搜索）=====

import { isAdmin } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { fetchEmailMap } from '../utils/email-map.js';
import { jsonResp } from '../utils/response.js';

// 排序字段白名单：order/dir 直接来自 URL，禁止原样拼进查询
const ALLOWED_ORDER = {
  updated_at: 'updated_at',
  created_at: 'created_at',
  name: 'name',
  visit_count: 'visit_count',
};
const ALLOWED_DIR = { asc: 'ASC', desc: 'DESC' };

const SITE_COLS = 'id, name, type, owner_id, ip_address, created_at, updated_at, visit_count';

// 去掉 PostgREST 过滤语法里的特殊字符，避免用户输入被当成语法
function sanitizeQuery(q) {
  return String(q || '').replace(/["'(),.*%\\]/g, ' ').trim().slice(0, 64);
}

export async function handleAdminSites(request, env, corsHeaders) {
  if (!await isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

  await checkRateLimit(request, env, 'normal');

  const urlParams = new URL(request.url).searchParams;
  const limit = Math.min(100, Math.max(1, parseInt(urlParams.get('limit')) || 50));
  const offsetParam = urlParams.get('offset');
  const offset = offsetParam !== null
    ? Math.max(0, parseInt(offsetParam) || 0)
    : (Math.max(1, parseInt(urlParams.get('page')) || 1) - 1) * limit;
  const page = Math.floor(offset / limit) + 1;
  const orderBy = ALLOWED_ORDER[urlParams.get('order')] || 'updated_at';
  const orderDir = ALLOWED_DIR[(urlParams.get('dir') || '').toLowerCase()] || 'DESC';
  const q = sanitizeQuery(urlParams.get('q'));

  try {
    const supabase = makeSupabase(env);
    const emailMap = await fetchEmailMap(env);

    // 有搜索词时 RPC 不支持过滤条件，走直查 + count('exact')
    if (q) {
      const lower = q.toLowerCase();
      // 邮箱不在站点表里，先用内存映射反查命中的 uid
      const matchedIds = Object.keys(emailMap)
        .filter(uid => String(emailMap[uid] || '').toLowerCase().includes(lower))
        .slice(0, 200);

      const textParts = [`name.ilike."*${q}*"`, `ip_address.ilike."*${q}*"`];
      const buildOr = withIds => withIds && matchedIds.length
        ? `(${[...textParts, `owner_id.in.(${matchedIds.map(id => `"${id}"`).join(',')})`].join(',')})`
        : `(${textParts.join(',')})`;

      let query = supabase
        .from('gh_site')
        .select(SITE_COLS, { count: 'exact' })
        .or(buildOr(true))
        .order(orderBy, { ascending: orderDir === 'ASC' })
        .range(offset, offset + limit - 1);

      let { data: rows, error, count } = await query;

      // 兜底：部分 PostgREST 版本解析不了 or 里嵌套的 in.(...)，降级为纯文本匹配
      if (error) {
        console.error('sites search with owner_id.in failed, retrying text only:', error.message);
        ({ data: rows, error, count } = await supabase
          .from('gh_site')
          .select(SITE_COLS, { count: 'exact' })
          .or(buildOr(false))
          .order(orderBy, { ascending: orderDir === 'ASC' })
          .range(offset, offset + limit - 1));
      }

      if (error) throw error;

      const sites = (rows || []).map(s => ({
        ...s,
        ownerEmail: emailMap[s.owner_id] || s.owner_id,
      }));

      return jsonResp({
        sites,
        pagination: {
          page,
          limit,
          total: count || 0,
          hasMore: offset + sites.length < (count || 0)
        }
      }, 200, corsHeaders);
    }

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
      const { data: rows, error: fetchError, count } = await supabase
        .from('gh_site')
        .select(SITE_COLS, { count: 'exact' })
        .order(orderBy, { ascending: orderDir === 'ASC' })
        .range(offset, offset + limit - 1);

      if (fetchError) throw fetchError;

      const sites = (rows || []).map(s => ({
        ...s,
        ownerEmail: emailMap[s.owner_id] || s.owner_id,
      }));

      return jsonResp({
        sites,
        pagination: {
          page,
          limit,
          total: count || 0,
          hasMore: offset + sites.length < (count || 0)
        }
      }, 200, corsHeaders);
    }

    const sites = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      owner_id: row.owner_id,
      ip_address: row.ip_address,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ownerEmail: emailMap[row.owner_id] || row.owner_id,
      totalCount: parseInt(row.total_count) || 0
    }));

    const totalCount = sites.length > 0 ? sites[0].totalCount : 0;
    sites.forEach(s => delete s.totalCount);

    return jsonResp({
      sites,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasMore: offset + sites.length < totalCount
      }
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
