// ===== 管理员 - 系统状态 =====

import { isAdmin } from '../utils/jwt.js';
import { makeSupabase } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';

// 系统状态存储路径
const STATUS_KEY = 'system_status';

async function getSystemStatus(env) {
  try {
    const res = await fetch(`https://${env.SUPABASE_URL.replace('https://', '')}/storage/v1/object/admin/${STATUS_KEY}.json`, {
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function saveSystemStatus(env, status) {
  await fetch(`https://${env.SUPABASE_URL.replace('https://', '')}/storage/v1/object/admin/${STATUS_KEY}.json`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: JSON.stringify(status),
  });
}

async function checkServiceHealth(env, service) {
  const urls = {
    api: `${env.SUPABASE_URL}/rest/v1/`,
    database: `${env.SUPABASE_URL}/rest/v1/gh_site?select=id&limit=1`,
    storage: `${env.SUPABASE_URL}/storage/v1/bucket`,
    auth: `${env.SUPABASE_URL}/auth/v1/health`,
    pages: 'https://host.goose.cc.cd',
  };

  try {
    const res = await fetch(urls[service], {
      headers: { 'apikey': env.SUPABASE_ANON_KEY },
      cf: { cacheTtl: 0 },
    });
    return res.ok;
  } catch { return false; }
}

// GET /api/admin/system-status - 获取系统状态
export async function handleGetSystemStatus(request, env, corsHeaders) {
  try {
    // 获取存储的系统状态（管理员设置）
    const storedStatus = await getSystemStatus(env) || {};
    
    // 默认所有服务正常
    const defaultServices = {
      login: true,
      register: true,
      create: true,
      'my-sites': true,
      update: true,
      delete: true,
      file: true,
      'serve-html': true,
      'serve-md': true,
    };

    // 合并存储的服务状态
    const services = { ...defaultServices, ...(storedStatus.services || {}) };

    const status = {
      maintenance_mode: storedStatus.maintenance_mode || false,
      maintenance_message: storedStatus.maintenance_message || null,
      services,
      updated_at: storedStatus.updated_at || new Date().toISOString(),
    };

    return jsonResp(status, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// POST /api/admin/system-status - 设置系统状态 (仅管理员)
export async function handleSetSystemStatus(request, env, corsHeaders) {
  if (!isAdmin(request, env)) {
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
