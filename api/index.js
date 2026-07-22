// ===== GooseHost API 主入口 =====
// 重构版：模块化路由分发

import { getCorsHeaders } from './utils/cors.js';
import { jsonResp } from './utils/response.js';
import { cleanupOrphanUsers } from './jobs/cleanup.js';

// 导入路由处理器
import { handleRegister } from './auth/register.js';
import { handleLogin } from './auth/login.js';
import { handleSignup } from './auth/signup.js';

import { handleCreate } from './sites/create.js';
import { handleUpdate } from './sites/update.js';
import { handleDelete } from './sites/delete.js';
import { handleMySites } from './sites/my-sites.js';
import { handleGetFile } from './sites/file.js';
import { handleServeSite } from './sites/serve.js';

import { handleAdminStats } from './admin/stats.js';
import { handleAdminUsers } from './admin/users.js';
import { handleAdminSites } from './admin/sites.js';
import { handleAdminSiteDetail, handleAdminSiteUpdate } from './admin/site-detail.js';
import { handleAdminDeleteUser, handleAdminDeleteSite } from './admin/delete-user.js';
import { handleAdminSyncEmails } from './admin/sync-emails.js';
import { handleGetSystemStatus, handleSetSystemStatus } from './admin/system-status.js';

import {
  handleDebugSyncEmails,
  handleDebugTestAuth,
  handleDebugCleanup,
  handleVersion
} from './debug.js';

