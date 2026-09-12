// ===== 广场用户资料 · 关注 · 主页 =====

import { getUserId } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';
import {
  ensureProfile, publicProfile, decoratePosts, pageParams, cleanText, optionalUserId
} from './util.js';

const NICK_RE = /^[一-龥a-zA-Z0-9_ \-]+$/;

function validAvatarUrl(v) {
  if (!v) return true;
  if (v.length > 500) return false;
  return /^https?:\/\/[^\s"']+$/i.test(v);
}

// GET /api/play/me - 我的广场资料（登录，不存在则自动建）
export async function handlePlayGetMe(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);
  try {
    const supabase = makeSupabase(env);
    await ensureProfile(env, userId);
    const { data, error } = await supabase
      .from('gh_play_profile')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return jsonResp({ profile: publicProfile(data) }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// PUT /api/play/me - 设置昵称 / 头像 URL / 简介（登录）
export async function handlePlayUpdateMe(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);

  const rl = await checkRateLimit(request, env, 'play_write');
  if (!rl.allowed) {
    return jsonResp({ error: `操作过于频繁，请在 ${Math.ceil(rl.resetIn)} 秒后重试` }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body || {}, 'nickname')) {
    const nickname = cleanText(body.nickname, 20);
    if (!nickname) return jsonResp({ error: '昵称不能为空' }, 400, corsHeaders);
    if (nickname.length < 2 || nickname.length > 20) {
      return jsonResp({ error: '昵称长度需为 2-20 个字符' }, 400, corsHeaders);
    }
    if (!NICK_RE.test(nickname)) {
      return jsonResp({ error: '昵称仅支持中英文、数字、下划线、空格和连字符' }, 400, corsHeaders);
    }
    patch.nickname = nickname;
  }

  if (Object.prototype.hasOwnProperty.call(body || {}, 'avatar_url')) {
    const avatar = cleanText(body.avatar_url, 500);
    if (!validAvatarUrl(avatar)) {
      return jsonResp({ error: '头像需为合法的 http(s) 图片链接' }, 400, corsHeaders);
    }
    patch.avatar_url = avatar || null;
  }

  if (Object.prototype.hasOwnProperty.call(body || {}, 'bio')) {
    patch.bio = cleanText(body.bio, 200);
  }

  if (!Object.keys(patch).length) {
    return jsonResp({ error: '没有需要更新的内容' }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);
    await ensureProfile(env, userId);
    const { data, error } = await supabase
      .from('gh_play_profile')
      .update(patch)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return jsonResp({ success: true, profile: publicProfile(data) }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// GET /api/play/profile/:id - 用户主页（公开）
export async function handlePlayGetProfile(request, env, corsHeaders, userId) {
  const viewerId = await optionalUserId(request, env);
  try {
    const supabase = makeSupabase(env);
    const { data: profile } = await supabase
      .from('gh_play_profile')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    let isFollowing = false;
    if (viewerId && viewerId !== userId) {
      const { data: f } = await supabase
        .from('gh_play_follow')
        .select('follower_id')
        .eq('follower_id', viewerId)
        .eq('following_id', userId)
        .maybeSingle();
      isFollowing = !!f;
    }

    return jsonResp({
      profile: publicProfile(profile) || { id: userId, nickname: '', avatar_url: '', bio: '', post_count: 0, follower_count: 0, following_count: 0 },
      is_following: isFollowing,
      is_me: viewerId === userId
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// GET /api/play/profile/:id/posts - TA 的帖子（公开）
export async function handlePlayProfilePosts(request, env, corsHeaders, authorId) {
  const url = new URL(request.url);
  const viewerId = await optionalUserId(request, env);
  const { limit, page, offset } = pageParams(url);
  try {
    const supabase = makeSupabase(env);
    const { data, error, count } = await supabase
      .from('gh_play_post')
      .select('*', { count: 'exact' })
      .eq('author_id', authorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    const posts = await decoratePosts(env, data || [], viewerId);
    return jsonResp({ posts, pagination: { page, limit, total: count || 0, has_more: offset + posts.length < (count || 0) } }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// GET /api/play/profile/:id/following | /followers - 关注 / 粉丝列表（公开）
export async function handlePlayFollowList(request, env, corsHeaders, userId, type) {
  try {
    const supabase = makeSupabase(env);
    const url = new URL(request.url);
    const { limit, page, offset } = pageParams(url);

    const isFollowing = type === 'following';
    const from = isFollowing ? 'follower_id' : 'following_id';   // 关系表中等于 userId 的那一列
    const target = isFollowing ? 'following_id' : 'follower_id';  // 要取出来的那一列

    const { data: rows, error, count } = await supabase
      .from('gh_play_follow')
      .select(target, { count: 'exact' })
      .eq(from, userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const ids = (rows || []).map(r => r[target]).filter(Boolean);
    if (!ids.length) {
      return jsonResp({ users: [], pagination: { page, limit, total: count || 0, has_more: false } }, 200, corsHeaders);
    }

    const { data: profiles } = await supabase
      .from('gh_play_profile')
      .select('id, nickname, avatar_url, bio, post_count, follower_count, following_count, created_at')
      .in('id', ids);

    const map = new Map((profiles || []).map(p => [p.id, p]));
    const users = ids.map(id => publicProfile(map.get(id)) || { id, nickname: '', avatar_url: '', bio: '' });

    return jsonResp({
      users,
      pagination: { page, limit, total: count || 0, has_more: offset + users.length < (count || 0) }
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// POST /api/play/follow - 关注（登录）
export async function handlePlayFollow(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);

  const rl = await checkRateLimit(request, env, 'play_write');
  if (!rl.allowed) {
    return jsonResp({ error: `操作过于频繁，请在 ${Math.ceil(rl.resetIn)} 秒后重试` }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  const targetId = cleanText(body?.user_id, 64);
  if (!targetId) return jsonResp({ error: '缺少 user_id' }, 400, corsHeaders);
  if (targetId === userId) return jsonResp({ error: '不能关注自己' }, 400, corsHeaders);

  try {
    const supabase = makeSupabase(env);
    await ensureProfile(env, userId);
    const { error } = await supabase
      .from('gh_play_follow')
      .upsert({ follower_id: userId, following_id: targetId }, { onConflict: 'follower_id,following_id' });
    if (error) throw error;
    return jsonResp({ success: true, following: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// DELETE /api/play/follow/:id - 取关（登录）
export async function handlePlayUnfollow(request, env, corsHeaders, targetId) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);
  try {
    const supabase = makeSupabase(env);
    const { error } = await supabase
      .from('gh_play_follow')
      .delete()
      .eq('follower_id', userId)
      .eq('following_id', targetId);
    if (error) throw error;
    return jsonResp({ success: true, following: false }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// POST /api/play/posts/:id/like - 点赞（登录）
export async function handlePlayLike(request, env, corsHeaders, postId) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);

  const rl = await checkRateLimit(request, env, 'play_write');
  if (!rl.allowed) {
    return jsonResp({ error: `操作过于频繁，请在 ${Math.ceil(rl.resetIn)} 秒后重试` }, 429, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);
    const { data: post } = await supabase.from('gh_play_post').select('id').eq('id', postId).maybeSingle();
    if (!post) return jsonResp({ error: '帖子不存在' }, 404, corsHeaders);

    const { error } = await supabase
      .from('gh_play_like')
      .upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id' });
    if (error) throw error;

    const { data: fresh } = await supabase.from('gh_play_post').select('like_count').eq('id', postId).single();
    return jsonResp({ success: true, liked: true, like_count: fresh?.like_count || 0 }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// DELETE /api/play/posts/:id/like - 取消点赞（登录）
export async function handlePlayUnlike(request, env, corsHeaders, postId) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);
  try {
    const supabase = makeSupabase(env);
    const { error } = await supabase
      .from('gh_play_like')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) throw error;

    const { data: fresh } = await supabase.from('gh_play_post').select('like_count').eq('id', postId).single();
    return jsonResp({ success: true, liked: false, like_count: fresh?.like_count || 0 }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
