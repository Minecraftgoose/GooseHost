// ===== 广场（Playground）公共工具 =====

import { getUserId } from '../utils/jwt.js';
import { makeSupabase } from '../utils/supabase.js';

const AI_NAME = '小鹅C';

// 可选登录态：公开接口也能调用，登录了就带上 userId
async function optionalUserId(request, env) {
  try {
    return await getUserId(request, env);
  } catch {
    return null;
  }
}

// 只暴露允许公开的字段
function publicProfile(p) {
  if (!p) return null;
  return {
    id: p.id,
    nickname: p.nickname || '',
    avatar_url: p.avatar_url || '',
    bio: p.bio || '',
    post_count: p.post_count || 0,
    follower_count: p.follower_count || 0,
    following_count: p.following_count || 0,
    created_at: p.created_at
  };
}

// 资料不存在则按 auth 信息补一条
async function ensureProfile(env, userId) {
  const supabase = makeSupabase(env);
  const { data: exist } = await supabase
    .from('gh_play_profile')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (exist) return exist.id;

  let nickname = '';
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const user = data?.user;
    const meta = user?.user_metadata || user?.raw_user_meta_data || {};
    nickname = (typeof meta?.nickname === 'string' && meta.nickname.trim()) ||
               (user?.email ? String(user.email).split('@')[0] : '');
  } catch { /* 取不到就用空昵称 */ }

  await supabase
    .from('gh_play_profile')
    .upsert({ id: userId, nickname: nickname.slice(0, 20) }, { onConflict: 'id' });
  return userId;
}

// 批量取资料 → Map
async function loadProfiles(env, ids) {
  const map = new Map();
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return map;
  const supabase = makeSupabase(env);
  const { data } = await supabase
    .from('gh_play_profile')
    .select('id, nickname, avatar_url, bio, post_count, follower_count, following_count, created_at')
    .in('id', uniq);
  (data || []).forEach(p => map.set(p.id, p));
  return map;
}

// 给帖子列表挂作者资料 / 点赞态 / 是否本人
async function decoratePosts(env, posts, viewerId) {
  const list = posts || [];
  if (!list.length) return [];

  const profiles = await loadProfiles(env, list.map(p => p.author_id));

  let likedSet = new Set();
  let followSet = new Set();
  if (viewerId) {
    const supabase = makeSupabase(env);
    const postIds = list.map(p => p.id);
    const authorIds = [...new Set(list.map(p => p.author_id).filter(id => id !== viewerId))];

    const [{ data: likes }, { data: follows }] = await Promise.all([
      supabase.from('gh_play_like').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
      authorIds.length
        ? supabase.from('gh_play_follow').select('following_id').eq('follower_id', viewerId).in('following_id', authorIds)
        : Promise.resolve({ data: [] })
    ]);
    likedSet = new Set((likes || []).map(l => l.post_id));
    followSet = new Set((follows || []).map(f => f.following_id));
  }

  return list.map(p => {
    const profile = profiles.get(p.author_id);
    return {
      ...p,
      author: Object.assign(
        publicProfile(profile) || { id: p.author_id, nickname: '', avatar_url: '' },
        viewerId && p.author_id !== viewerId ? { is_following: followSet.has(p.author_id) } : {}
      ),
      liked: viewerId ? likedSet.has(p.id) : false,
      is_mine: viewerId ? p.author_id === viewerId : false
    };
  });
}

// 把按 path 排序好的评论数组还原成树
function buildCommentTree(rows, profiles) {
  const nodes = new Map();
  const roots = [];

  (rows || []).forEach(c => {
    const isAi = !!c.is_ai;
    const profile = isAi ? null : profiles.get(c.author_id);
    nodes.set(c.id, {
      id: c.id,
      post_id: c.post_id,
      parent_id: c.parent_id,
      depth: c.depth,
      content: c.content,
      is_ai: isAi,
      mention_ai: !!c.mention_ai,
      created_at: c.created_at,
      author_id: c.author_id,
      author: isAi
        ? { id: null, nickname: AI_NAME, avatar_url: '', is_ai: true }
        : (profile
            ? { ...publicProfile(profile), is_ai: false }
            : { id: c.author_id, nickname: '', avatar_url: '', is_ai: false }),
      children: []
    });
  });

  (rows || []).forEach(c => {
    const node = nodes.get(c.id);
    if (c.parent_id && nodes.has(c.parent_id)) {
      nodes.get(c.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// 分页参数
function pageParams(url) {
  const sp = new URL(url).searchParams;
  const limit = Math.min(50, Math.max(1, parseInt(sp.get('limit')) || 20));
  const page = Math.max(1, parseInt(sp.get('page')) || 1);
  return { limit, page, offset: (page - 1) * limit };
}

// 文本清洗
function cleanText(v, max) {
  return String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

export {
  AI_NAME,
  optionalUserId,
  publicProfile,
  ensureProfile,
  loadProfiles,
  decoratePosts,
  buildCommentTree,
  pageParams,
  cleanText
};
