// ===== 管理员 - 系统状态 =====

import { isAdmin } from '../utils/jwt.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

const supabase = makeSupabase;

async function getSystemStatus(env) {
  try {
    const db = supabase(env);
    const { data } = await db.from('system_status').select('*').eq('id', 1).maybeSingle();
    return data || null;
  } catch { return null; }
}

async function saveSystemStatus(env, status) {
  try {
    const db = supabase(env);
    await db.from('system_status').upsert({
      id: 1,
      maintenance_mode: status.maintenance_mode || false,
      maintenance_message: status.maintenance_message || null,
      services: status.services || {},
      updated_at: new Date().toISOString(),
      updated_by: status.updated_by || 'admin',
    });
  } catch {}
}

// GET /api/admin/system-status
export async function handleGetSystemStatus(request, env, corsHeaders) {
  try {
    const storedStatus = await getSystemStatus(env);

    const defaultServices = {
      login: true, register: true, create: true, 'my-sites': true,
      update: true, delete: true, file: true, 'serve-html': true, 'serve-md': true,
    };

    const services = { ...defaultServices, ...(storedStatus?.services || {}) };

    const status = {
      maintenance_mode: storedStatus?.maintenance_mode || false,
      maintenance_message: storedStatus?.maintenance_message || null,
      services,
      updated_at: storedStatus?.updated_at || new Date().toISOString(),
    };

    return jsonResp(status, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// POST /api/admin/system-status
export async function handleSetSystemStatus(request, env, corsHeaders) {
  if (!await isAdmin(request, env)) {
    return jsonResp({ error: 'Admin only' }, 403, corsHeaders);
  }

  try {
    const body = await request.json();
    const { maintenance_mode, maintenance_message, services } = body;

    const status = {
      maintenance_mode: maintenance_mode || false,
      maintenance_message: maintenance_message || null,
      services: services || {},
      updated_at: new Date().toISOString(),
      updated_by: 'admin',
    };

    await saveSystemStatus(env, status);

    return jsonResp({ success: true, status }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}
