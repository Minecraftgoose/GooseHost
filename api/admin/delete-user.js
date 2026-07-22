// ===== 管理员 - 删除用户及站点 =====

import { isAdmin } from '../utils/jwt.js';
import { makeSupabase } from '../utils/supabase.js';
import { fetchEmailMap, saveEmailMap } from '../utils/email-map.js';
import { jsonResp } from '../utils/response.js';

export async function handleAdminDeleteUser(request, env, corsHeaders) {
  if (!isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

  let targetUserId;
  try {
    const body = await request.json();
    targetUserId = body?.userId;
  } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  if (!targetUserId) {
    return jsonResp({ error: 'Missing userId' }, 400, corsHeaders);
  }

  // 验证 UUID 格式
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return jsonResp({ error: '无效的用户ID格式' }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    // 1. 获取该用户的所有站点（包括 HTML 和 Markdown）
    const { data: sites, error: fetchError } = await supabase
      .from('gh_site')
      .select('name')
      .eq('owner_id', targetUserId);

    if (fetchError) {
      console.error('获取用户站点失败:', fetchError.message);
    }

    // 2. 删除数据库中的站点记录
    if (sites?.length) {
      const { error: delError } = await supabase
        .from('gh_site')
        .delete()
        .eq('owner_id', targetUserId);
      if (delError) {
        console.error('删除站点记录失败:', delError.message);
      }
    }

    // 3. 删除存储桶中的文件（区分 HTML 和 Markdown）
    if (sites?.length) {
      for (const site of sites) {
        const siteName = site.name;
        const isMarkdown = siteName.startsWith('md/');
        const slug = isMarkdown ? siteName.replace('md/', '') : siteName;
        const bucket = isMarkdown ? 'md' : 'sites';
        const filePath = isMarkdown 
          ? `public/${slug}/index.md` 
          : `${targetUserId}/${slug}/index.html`;

        try {
          await supabase.storage.from(bucket).remove([filePath]);
        } catch (err) {
          console.error(`删除存储文件失败: ${bucket}/${filePath}`, err.message);
        }
      }
    }

    // 4. 从 Supabase Auth 删除用户
    const { error: authError } = await supabase.auth.admin.deleteUser(targetUserId);
    if (authError) {
      console.error('删除 Auth 用户失败:', authError.message);
      // Auth 删除失败时，不清理邮箱映射，避免不一致
      return jsonResp({ error: '删除 Auth 用户失败: ' + authError.message }, 500, corsHeaders);
    }

    // 5. 从邮箱映射中删除（仅在 Auth 删除成功后执行）
    try {
      const map = await fetchEmailMap(env);
      if (map[targetUserId]) {
        delete map[targetUserId];
        await saveEmailMap(env, map);
      }
    } catch (err) {
      console.error('更新邮箱映射失败:', err.message);
      // 不影响整体成功，仅记录错误
    }

    return jsonResp({
      success: true,
      deletedSites: sites?.length || 0,
      userId: targetUserId
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

export async function handleAdminDeleteSite(request, env, corsHeaders) {
  if (!isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

  let siteName;
  try {
    const body = await request.json();
    siteName = body?.siteName || body?.slug || '';
  } catch {
    return jsonResp({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  if (!siteName) {
    return jsonResp({ error: 'Missing siteName' }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    // 先获取站点信息（需要 owner_id 来删除存储文件）
    const { data: site, error: fetchError } = await supabase
      .from('gh_site')
      .select('owner_id')
      .eq('name', siteName)
      .maybeSingle();

    if (fetchError || !site) {
      return jsonResp({ error: '站点不存在' }, 404, corsHeaders);
    }

    // 删除数据库记录
    const { error: delError } = await supabase
      .from('gh_site')
      .delete()
      .eq('name', siteName);

    if (delError) throw delError;

    // 删除存储文件（区分 HTML 和 Markdown）
    const isMarkdown = siteName.startsWith('md/');
    const cleanSlug = isMarkdown ? siteName.replace('md/', '') : siteName;
    const bucket = isMarkdown ? 'md' : 'sites';
    const filePath = isMarkdown 
      ? `public/${cleanSlug}/index.md` 
      : `${site.owner_id}/${cleanSlug}/index.html`;

    try {
      await supabase.storage.from(bucket).remove([filePath]);
    } catch (err) {
      console.error('删除存储文件失败:', err.message);
    }

    return jsonResp({ success: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}