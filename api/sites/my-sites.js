// ===== 获取用户站点列表 =====

import { getUserId } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

export async function handleMySites(request, env, corsHeaders) {
  const userId = getUserId(request);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  await checkRateLimit(request, env, 'normal');

  try {
    const supabase = makeSupabase(env);

    const { data, error } = await supabase
      .from('gh_site')
      .select('id, name, created_at, updated_at, ip_address')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return jsonResp(data || [], 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
