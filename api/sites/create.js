// ===== 创建站点 =====

import { marked } from 'marked';
import { getUserId, isValidSlug } from '../utils/jwt.js';
import { checkRateLimit, getClientIP } from '../utils/rate-limit.js';
import { makeSupabase, storageUrl } from '../utils/supabase.js';
import { fetchEmailMap, saveEmailMap } from '../utils/email-map.js';
import { jsonResp } from '../utils/response.js';
import { getPublicBaseUrl } from '../utils/site-url.js';

export async function handleCreate(request, env, corsHeaders) {
  const userId = getUserId(request);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  const rl = await checkRateLimit(request, env, 'create');
  if (!rl.allowed) {
    const msg = rl.locked
      ? `操作过于频繁，请在 ${Math.ceil(rl.resetIn / 60)} 分钟后重试`
      : `请求过于频繁，请在 ${Math.ceil(rl.resetIn)} 秒后重试`;
    return jsonResp({ error: msg, retryAfter: Math.ceil(rl.resetIn) }, 429, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const slugInput = (body?.slug || '').trim();
  const htmlInput = body?.html || '';
  const mdInput = body?.md || '';

  // 检测是否为 Markdown 站点
  const isMd = !!mdInput;
  const isMdPrefix = slugInput.startsWith('md/');
  const actualSlug = isMdPrefix ? slugInput.replace('md/', '') : slugInput;

  if (!isValidSlug(actualSlug)) {
    return jsonResp({ error: '站点名称无效（1-64字符，支持字母、数字、- _ . ~）' }, 400, corsHeaders);
  }

  const finalSlug = isMd ? `md/${actualSlug}` : actualSlug;
  let html = htmlInput;

  // 如果是 Markdown 模式，先转换为 HTML
  if (isMd) {
    html = marked.parse(mdInput);
  }

  if (!html || html.length > 2 * 1024 * 1024) {
    return jsonResp({ error: '内容无效或超过 2MB' }, 400, corsHeaders);
  }

  const ip = getClientIP(request);

  try {
    const supabase = makeSupabase(env);

    // 检查站点名是否已被占用
    const { data: existing } = await supabase.from('gh_site').select('id').eq('name', finalSlug).maybeSingle();
    if (existing) return jsonResp({ error: '该站点名称已被占用' }, 409, corsHeaders);

    // 创建站点记录
    const { data: site, error: siteError } = await supabase.from('gh_site').insert({
      name: finalSlug,
      owner_id: userId,
      ip_address: ip
    }).select().single();

    if (siteError || !site) {
      return jsonResp({ error: siteError?.message || '创建站点失败' }, 500, corsHeaders);
    }

    // 上传文件到存储 - Markdown 用 md/public，HTML 用 sites/
    const storagePath = isMd 
      ? `md/public/${actualSlug}/index.md`
      : `sites/${userId}/${actualSlug}/index.html`;
    
    const storageRes = await fetch(storageUrl(env, storagePath), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': isMd ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8',
        'x-upsert': 'true'
      },
      body: isMd ? mdInput : html,
    });

    if (!storageRes.ok) {
      // 回滚：删除站点记录
      await supabase.from('gh_site').delete().eq('id', site.id);
      return jsonResp({ error: '文件上传失败，请稍后重试' }, 500, corsHeaders);
    }

    return jsonResp({ success: true, name: finalSlug, url: `${getPublicBaseUrl(env)}${isMd ? `/md/${actualSlug}` : `/s/${actualSlug}`}` }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
