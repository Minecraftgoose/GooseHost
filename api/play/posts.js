// ===== 广场帖子 =====

import { getUserId, isAdmin } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';
import { getPublicBaseUrl } from '../utils/site-url.js';
import { ensureProfile, decoratePosts, pageParams, cleanText, optionalUserId } from './util.js';

const MAX_TITLE = 120;
const MAX_CONTENT = 20000;

// GET /api/play/posts - 广场列表（公开）
export async function handlePlayListPosts(request, env, corsHeaders) {
  const url = new URL(request.url);
  const sp = url.searchParams;
  const viewerId = await optionalUserId(request, env);

  const { limit, page, offset } = pageParams(url);
  const sort = sp.get('sort') === 'hot' ? 'hot' : 'new';
  const kind = sp.get('kind') || 'all';
  // 清洗：避免用户输入破坏 PostgREST 的 or() 语法
  const q = (sp.get('q') || '').replace(/[,()%*"'\\\n\r]/g, ' ').trim().slice(0, 60);
  const author = sp.get('author') || '';

  try {
    const supabase = makeSupabase(env);

    let query = supabase.from('gh_play_post').select('*', { count: 'exact' });

    if (kind === 'site' || kind === 'text') query = query.eq('kind', kind);
    if (author) query = query.eq('author_id', author);
    if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);

    query = sort === 'hot'
      ? query.order('like_count', { ascending: false }).order('created_at', { ascending: false })
      : query.order('created_at', { ascending: false });

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    const posts = await decoratePosts(env, data || [], viewerId);

    return jsonResp({
      posts,
      pagination: {
        page,
        limit,
        total: count || 0,
        has_more: offset + (posts.length) < (count || 0)
      }
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// GET /api/play/posts/:id - 帖子详情（公开）
export async function handlePlayPostDetail(request, env, corsHeaders, postId) {
  const viewerId = await optionalUserId(request, env);
  try {
    const supabase = makeSupabase(env);
    const { data: post, error } = await supabase
      .from('gh_play_post')
      .select('*')
      .eq('id', postId)
      .maybeSingle();
    if (error) throw error;
    if (!post) return jsonResp({ error: '帖子不存在' }, 404, corsHeaders);

    // 浏览量 +1（失败不影响主流程）
    try { await supabase.rpc('gh_play_inc_view', { p_post_id: postId }); } catch { /* ignore */ }

    const [decorated] = await decoratePosts(env, [post], viewerId);
    return jsonResp({ post: decorated }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// POST /api/play/posts - 发帖（登录）
export async function handlePlayCreatePost(request, env, corsHeaders) {
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

  const kind = body?.kind === 'site' ? 'site' : 'text';
  const title = cleanText(body?.title, MAX_TITLE);
  const content = cleanText(body?.content, MAX_CONTENT);

  if (!title) return jsonResp({ error: '标题不能为空' }, 400, corsHeaders);
  if (title.length > MAX_TITLE) return jsonResp({ error: `标题不能超过 ${MAX_TITLE} 字` }, 400, corsHeaders);
  if (content.length > MAX_CONTENT) return jsonResp({ error: '正文过长' }, 400, corsHeaders);

  try {
    const supabase = makeSupabase(env);
    await ensureProfile(env, userId);

    let siteSlug = null;
    let siteUrl = null;

    if (kind === 'site') {
      const slug = cleanText(body?.site_slug, 64);
      if (!slug) return jsonResp({ error: '请选择要发布的站点' }, 400, corsHeaders);

      // 站点必须属于本人
      const { data: site, error: siteErr } = await supabase
        .from('gh_site')
        .select('id, name, type')
        .eq('name', slug)
        .eq('owner_id', userId)
        .maybeSingle();
      if (siteErr) throw siteErr;
      if (!site) return jsonResp({ error: '站点不存在或不属于你' }, 404, corsHeaders);

      // 同一站点只允许发布一次
      const { data: dup } = await supabase
        .from('gh_play_post')
        .select('id')
        .eq('site_slug', slug)
        .maybeSingle();
      if (dup) return jsonResp({ error: '这个站点已经发布过啦' }, 409, corsHeaders);

      const base = getPublicBaseUrl(env);
      const prefix = site.type === 'md' ? '/md/' : (site.type === 'project' ? '/p/' : '/s/');
      siteSlug = slug;
      siteUrl = `${base}${prefix}${slug}${site.type === 'project' ? '/' : ''}`;
    }

    const { data: post, error } = await supabase
      .from('gh_play_post')
      .insert({
        author_id: userId,
        kind,
        title,
        content,
        site_slug: siteSlug,
        site_url: siteUrl,
        preview_url: null,        // 预览图位：等首屏抓取服务接入后回填
        preview_status: kind === 'site' ? 'pending' : 'none'
      })
      .select()
      .single();
    if (error) throw error;

    const [decorated] = await decoratePosts(env, [post], userId);
    return jsonResp({ success: true, post: decorated }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// DELETE /api/play/posts/:id - 删帖（本人 / 管理员）
export async function handlePlayDeletePost(request, env, corsHeaders, postId) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);

  try {
    const supabase = makeSupabase(env);
    const { data: post } = await supabase
      .from('gh_play_post')
      .select('id, author_id')
      .eq('id', postId)
      .maybeSingle();
    if (!post) return jsonResp({ error: '帖子不存在' }, 404, corsHeaders);

    const admin = await isAdmin(request, env);
    if (post.author_id !== userId && !admin) {
      return jsonResp({ error: '只能删除自己的帖子' }, 403, corsHeaders);
    }

    const { error } = await supabase.from('gh_play_post').delete().eq('id', postId);
    if (error) throw error;
    return jsonResp({ success: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// GET /api/play/my-sites - 我可发布的站点（登录）
export async function handlePlayMySites(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: '请先登录' }, 401, corsHeaders);

  try {
    const supabase = makeSupabase(env);

    const [{ data: sites }, { data: published }] = await Promise.all([
      supabase.from('gh_site')
        .select('id, name, type, created_at, updated_at, visit_count')
        .eq('owner_id', userId)
        .order('updated_at', { ascending: false }),
      supabase.from('gh_play_post').select('site_slug').eq('author_id', userId)
    ]);

    const done = new Set((published || []).map(p => p.site_slug).filter(Boolean));
    const base = getPublicBaseUrl(env);

    return jsonResp({
      sites: (sites || []).map(s => {
        const prefix = s.type === 'md' ? '/md/' : (s.type === 'project' ? '/p/' : '/s/');
        return {
          ...s,
          url: `${base}${prefix}${s.name}${s.type === 'project' ? '/' : ''}`,
          published: done.has(s.name)
        };
      })
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
