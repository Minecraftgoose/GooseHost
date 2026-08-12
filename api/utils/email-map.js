// ===== 邮箱映射管理 =====

import { storageUrl, makeSupabase } from './supabase.js';

// 获取邮箱映射
async function fetchEmailMap(env) {
  try {
    const res = await fetch(storageUrl(env, 'admin/email-map.json'), {
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) return {};
    const text = await res.text();
    return JSON.parse(text);
  } catch { return {}; }
}

// 保存邮箱映射
async function saveEmailMap(env, map) {
  try {
    await fetch(storageUrl(env, 'admin/email-map.json'), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true',
      },
      body: JSON.stringify(map),
    });
  } catch { /* best effort */ }
}

// 同步邮箱映射（从 Supabase Auth）
async function syncEmailMap(env) {
  try {
    const supabase = makeSupabase(env);
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    if (!authUsers?.users) return null;
    const map = {};
    authUsers.users.forEach(u => { map[u.id] = u.email; });
    await saveEmailMap(env, map);
    return map;
  } catch (err) {
    console.error('syncEmailMap failed:', err.message);
    return null;
  }
}

export { fetchEmailMap, saveEmailMap, syncEmailMap };
