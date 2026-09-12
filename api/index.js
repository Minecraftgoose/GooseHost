// ===== GooseHost API 主入口 =====

import { getCorsHeaders } from './utils/cors.js';
import { jsonResp } from './utils/response.js';
import { cleanupOrphanUsers } from './jobs/cleanup.js';

import { handleRegister } from './auth/register.js';
import { handleLogin } from './auth/login.js';
import { handleRefresh } from './auth/refresh.js';
import { handleSignup } from './auth/signup.js';
import { handleGetMe, handleUpdateMe } from './auth/me.js';
import { handleMacosSubmit, handleMacosStatus } from './macos.js';
import { handleForgotPassword } from './auth/forgot-password.js';
import { handleResetPassword } from './auth/reset-password.js';
import { handleDeleteAccount } from './auth/delete-account.js';

import { handleCreate } from './sites/create.js';
import { handleUpdate } from './sites/update.js';
import { handleDelete } from './sites/delete.js';
import { handleMySites } from './sites/my-sites.js';
import { handleGetFile } from './sites/file.js';
import { handleSiteFiles } from './sites/files.js';
import { handleGetProjectFile, handlePutProjectFile, handleDeleteProjectFile } from './sites/project-file.js';
import { handleServeSite } from './sites/serve.js';
import { handleServeProject } from './sites/project.js';

import { handleAdminStats } from './admin/stats.js';
import { handleAdminUsers } from './admin/users.js';
import { handleAdminSites } from './admin/sites.js';
import { handleAdminSiteDetail, handleAdminSiteUpdate } from './admin/site-detail.js';
import { handleAdminDeleteUser, handleAdminDeleteSite } from './admin/delete-user.js';
import { handleAdminSyncEmails } from './admin/sync-emails.js';
import { handleGetSystemStatus, handleSetSystemStatus } from './admin/system-status.js';
import { handleGetAnnouncement, handleAdminAnnouncement } from './admin/announcement.js';
import { handlePublicStats } from './admin/public-stats.js';
import {
  handleAdminPlayPosts,
  handleAdminPlayComments,
  handleAdminDeletePlayPost,
  handleAdminDeletePlayComment,
  handleAdminPlayStats
} from './admin/play.js';

import {
  handleDebugSyncEmails,
  handleDebugTestAuth,
  handleDebugCleanup
} from './debug.js';

import { handleAiChat } from './ai/chat.js';

import {
  handlePlayListPosts,
  handlePlayPostDetail,
  handlePlayCreatePost,
  handlePlayDeletePost,
  handlePlayMySites,
  handlePlayListComments,
  handlePlayCreateComment,
  handlePlayDeleteComment,
  handlePlayGetMe,
  handlePlayUpdateMe,
  handlePlayGetProfile,
  handlePlayProfilePosts,
  handlePlayFollowList,
  handlePlayFollow,
  handlePlayUnfollow,
  handlePlayLike,
  handlePlayUnlike,
  handlePlayFeed
} from './play/index.js';

