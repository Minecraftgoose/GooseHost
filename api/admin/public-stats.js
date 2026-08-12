// ===== 公开统计（官网首页用）=====

import { makeSupabase } from '../utils/supabase.js';

// GET /api/stats - 全站统计（公开，纯 DB 查询避免子请求超限）
export async function handlePublicStats(request, env, corsHeaders) {
  try {
    const supabase = makeSupabase(env);

    const { data: agg, error: aggError } = await supabase
      .from('gh_site')
      .select('visit_count');

    if (aggError) throw aggError;
    const rows = agg || [];
    const totalVisits = rows.reduce((s, r) => s + (Number(r.visit_count) || 0), 0);
    const totalSites = rows.length;

    return new Response(JSON.stringify({ total_sites: totalSites, total_visits: totalVisits }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders, 'Cache-Control': 'public, max-age=60' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
