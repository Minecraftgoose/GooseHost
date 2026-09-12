// ===== 广场评论（多级 + @小鹅C） =====

import { getUserId, isAdmin } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';
import { loadProfiles, buildCommentTree, cleanText } from './util.js';
import { askGooseC, mentionsGooseC } from './ai.js';

const MAX_CONTENT = 5000;

// 生成排序段：时间序 + uuid，保证同层按时间、全局唯一
function makeSeg(id) {
  return String(Date.now()).padStart(13, '0') + '-' + id;
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// GET /api/play/posts/:id/comments - 评论树（公开）
export async function handlePlayListComments(request, env, corsHeaders, postId) {
  try {
    const supabase = makeSupabase(env);

    const { data: rows, error } = await supabase
      .from('gh_play_comment')
      .select('*')
      .eq('post_id', postId)
      .order('path', { ascending: true });
    if (error) throw error;

    const list = rows || [];
    const profiles = await loadProfiles(env, list.map(c => c.author_id));

    return jsonResp({
      comments: buildCommentTree(list, profiles),
      total: list.length
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// 拼出给小鹅C 看的上下文：祖先链 + 目标评论 + 其下的最新几条
function buildThread(rows, profiles, targetId) {
  const target = rows.find(r => r.id === targetId);
  if (!target) return [];
  const ancestors = rows
    .filter(r => target.path === r.path || target.path.startsWith(r.path + '/'))
    .sort((a, b) => a.path.localeCompare(b.path));
  const children = rows
    .filter(r => r.parent_id === targetId)
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(-3);
  const all = [...ancestors, ...children.filter(c => !ancestors.includes(c))];
  return all.map(r => ({
    is_ai: !!r.is_ai,
    nickname: r.is_ai ? '小鹅C' : (profiles.get(r.author_id)?.nickname || '网友'),
    content: r.content
  }));
}

// POST /api/play/posts/:id/comments - 发表评论（登录）
export async function handlePlayCreateComment(request, env, corsHeaders, postId) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);

  const rl = await checkRateLimit(request, env, 'play_comment');
  if (!rl.allowed) {
    return jsonResp({ error: `操作过于频繁，请在 ${Math.ceil(rl.resetIn)} 秒后重试` }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const content = cleanText(body?.content, MAX_CONTENT);
  if (!content) return jsonResp({ error: '评论内容不能为空' }, 400, corsHeaders);
  if (content.length > MAX_CONTENT) return jsonResp({ error: '评论过长' }, 400, corsHeaders);

  const parentId = body?.parent_id || null;
  const wantAi = body?.mention_ai === true || mentionsGooseC(content);

  try {
    const supabase = makeSupabase(env);

    const { data: post, error: postErr } = await supabase
      .from('gh_play_post')
      .select('id, title, content, kind, site_url')
      .eq('id', postId)
      .maybeSingle();
    if (postErr) throw postErr;
    if (!post) return jsonResp({ error: '帖子不存在' }, 404, corsHeaders);

    let parent = null;
    if (parentId) {
      const { data: p, error: pErr } = await supabase
        .from('gh_play_comment')
        .select('id, parent_id, root_id, path, depth, post_id')
        .eq('id', parentId)
        .eq('post_id', postId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!p) return jsonResp({ error: '被回复的评论不存在' }, 404, corsHeaders);
      parent = p;
    }

    const id = newId();
    const seg = makeSeg(id);
    const row = {
      id,
      post_id: postId,
      author_id: userId,
      parent_id: parent ? parent.id : null,
      root_id: parent ? (parent.root_id || parent.id) : id,
      path: parent ? `${parent.path}/${seg}` : seg,
      depth: parent ? parent.depth + 1 : 0,
      content,
      is_ai: false,
      mention_ai: wantAi
    };

    const { data: inserted, error: insErr } = await supabase
      .from('gh_play_comment')
      .insert(row)
      .select()
      .single();
    if (insErr) throw insErr;

    const profiles = await loadProfiles(env, [userId]);
    const me = profiles.get(userId);
    const comment = {
      ...inserted,
      author: me
        ? { id: me.id, nickname: me.nickname || '', avatar_url: me.avatar_url || '', bio: me.bio || '', is_ai: false }
        : { id: userId, nickname: '', avatar_url: '', is_ai: false },
      children: []
    };

    // ===== @小鹅C：生成 AI 回复并落库 =====
    let aiReply = null;
    if (wantAi) {
      try {
        const { data: allRows } = await supabase
          .from('gh_play_comment')
          .select('id, parent_id, path, content, author_id, is_ai, created_at')
          .eq('post_id', postId)
          .order('path', { ascending: true });
        const allProfiles = await loadProfiles(env, (allRows || []).map(r => r.author_id));
        const thread = buildThread(allRows || [], allProfiles, id);

        const res = await askGooseC(env, { post, thread });
        if (res.text) {
          const aiId = newId();
          const aiSeg = makeSeg(aiId);
          const aiRow = {
            id: aiId,
            post_id: postId,
            author_id: null,
            parent_id: id,
            root_id: row.root_id,
            path: `${row.path}/${aiSeg}`,
            depth: row.depth + 1,
            content: res.text,
            is_ai: true,
            mention_ai: false
          };
          const { data: aiInserted } = await supabase
            .from('gh_play_comment')
            .insert(aiRow)
            .select()
            .single();
          if (aiInserted) {
            aiReply = {
              ...aiInserted,
              author: { id: null, nickname: '小鹅C', avatar_url: '', is_ai: true },
              children: []
            };
          }
        } else {
          console.error('askGooseC failed:', res.error);
        }
      } catch (e) {
        console.error('AI reply error:', e.message);
      }
    }

    return jsonResp({
      success: true,
      comment,
      ai_reply: aiReply,
      ai_pending: wantAi && !aiReply
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// DELETE /api/play/comments/:id - 删除评论（本人 / 管理员）
export async function handlePlayDeleteComment(request, env, corsHeaders, commentId) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);

  try {
    const supabase = makeSupabase(env);
    const { data: c } = await supabase
      .from('gh_play_comment')
      .select('id, author_id')
      .eq('id', commentId)
      .maybeSingle();
    if (!c) return jsonResp({ error: '评论不存在' }, 404, corsHeaders);

    const admin = await isAdmin(request, env);
    if (c.author_id !== userId && !admin) {
      return jsonResp({ error: '只能删除自己的评论' }, 403, corsHeaders);
    }

    const { error } = await supabase.from('gh_play_comment').delete().eq('id', commentId);
    if (error) throw error;
    return jsonResp({ success: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}


