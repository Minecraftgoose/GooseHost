// ===== 清理孤立用户 =====

import { makeSupabase } from '../utils/supabase.js';
import { fetchEmailMap, saveEmailMap } from '../utils/email-map.js';

export async function cleanupOrphanUsers(env) {
  const supabase = makeSupabase(env);

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
  } catch (err) {
    console.error('无法获取 Auth 用户列表，使用 email-map 回退:', err.message);
    const map = await fetchEmailMap(env);
    authUserIds = Object.keys(map);
  }

  if (!authUserIds.length) return { cleaned: 0, total: 0 };

  const { data: allSites } = await supabase.from('gh_site').select('owner_id');
  const ownersWithSites = new Set(allSites?.map(s => s.owner_id) || []);

  const now = Date.now();
  const THREE_HOURS = 3 * 60 * 60 * 1000;

  const toDelete = authUserIds.filter(id => {
    if (ownersWithSites.has(id)) return false;

    if (!userCreations[id]) return true;

    const age = now - new Date(userCreations[id]).getTime();
    return age > THREE_HOURS;
  });

  let cleaned = 0;
  const map = await fetchEmailMap(env);

  for (const userId of toDelete) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (!error) {
        cleaned++;
        if (map[userId]) delete map[userId];
      } else {
        console.error('deleteUser error:', error.message);
      }
    } catch (_) {}
  }

  try {
    await saveEmailMap(env, map);
  } catch (_) {}

  return { cleaned, total: toDelete.length };
}