// ===== Workers Entry =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const pathParts = url.pathname.split('/').filter(Boolean);
    const corsHeaders = getCorsHeaders(request);

    // 处理 CORS preflight
    if (method === 'OPTIONS') {
      return new Response('', { status: 200, headers: corsHeaders });
    }

    // === 公开路由 ===

    // POST /api/register - 用户注册
    if (url.pathname === '/api/register' && method === 'POST') {
      return await handleRegister(request, env, corsHeaders);
    }

    // POST /auth/login - 代理登录
    if (url.pathname === '/auth/login' && method === 'POST') {
      return await handleLogin(request, env, corsHeaders);   // 传递 corsHeaders
    }

    // POST /auth/signup - 代理注册（增强版）
    if (url.pathname === '/auth/signup' && method === 'POST') {
      return await handleSignup(request, env, corsHeaders);  // 传递 corsHeaders
    }

    // === 需要认证的路由 ===

    // POST /api/create - 创建站点
    if (url.pathname === '/api/create' && method === 'POST') {
      return await handleCreate(request, env, corsHeaders);
    }

    // GET /api/my-sites - 获取我的站点列表
    if (url.pathname === '/api/my-sites' && method === 'GET') {
      return await handleMySites(request, env, corsHeaders);
    }

    // GET /api/file/:slug - 获取站点文件 (支持 md/:slug)
    if (pathParts[0] === 'api' && pathParts[1] === 'file' && method === 'GET') {
      let slug = pathParts[2] || '';
      if (pathParts[3]) slug = `md/${pathParts[3]}`; // /api/file/md/:slug
      if (slug) return await handleGetFile(request, env, corsHeaders, slug);
    }

    // POST /api/update - 更新站点
    if (url.pathname === '/api/update' && method === 'POST') {
      return await handleUpdate(request, env, corsHeaders);
    }

    // POST /api/delete - 删除站点
    if (url.pathname === '/api/delete' && method === 'POST') {
      return await handleDelete(request, env, corsHeaders);
    }

    // === 管理员路由 ===

    // GET /api/admin/stats - 统计信息
    if (url.pathname === '/api/admin/stats' && method === 'GET') {
      return await handleAdminStats(request, env, corsHeaders);
    }

    // GET /api/admin/users - 用户列表
    if (url.pathname === '/api/admin/users' && method === 'GET') {
      return await handleAdminUsers(request, env, corsHeaders);
    }

    // GET /api/admin/sites - 站点列表
    if (url.pathname === '/api/admin/sites' && method === 'GET') {
      return await handleAdminSites(request, env, corsHeaders);
    }

    // GET /api/admin/site/:slug - 站点详情
    if (pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'site' && pathParts[3] && !pathParts[4] && method === 'GET') {
      return await handleAdminSiteDetail(request, env, corsHeaders, pathParts[3]);
    }

    // POST /api/admin/site/:slug - 更新站点
    if (pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'site' && pathParts[3] && !pathParts[4] && method === 'POST') {
      return await handleAdminSiteUpdate(request, env, corsHeaders, pathParts[3]);
    }

    // POST /api/admin/delete-site - 删除站点
    if (pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'delete-site' && !pathParts[3] && method === 'POST') {
      return await handleAdminDeleteSite(request, env, corsHeaders);
    }

    // POST /api/admin/delete-user - 删除用户
    if (pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'delete-user' && !pathParts[3] && method === 'POST') {
      return await handleAdminDeleteUser(request, env, corsHeaders);
    }

    // DELETE /api/admin/user/:userId - 删除用户（遗留路由）
    if (pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'user' && pathParts[3] && !pathParts[4] && method === 'DELETE') {
      // 复用 delete-user 的逻辑
      return await handleAdminDeleteUser(request, env, corsHeaders);
    }

    // POST /api/admin/sync-emails - 同步邮箱
    if (url.pathname === '/api/admin/sync-emails' && method === 'POST') {
      return await handleAdminSyncEmails(request, env, corsHeaders);
    }

    // GET /api/admin/system-status - 获取系统状态
    if (url.pathname === '/api/admin/system-status' && method === 'GET') {
      return await handleGetSystemStatus(request, env, corsHeaders);
    }

    // POST /api/admin/system-status - 设置系统状态
    if (url.pathname === '/api/admin/system-status' && method === 'POST') {
      return await handleSetSystemStatus(request, env, corsHeaders);
    }

    // === Debug 路由 ===

    // POST /_debug/sync-emails - Service Role 同步邮箱
    if (url.pathname === '/_debug/sync-emails' && method === 'POST') {
      return await handleDebugSyncEmails(request, env, corsHeaders);
    }

    // GET /_debug/test-auth - 测试 Auth SDK
    if (url.pathname === '/_debug/test-auth' && method === 'GET') {
      return await handleDebugTestAuth(request, env, corsHeaders);
    }

    // GET /_debug/cleanup - 手动触发清理
    if (url.pathname === '/_debug/cleanup' && method === 'GET') {
      return await handleDebugCleanup(request, env, corsHeaders);
    }

    // POST /_cron/cleanup-orphans - Cron 触发清理
    if (url.pathname === '/_cron/cleanup-orphans' && method === 'POST') {
      const secret = request.headers.get('X-Cron-Secret') || '';
      if (secret !== env.CRON_SECRET) {
        return jsonResp({ error: 'Unauthorized' }, 401, corsHeaders);
      }
      try {
        const result = await cleanupOrphanUsers(env);
        return jsonResp(result, 200, corsHeaders);
      } catch (err) {
        return jsonResp({ error: err.message }, 500, corsHeaders);
      }
    }

    // GET /api/_version - 版本信息
    if (url.pathname === '/api/_version' && method === 'GET') {
      return await handleVersion(request, env, corsHeaders);
    }

    // === 公共站点访问 ===

    // GET /s/:slug - 访问 HTML 站点
    if (pathParts[0] === 's' && pathParts[1] && !pathParts[2] && method === 'GET') {
      return await handleServeSite(request, env, pathParts[1]);
    }

    // GET /md/:slug - 访问 Markdown 站点
    if (pathParts[0] === 'md' && pathParts[1] && !pathParts[2] && method === 'GET') {
      return await handleServeSite(request, env, `md/${pathParts[1]}`);
    }

    // === 404 ===

    return new Response('Not Found', {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  },

  // Cloudflare Cron Trigger — 每 30 分钟清理孤立用户
  async scheduled(controller, env, ctx) {
    if (controller.cron) {
      console.log('Cron trigger: starting orphan cleanup at', new Date().toISOString());
      try {
        const result = await cleanupOrphanUsers(env);
        console.log('Cron cleanup result:', JSON.stringify(result));
      } catch (err) {
        console.error('Cron cleanup error:', err.message);
      }
    }
  },
};