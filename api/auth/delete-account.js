// ===== 注销账号 =====

import { getUserId } from '../utils/jwt.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

export async function handleDeleteAccount(request, env, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);

  const rl = await checkRateLimit(request, env, 'delete_acct');
  if (!rl.allowed) {
    return jsonResp({ error: `操作过于频繁，请在 ${Math.ceil(rl.resetIn / 60)} 分钟后重试` }, 429, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    // 1. 用户所有站点
    const { data: sites, error: selErr } = await supabase
      .from('gh_site')
      .select('name, type')
      .eq('owner_id', userId);
    if (selErr) throw selErr;

    // 2. 收集需要删除的存储文件
    const sitesFiles = [];
    const mdFiles = [];
    for (const s of (sites || [])) {
      const isMd = s.type === 'md';
      if (isMd) {
        mdFiles.push(`${userId}/${s.name}/index.md`);
      } else {
        sitesFiles.push(`${userId}/${s.name}/index.html`);
      }
    }
    if (sitesFiles.length) {
      await supabase.storage.from('sites').remove(sitesFiles).catch(() => {});
    }
    if (mdFiles.length) {
      await supabase.storage.from('md').remove(mdFiles).catch(() => {});
    }

    // 3. 删除 gh_site 表中的该用户记录
    const { error: delErr } = await supabase
      .from('gh_site')
      .delete()
      .eq('owner_id', userId);
    if (delErr) throw delErr;

    // 4. 删除 Supabase Auth 用户
    const delRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
    });
    if (!delRes.ok) {
      const errData = await delRes.json().catch(() => ({}));
      throw new Error(errData.msg || '删除用户失败');
    }

    return jsonResp({ success: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message || '注销失败，请稍后再试' }, 500, corsHeaders);
  }
}
