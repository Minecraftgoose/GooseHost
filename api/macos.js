// ===== macOS 开发者计划 =====

import { getUserId } from './utils/jwt.js';
import { jsonResp } from './utils/response.js';
import { makeSupabase } from './utils/supabase.js';
import { checkRateLimit } from './utils/rate-limit.js';

const MACOS_API = 'https://dev.macos.goose.gs.cn';

function siteUrl(site) {
  const prefix = site.type === 'md' ? '/md/' : (site.type === 'project' ? '/p/' : '/s/');
  return 'https://page.goose.gs.cn' + prefix + encodeURIComponent(site.name);
}

// POST /api/macos/submit - 提交站点到 macOS 开发者计划
export async function handleMacosSubmit(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  const rl = await checkRateLimit(request, env, 'normal');
  if (!rl.allowed) return jsonResp({ error: '请求过于频繁' }, 429, corsHeaders);

  let body;
  try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400, corsHeaders); }
  const slug = (body?.slug || '').trim();
  if (!slug) return jsonResp({ error: '缺少 slug' }, 400, corsHeaders);

  const name = (body?.name || '').trim();
  const icon_url = (body?.icon_url || '').trim();
  const description = (body?.description || '').trim();
  const category = (body?.category || '').trim();

  if (!name) return jsonResp({ error: '软件名称必填' }, 400, corsHeaders);
  if (name.length > 30) return jsonResp({ error: '软件名称不能超过 30 字符' }, 400, corsHeaders);
  if (!icon_url) return jsonResp({ error: '图标 URL 必填' }, 400, corsHeaders);
  if (!/^https?:\/\//.test(icon_url)) {
    return jsonResp({ error: '图标 URL 必须以 http:// 或 https:// 开头' }, 400, corsHeaders);
  }
  if (!description) return jsonResp({ error: '一句话描述必填' }, 400, corsHeaders);
  if (description.length > 200) {
    return jsonResp({ error: '描述不能超过 200 字符' }, 400, corsHeaders);
  }
  if (!category) return jsonResp({ error: '分类必填' }, 400, corsHeaders);
  const CATEGORIES = ['工具', '游戏', '社交', '娱乐', '购物', '教育', '新闻', '其他'];
  if (!CATEGORIES.includes(category)) {
    return jsonResp({ error: '分类不合法，可选：' + CATEGORIES.join(' / ') }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);
    const { data: site, error } = await supabase
      .from('gh_site')
      .select('name, type, owner_id, macos_submit_id')
      .eq('name', slug)
      .maybeSingle();
    if (error || !site) return jsonResp({ error: '站点不存在' }, 404, corsHeaders);
    if (site.owner_id !== userId) return jsonResp({ error: 'Forbidden' }, 403, corsHeaders);

    if (site.macos_submit_id) {
      return jsonResp({ already_submitted: true, id: site.macos_submit_id, message: '该站点已提交过审核' }, 200, corsHeaders);
    }

    const url = siteUrl(site);
    const subRes = await fetch(MACOS_API + '/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        url,
        description,
        icon_url,
        category,
      }),
    });
    const subData = await subRes.json();
    if (!subRes.ok || !subData.ok) {
      return jsonResp({ error: subData.error || '提交失败，请稍后再试' }, subRes.status || 500, corsHeaders);
    }

    const { error: upErr } = await supabase
      .from('gh_site')
      .update({ macos_submit_id: subData.id })
      .eq('name', slug);
    if (upErr) return jsonResp({ error: '提交成功但保存失败: ' + upErr.message }, 500, corsHeaders);

    return jsonResp({ ok: true, id: subData.id, message: '已提交审核' }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// GET /api/macos/status?slug=xxx - 查询站点审核状态
export async function handleMacosStatus(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  if (!slug) return jsonResp({ error: '缺少 slug' }, 400, corsHeaders);

  try {
    const supabase = makeSupabase(env);
    const { data: site, error } = await supabase
      .from('gh_site')
      .select('name, owner_id, macos_submit_id')
      .eq('name', slug)
      .maybeSingle();
    if (error || !site) return jsonResp({ error: '站点不存在' }, 404, corsHeaders);
    if (site.owner_id !== userId) return jsonResp({ error: 'Forbidden' }, 403, corsHeaders);

    if (!site.macos_submit_id) {
      return jsonResp({ submitted: false, status: null }, 200, corsHeaders);
    }

    const stRes = await fetch(MACOS_API + '/api/status?id=' + encodeURIComponent(site.macos_submit_id));
    const stData = await stRes.json();
    return jsonResp({ submitted: true, id: site.macos_submit_id, status: stData.status || 'pending', remark: stData.remark || '', slug: stData.slug || null }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