// ===== Workers Entry =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const pathParts = url.pathname.split('/').filter(Boolean);
    const corsHeaders = getCorsHeaders(request);

    if (method === 'OPTIONS') {
      return new Response('', { status: 200, headers: corsHeaders });
    }

    // === 公开路由 ===

    // POST /api/register - 用户注册
    if (url.pathname === '/api/register' && method === 'POST') {
      return await handleRegister(request, env, corsHeaders);
    }

    // POST /api/forgot-password - 发送密码重置邮件
    if (url.pathname === '/api/forgot-password' && method === 'POST') {
      return await handleForgotPassword(request, env, corsHeaders);
    }

    // POST /api/reset-password - 用邮件 token 设置新密码
    if (url.pathname === '/api/reset-password' && method === 'POST') {
      return await handleResetPassword(request, env, corsHeaders);
    }

    // GET /api/me - 获取当前用户信息
    if (url.pathname === '/api/me' && method === 'GET') {
      return await handleGetMe(request, env, corsHeaders);
    }

    // GET /api/config
    if (url.pathname === '/api/config' && method === 'GET') {
      return jsonResp({ apiUrl: url.origin }, 200, corsHeaders);
    }

    // GET /api/announcement - 公告
    if (url.pathname === '/api/announcement' && method === 'GET') {
      return await handleGetAnnouncement(request, env, corsHeaders);
    }

    // GET /api/stats - 全站统计
    if (url.pathname === '/api/stats' && method === 'GET') {
      return await handlePublicStats(request, env, corsHeaders);
    }

    // PUT /api/me - 更新当前用户昵称
    if (url.pathname === '/api/me' && method === 'PUT') {
      return await handleUpdateMe(request, env, corsHeaders);
    }

    // POST /api/macos/submit - 提交站点到 macOS 开发者计划
    if (url.pathname === '/api/macos/submit' && method === 'POST') {
      return await handleMacosSubmit(request, env, corsHeaders);
    }

    // GET /api/macos/status?slug= - 查询 macOS 审核状态
    if (url.pathname === '/api/macos/status' && method === 'GET') {
      return await handleMacosStatus(request, env, corsHeaders);
    }

    // POST /auth/login - 代理登录
    if (url.pathname === '/auth/login' && method === 'POST') {
      return await handleLogin(request, env, corsHeaders);  
    }

    // POST /auth/refresh - 刷新会话
    if (url.pathname === '/auth/refresh' && method === 'POST') {
      return await handleRefresh(request, env, corsHeaders);
    }

    // POST /auth/signup - 代理注册
    if (url.pathname === '/auth/signup' && method === 'POST') {
      return await handleSignup(request, env, corsHeaders);  
    }

    // === 需要认证的路由 ===

    // POST /api/delete-account - 销号
    if (url.pathname === '/api/delete-account' && method === 'POST') {
      return await handleDeleteAccount(request, env, corsHeaders);
    }

    // POST /api/ai/chat - AI Copilot 转发（认证与限流在 handler 内）
    if (url.pathname === '/api/ai/chat' && method === 'POST') {
      return await handleAiChat(request, env, corsHeaders);
    }

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
      if (pathParts[3]) slug = pathParts[3];
      if (slug) return await handleGetFile(request, env, corsHeaders, slug);
    }

    // GET /api/site-files/:slug - 站点文件列表
    if (pathParts[0] === 'api' && pathParts[1] === 'site-files' && pathParts[2] && method === 'GET') {
      return await handleSiteFiles(request, env, corsHeaders, pathParts[2]);
    }

    // 多文件文件级操作：/api/proj-file/:slug/:path*
    if (pathParts[0] === 'api' && pathParts[1] === 'proj-file' && pathParts[2] && pathParts[3]) {
      const slug = pathParts[2];
      const rel = pathParts.slice(3).join('/');
      if (method === 'GET') return await handleGetProjectFile(request, env, corsHeaders, slug, rel);
      if (method === 'PUT') return await handlePutProjectFile(request, env, corsHeaders, slug, rel);
      if (method === 'DELETE') return await handleDeleteProjectFile(request, env, corsHeaders, slug, rel);
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

    // DELETE /api/admin/user/:userId - 删除用户
    if (pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'user' && pathParts[3] && !pathParts[4] && method === 'DELETE') {
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

    // POST /api/admin/announcement - 发公告/清公告
    if (url.pathname === '/api/admin/announcement' && method === 'POST') {
      return await handleAdminAnnouncement(request, env, corsHeaders);
    }

    // === 管理员 - 广场管理 ===

    // GET /api/admin/play/stats - 广场统计
    if (url.pathname === '/api/admin/play/stats' && method === 'GET') {
      return await handleAdminPlayStats(request, env, corsHeaders);
    }

    // GET /api/admin/play/posts - 广场帖子列表
    if (url.pathname === '/api/admin/play/posts' && method === 'GET') {
      return await handleAdminPlayPosts(request, env, corsHeaders);
    }

    // GET /api/admin/play/comments - 广场评论列表
    if (url.pathname === '/api/admin/play/comments' && method === 'GET') {
      return await handleAdminPlayComments(request, env, corsHeaders);
    }

    // DELETE /api/admin/play/post/:id - 删除帖子
    if (pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'play'
        && pathParts[3] === 'post' && pathParts[4] && !pathParts[5] && method === 'DELETE') {
      return await handleAdminDeletePlayPost(request, env, corsHeaders, pathParts[4]);
    }

    // DELETE /api/admin/play/comment/:id - 删除评论
    if (pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'play'
        && pathParts[3] === 'comment' && pathParts[4] && !pathParts[5] && method === 'DELETE') {
      return await handleAdminDeletePlayComment(request, env, corsHeaders, pathParts[4]);
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

    // === 广场（Playground）===

    // GET /api/play/posts - 广场帖子列表（公开）
    if (url.pathname === '/api/play/posts' && method === 'GET') {
      return await handlePlayListPosts(request, env, corsHeaders);
    }

    // POST /api/play/posts - 发帖（登录）
    if (url.pathname === '/api/play/posts' && method === 'POST') {
      return await handlePlayCreatePost(request, env, corsHeaders);
    }

    // GET /api/play/my-sites - 我可发布的站点（登录）
    if (url.pathname === '/api/play/my-sites' && method === 'GET') {
      return await handlePlayMySites(request, env, corsHeaders);
    }

    // GET /api/play/feed - 关注的人的动态（登录）
    if (url.pathname === '/api/play/feed' && method === 'GET') {
      return await handlePlayFeed(request, env, corsHeaders);
    }

    // GET /api/play/me - 我的广场资料（登录）
    if (url.pathname === '/api/play/me' && method === 'GET') {
      return await handlePlayGetMe(request, env, corsHeaders);
    }

    // PUT /api/play/me - 设置昵称/头像/简介（登录）
    if (url.pathname === '/api/play/me' && method === 'PUT') {
      return await handlePlayUpdateMe(request, env, corsHeaders);
    }

    // POST /api/play/follow - 关注（登录）
    if (url.pathname === '/api/play/follow' && method === 'POST') {
      return await handlePlayFollow(request, env, corsHeaders);
    }

    // DELETE /api/play/follow/:userId - 取关（登录）
    if (pathParts[0] === 'api' && pathParts[1] === 'play' && pathParts[2] === 'follow' && pathParts[3] && !pathParts[4] && method === 'DELETE') {
      return await handlePlayUnfollow(request, env, corsHeaders, pathParts[3]);
    }

    // DELETE /api/play/comments/:id - 删评论（登录）
    if (pathParts[0] === 'api' && pathParts[1] === 'play' && pathParts[2] === 'comments' && pathParts[3] && !pathParts[4] && method === 'DELETE') {
      return await handlePlayDeleteComment(request, env, corsHeaders, pathParts[3]);
    }

    // GET/POST /api/play/posts/:id/comments - 评论树 / 发评论
    if (pathParts[0] === 'api' && pathParts[1] === 'play' && pathParts[2] === 'posts' && pathParts[3] && pathParts[4] === 'comments' && !pathParts[5]) {
      const postId = pathParts[3];
      if (method === 'GET') return await handlePlayListComments(request, env, corsHeaders, postId);
      if (method === 'POST') return await handlePlayCreateComment(request, env, corsHeaders, postId);
    }

    // POST/DELETE /api/play/posts/:id/like - 点赞 / 取消点赞（登录）
    if (pathParts[0] === 'api' && pathParts[1] === 'play' && pathParts[2] === 'posts' && pathParts[3] && pathParts[4] === 'like' && !pathParts[5]) {
      if (method === 'POST') return await handlePlayLike(request, env, corsHeaders, pathParts[3]);
      if (method === 'DELETE') return await handlePlayUnlike(request, env, corsHeaders, pathParts[3]);
    }

    // GET /api/play/posts/:id - 帖子详情（公开）
    if (pathParts[0] === 'api' && pathParts[1] === 'play' && pathParts[2] === 'posts' && pathParts[3] && !pathParts[4] && method === 'GET') {
      return await handlePlayPostDetail(request, env, corsHeaders, pathParts[3]);
    }

    // DELETE /api/play/posts/:id - 删帖（登录）
    if (pathParts[0] === 'api' && pathParts[1] === 'play' && pathParts[2] === 'posts' && pathParts[3] && !pathParts[4] && method === 'DELETE') {
      return await handlePlayDeletePost(request, env, corsHeaders, pathParts[3]);
    }

    // GET /api/play/profile/:id - 用户主页（公开）
    if (pathParts[0] === 'api' && pathParts[1] === 'play' && pathParts[2] === 'profile' && pathParts[3] && !pathParts[4] && method === 'GET') {
      return await handlePlayGetProfile(request, env, corsHeaders, pathParts[3]);
    }

    // GET /api/play/profile/:id/posts - TA 的帖子（公开）
    if (pathParts[0] === 'api' && pathParts[1] === 'play' && pathParts[2] === 'profile' && pathParts[3] && pathParts[4] === 'posts' && !pathParts[5] && method === 'GET') {
      return await handlePlayProfilePosts(request, env, corsHeaders, pathParts[3]);
    }

    // GET /api/play/profile/:id/following | /followers - 关注/粉丝列表（公开）
    if (pathParts[0] === 'api' && pathParts[1] === 'play' && pathParts[2] === 'profile' && pathParts[3] && (pathParts[4] === 'following' || pathParts[4] === 'followers') && !pathParts[5] && method === 'GET') {
      return await handlePlayFollowList(request, env, corsHeaders, pathParts[3], pathParts[4]);
    }

    // === 公共站点访问 ===

    // GET /s/:slug - 访问 HTML 站点
    if (pathParts[0] === 's' && pathParts[1] && !pathParts[2] && method === 'GET') {
      return await handleServeSite(request, env, pathParts[1]);
    }

    // GET /p/:slug/... - 访问多文件站点
    if (pathParts[0] === 'p' && pathParts[1] && (method === 'GET' || method === 'HEAD')) {
      return await handleServeProject(request, env, pathParts[1], pathParts.slice(2).join('/'));
    }

    // GET /md/:slug - 访问 Markdown 站点
    if (pathParts[0] === 'md' && pathParts[1] && !pathParts[2] && method === 'GET') {
      return await handleServeSite(request, env, pathParts[1]);
    }

    // === 404 ===

    return new Response('Not Found', {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  },

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