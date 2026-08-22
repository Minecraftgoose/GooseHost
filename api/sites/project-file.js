// ===== 多文件站点文件级操作=====

import { getUserId } from '../utils/jwt.js';
import { makeSupabase, storageUrl } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';
import { getClientIP } from '../utils/rate-limit.js';

//白名单
const ALLOWED_EXTS = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'md', 'markdown',
  'json', 'txt', 'text', 'svg', 'xml', 'yml', 'yaml', 'toml',
  'ini', 'conf', 'cfg', 'csv', 'ts', 'tsx', 'jsx', 'py',
  'c', 'cpp', 'cc', 'h', 'hpp', 'java', 'go', 'rs',
  'sh', 'bash', 'zsh', 'vue', 'svelte', 'wasm'
]);

const MIME = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  xml: 'application/xml; charset=utf-8',
  yml: 'text/plain; charset=utf-8',
  yaml: 'text/plain; charset=utf-8',
  toml: 'text/plain; charset=utf-8',
  ini: 'text/plain; charset=utf-8',
  conf: 'text/plain; charset=utf-8',
  cfg: 'text/plain; charset=utf-8',
  csv: 'text/plain; charset=utf-8',
  ts: 'text/plain; charset=utf-8',
  tsx: 'text/plain; charset=utf-8',
  jsx: 'text/plain; charset=utf-8',
  py: 'text/plain; charset=utf-8',
  c: 'text/plain; charset=utf-8',
  cpp: 'text/plain; charset=utf-8',
  cc: 'text/plain; charset=utf-8',
  h: 'text/plain; charset=utf-8',
  hpp: 'text/plain; charset=utf-8',
  java: 'text/plain; charset=utf-8',
  go: 'text/plain; charset=utf-8',
  rs: 'text/plain; charset=utf-8',
  sh: 'text/plain; charset=utf-8',
  bash: 'text/plain; charset=utf-8',
  zsh: 'text/plain; charset=utf-8',
  vue: 'text/plain; charset=utf-8',
  svelte: 'text/plain; charset=utf-8',
  wasm: 'application/wasm',
};

const MAX_FILE_SIZE = 200 * 1024; // 单文件 200KB

// 路径安全校验
function isSafePath(p) {
  if (!p || p.startsWith('/') || p.includes('\\')) return false;
  return !p.split('/').includes('..');
}

// 校验文件白名单
function checkExt(path) {
  const dot = path.lastIndexOf('.');
  const ext = dot === -1 ? '' : path.slice(dot + 1).toLowerCase();
  return ALLOWED_EXTS.has(ext);
}

// 鉴权：站点归属p类型
async function authSite(env, request, slug, corsHeaders) {
  const userId = await getUserId(request, env);
  if (!userId) return { err: jsonResp({ error: 'Unauthorized' }, 401, corsHeaders) };
  const supabase = makeSupabase(env);
  const { data: site, error } = await supabase
    .from('gh_site')
    .select('owner_id, type')
    .eq('name', slug)
    .maybeSingle();
  if (error || !site) return { err: jsonResp({ error: 'Site not found' }, 404, corsHeaders) };
  if (site.type !== 'project') return { err: jsonResp({ error: '仅支持多文件站点' }, 400, corsHeaders) };
  const adminIds = (env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  if (!isAdmin && site.owner_id !== userId) return { err: jsonResp({ error: 'Forbidden' }, 403, corsHeaders) };
  return { site, supabase, userId };
}

// GET /api/proj-file/:slug/:path* - 读取文件内容
export async function handleGetProjectFile(request, env, corsHeaders, slug, relPath) {
  const auth = await authSite(env, request, slug, corsHeaders);
  if (auth.err) return auth.err;
  const rel = (relPath || '').trim();
  if (!rel || !isSafePath(rel)) return jsonResp({ error: '路径无效' }, 400, corsHeaders);

  const storagePath = `projects/${auth.site.owner_id}/${slug}/${rel}`;
  const res = await fetch(storageUrl(env, storagePath), {
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) return jsonResp({ error: '文件不存在' }, 404, corsHeaders);
  const content = await res.text();
  return jsonResp({ name: rel, content, size: content.length }, 200, corsHeaders);
}

// PUT /api/proj-file/:slug/:path* - 写入/替换文件
export async function handlePutProjectFile(request, env, corsHeaders, slug, relPath) {
  const auth = await authSite(env, request, slug, corsHeaders);
  if (auth.err) return auth.err;
  const rel = (relPath || '').trim();
  if (!rel || !isSafePath(rel)) return jsonResp({ error: '路径无效' }, 400, corsHeaders);
  if (!checkExt(rel)) return jsonResp({ error: `不允许的文件类型: ${rel}（仅支持代码/文本文件）` }, 400, corsHeaders);

  let body;
  try { body = await request.json(); } catch { return jsonResp({ error: '请求体无效' }, 400, corsHeaders); }
  const content = body?.content;
  if (typeof content !== 'string') return jsonResp({ error: '缺少 content 字段' }, 400, corsHeaders);
  if (content.length > MAX_FILE_SIZE) return jsonResp({ error: '单文件超过 200KB' }, 400, corsHeaders);

  const storagePath = `projects/${auth.site.owner_id}/${slug}/${rel}`;
  const res = await fetch(storageUrl(env, storagePath), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': MIME[rel.split('.').pop().toLowerCase()] || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: content,
  });
  if (!res.ok) return jsonResp({ error: '写入失败，请稍后重试' }, 500, corsHeaders);
  return jsonResp({ success: true, name: rel }, 200, corsHeaders);
}

// DELETE /api/proj-file/:slug/:path* - 删除文件
export async function handleDeleteProjectFile(request, env, corsHeaders, slug, relPath) {
  const auth = await authSite(env, request, slug, corsHeaders);
  if (auth.err) return auth.err;
  const rel = (relPath || '').trim();
  if (!rel || !isSafePath(rel)) return jsonResp({ error: '路径无效' }, 400, corsHeaders);

  const storagePath = `projects/${auth.site.owner_id}/${slug}/${rel}`;
  const res = await fetch(storageUrl(env, storagePath), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok && res.status !== 404) return jsonResp({ error: '删除失败' }, 500, corsHeaders);
  return jsonResp({ success: true, name: rel }, 200, corsHeaders);
}
