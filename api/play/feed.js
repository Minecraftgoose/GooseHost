// ===== 关注的人的动态 =====

import { getUserId } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';
import { decoratePosts, pageParams, ensureProfile } from './util.js';

// GET /api/play/feed - 关注流（登录）
export async function handlePlayFeed(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);

  const url = new URL(request.url);
  const { limit, page, offset } = pageParams(url);

  try {
    const supabase = makeSupabase(env);
    await ensureProfile(env, userId);

    const { data: follows, error: fErr } = await supabase
      .from('gh_play_follow')
      .select('following_id')
      .eq('follower_id', userId);
    if (fErr) throw fErr;

    const ids = (follows || []).map(f => f.following_id).filter(Boolean);
    if (!ids.length) {
      return jsonResp({
        posts: [],
        pagination: { page, limit, total: 0, has_more: false },
        hint: '还没关注任何人，去广场逛逛吧'
      }, 200, corsHeaders);
    }

    const { data, error, count } = await supabase
      .from('gh_play_post')
      .select('*', { count: 'exact' })
      .in('author_id', ids)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const posts = await decoratePosts(env, data || [], userId);

    return jsonResp({
      posts,
      pagination: { page, limit, total: count || 0, has_more: offset + posts.length < (count || 0) }
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
