import { isAdmin } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { fetchEmailMap } from '../utils/email-map.js';
import { jsonResp } from '../utils/response.js';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PAGE_SIZE = 50;

function pager(urlParams) {
  const page = Math.max(1, parseInt(urlParams.get('page')) || 1);
  const offset = Math.max(0, parseInt(urlParams.get('offset')) || (page - 1) * PAGE_SIZE);
  return { page, offset, limit: PAGE_SIZE };
}

async function profileMap(env, ids) {
  const map = new Map();
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return map;

  const supabase = makeSupabase(env);
  const emailMap = await fetchEmailMap(env);

  const { data } = await supabase
    .from('gh_play_profile')
    .select('id, nickname, avatar_url, bio')
    .in('id', uniq);

  (data || []).forEach(p => map.set(p.id, {
    id: p.id,
    nickname: p.nickname || '',
    avatar_url: p.avatar_url || '',
    email: emailMap[p.id] || ''
  }));
  uniq.forEach(id => {
    if (!map.has(id)) map.set(id, { id, nickname: '', avatar_url: '', email: emailMap[id] || '' });
  });
  return map;
}

export async function handleAdminPlayPosts(request, env, corsHeaders) {
  if (!await isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }
  await checkRateLimit(request, env, 'normal');

  const sp = new URL(request.url).searchParams;
  const { page, offset, limit } = pager(sp);
  const kind = sp.get('kind') || '';
  const q = (sp.get('q') || '').replace(/[,()%*"'\\\n\r]/g, ' ').trim().slice(0, 60);

  try {
    const supabase = makeSupabase(env);

    let query = supabase
      .from('gh_play_post')
      .select('id, author_id, kind, title, content, site_slug, site_url, preview_status, like_count, comment_count, view_count, created_at', { count: 'exact' });

    if (kind === 'site' || kind === 'text') query = query.eq('kind', kind);
    if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const posts = data || [];
    const profiles = await profileMap(env, posts.map(p => p.author_id));

    let rows = posts.map(p => ({
      ...p,
      author: profiles.get(p.author_id) || { id: p.author_id, nickname: '', avatar_url: '', email: '' }
    }));
    if (q) {
      const lower = q.toLowerCase();
      rows = rows.filter(p =>
        (p.title || '').toLowerCase().includes(lower) ||
        (p.content || '').toLowerCase().includes(lower) ||
        (p.author?.nickname || '').toLowerCase().includes(lower) ||
        (p.author?.email || '').toLowerCase().includes(lower)
      );
    }

    return jsonResp({
      posts: rows,
      pagination: {
        page,
        limit,
        total: count || 0,
        hasMore: offset + posts.length < (count || 0)
      }
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

export async function handleAdminPlayComments(request, env, corsHeaders) {
  if (!await isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }
  await checkRateLimit(request, env, 'normal');

  const sp = new URL(request.url).searchParams;
  const { page, offset, limit } = pager(sp);
  const postId = sp.get('post_id') || '';
  const q = (sp.get('q') || '').replace(/[,()%*"'\\\n\r]/g, ' ').trim().slice(0, 60);

  try {
    const supabase = makeSupabase(env);

    let query = supabase
      .from('gh_play_comment')
      .select('id, post_id, author_id, parent_id, depth, content, is_ai, mention_ai, created_at', { count: 'exact' });

    if (postId && ID_RE.test(postId)) query = query.eq('post_id', postId);
    if (q) query = query.ilike('content', `%${q}%`);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const rows = data || [];
    const profiles = await profileMap(env, rows.map(c => c.author_id));

    const postIds = [...new Set(rows.map(c => c.post_id).filter(Boolean))];
    let postTitles = new Map();
    if (postIds.length) {
      const { data: posts } = await supabase
        .from('gh_play_post')
        .select('id, title')
        .in('id', postIds);
      postTitles = new Map((posts || []).map(p => [p.id, p.title]));
    }

    return jsonResp({
      comments: rows.map(c => ({
        ...c,
        post_title: postTitles.get(c.post_id) || '',
        author: c.is_ai
          ? { id: null, nickname: '小鹅C', avatar_url: '', email: '', is_ai: true }
          : (profiles.get(c.author_id) || { id: c.author_id, nickname: '', avatar_url: '', email: '' })
      })),
      pagination: {
        page,
        limit,
        total: count || 0,
        hasMore: offset + rows.length < (count || 0)
      }
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

export async function handleAdminDeletePlayPost(request, env, corsHeaders, postId) {
  if (!await isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }
  await checkRateLimit(request, env, 'normal');

  if (!postId || !ID_RE.test(postId)) {
    return jsonResp({ error: '无效的帖子ID' }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    const { data: post, error: fetchErr } = await supabase
      .from('gh_play_post')
      .select('id, title, author_id, comment_count')
      .eq('id', postId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!post) return jsonResp({ error: '帖子不存在' }, 404, corsHeaders);

    await supabase.from('gh_play_like').delete().eq('post_id', postId);
    await supabase.from('gh_play_comment').delete().eq('post_id', postId);

    const { error } = await supabase.from('gh_play_post').delete().eq('id', postId);
    if (error) throw error;

    return jsonResp({
      success: true,
      deleted: { id: postId, title: post.title, comments: post.comment_count || 0 }
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

export async function handleAdminDeletePlayComment(request, env, corsHeaders, commentId) {
  if (!await isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }
  await checkRateLimit(request, env, 'normal');

  if (!commentId || !ID_RE.test(commentId)) {
    return jsonResp({ error: '无效的评论ID' }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    const { data: c, error: fetchErr } = await supabase
      .from('gh_play_comment')
      .select('id, post_id, content, is_ai, author_id')
      .eq('id', commentId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!c) return jsonResp({ error: '评论不存在' }, 404, corsHeaders);

    const { count: childCount } = await supabase
      .from('gh_play_comment')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', commentId);

    const { error } = await supabase.from('gh_play_comment').delete().eq('id', commentId);
    if (error) throw error;

    return jsonResp({
      success: true,
      deleted: { id: commentId, children: childCount || 0, is_ai: !!c.is_ai }
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

export async function handleAdminPlayStats(request, env, corsHeaders) {
  if (!await isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }
  await checkRateLimit(request, env, 'normal');

  try {
    const supabase = makeSupabase(env);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: posts },
      { count: comments },
      { count: aiComments },
      { count: likes },
      { count: follows },
      { count: postsToday },
      { count: sitePosts }
    ] = await Promise.all([
      supabase.from('gh_play_post').select('id', { count: 'exact', head: true }),
      supabase.from('gh_play_comment').select('id', { count: 'exact', head: true }),
      supabase.from('gh_play_comment').select('id', { count: 'exact', head: true }).eq('is_ai', true),
      supabase.from('gh_play_like').select('post_id', { count: 'exact', head: true }),
      supabase.from('gh_play_follow').select('follower_id', { count: 'exact', head: true }),
      supabase.from('gh_play_post').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('gh_play_post').select('id', { count: 'exact', head: true }).eq('kind', 'site')
    ]);

    return jsonResp({
      posts: posts || 0,
      comments: comments || 0,
      ai_comments: aiComments || 0,
      likes: likes || 0,
      follows: follows || 0,
      posts_today: postsToday || 0,
      site_posts: sitePosts || 0,
      text_posts: (posts || 0) - (sitePosts || 0)
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
