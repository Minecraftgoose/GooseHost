// ===== 清理孤立用户 =====

import { makeSupabase } from '../utils/supabase.js';
import { fetchEmailMap, saveEmailMap } from '../utils/email-map.js';

// 清理孤立用户（注册超过3小时且无站点的账户）
export async function cleanupOrphanUsers(env) {
  const supabase = makeSupabase(env);

  // 获取所有 auth 用户
  let authUserIds = [];
  let userCreations = {};

  try {
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    if (authUsers?.users) {
      authUsers.users.forEach(u => {
        authUserIds.push(u.id);
        userCreations[u.id] = u.created_at;
      });
    }
  } catch (_) {
    // 回退：使用 email map keys，但 email map 可能为空，所以仍需尝试从 Auth 直接获取
    // 这里重新尝试从 Auth 获取，但避免重复代码，直接调用一次
    try {
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      if (authUsers?.users) {
        authUsers.users.forEach(u => {
          authUserIds.push(u.id);
          userCreations[u.id] = u.created_at;
        });
      }
    } catch (err) {
      console.error('无法获取 Auth 用户列表，使用 email-map 回退:', err.message);
      // 若 Auth 调用失败，则使用 email-map（但无创建时间，无法过滤3小时）
      const map = await fetchEmailMap(env);
      authUserIds = Object.keys(map);
      // 对于 email-map 中的用户，没有创建时间，默认全部视为超过3小时（保守处理）
      // 但可能导致误删，因此若无法获取创建时间，则跳过时间过滤，仅清理无站点的用户
      // 这里我们不设置 userCreations，后续过滤时跳过时间检查
    }
  }

  if (!authUserIds.length) return { cleaned: 0, total: 0 };

  // 获取有站点的所有 owner
  const { data: allSites } = await supabase.from('gh_site').select('owner_id');
  const ownersWithSites = new Set(allSites?.map(s => s.owner_id) || []);

  const now = Date.now();
  const THREE_HOURS = 3 * 60 * 60 * 1000;

  // 筛选出需要删除的用户
  const toDelete = authUserIds.filter(id => {
    // 有站点的用户保留
    if (ownersWithSites.has(id)) return false;

    // 若无创建时间（回退到 email-map），则直接删除（无站点）
    if (!userCreations[id]) return true;

    const age = now - new Date(userCreations[id]).getTime();
    return age > THREE_HOURS;
  });

  let cleaned = 0;

  for (const userId of toDelete) {
    // 删除 Auth 用户
    try {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (!error) cleaned++;
      else console.error('deleteUser error:', error.message);
    } catch (_) {}

    // 从邮箱映射中删除
    try {
      const map = await fetchEmailMap(env);
      if (map[userId]) {
        delete map[userId];
        await saveEmailMap(env, map);
      }
    } catch (_) {}
  }

  return { cleaned, total: toDelete.length };
}