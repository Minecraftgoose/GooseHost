// ===== 管理员 - 统计信息 =====

import { isAdmin } from '../utils/jwt.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

export async function handleAdminStats(request, env, corsHeaders) {
  if (!isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    // 尝试使用 RPC 函数进行服务端聚合统计
    const { data, error } = await supabase.rpc('get_site_stats');

    if (error) {
      console.error('RPC get_site_stats failed, falling back:', error.message);
      
      // 回退到原来的方式
      const { data: sites, error: sitesError } = await supabase
        .from('gh_site')
        .select('id, created_at, owner_id');

      if (sitesError) throw sitesError;

      const uniqueOwners = new Set(sites?.map(s => s.owner_id) || []);
      const today = new Date().toISOString().split('T')[0];
      const sitesToday = sites?.filter(s => s.created_at.startsWith(today)).length || 0;

      return jsonResp({
        totalSites: sites?.length || 0,
        totalUsers: uniqueOwners.size,
        sitesToday
      }, 200, corsHeaders);
    }

    // RPC 返回的是数组，取第一条
    const stats = Array.isArray(data) ? data[0] : data;

    return jsonResp({
      totalSites: parseInt(stats?.total_sites) || 0,
      totalUsers: parseInt(stats?.total_users) || 0,
      sitesToday: parseInt(stats?.sites_today) || 0
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
