// ===== 多文件站点=====

import { unzipSync } from 'fflate';
import { isValidSlug } from '../utils/jwt.js';
import { makeSupabase, storageUrl } from '../utils/supabase.js';
import { jsonResp } from '../utils/response.js';
import { getPublicBaseUrl } from '../utils/site-url.js';
import { getClientIP } from '../utils/rate-limit.js';

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
  svg: 'image/svg+xml; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  toml: 'text/plain; charset=utf-8',
  ini: 'text/plain; charset=utf-8',
  conf: 'text/plain; charset=utf-8',
  cfg: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
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

const MAX_FILES = 50;
const MAX_FILE_SIZE = 200 * 1024;      // 单文件 200KB
const MAX_TOTAL = 2 * 1024 * 1024;     // 总 2MB
const MAX_ZIP_B64 = 3 * 1024 * 1024;   // base64 后 zip 上限，约 2.2MB 原始

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isSafePath(p) {
  if (!p || p.startsWith('/') || p.includes('\\')) return false;
  return !p.split('/').includes('..');
}

export async function handleCreateProject(request, env, corsHeaders, body, userId) {
  const slugInput = (body?.slug || '').trim().replace(/^md\//, '');
  if (!isValidSlug(slugInput)) {
    return jsonResp({ error: '站点名称无效（1-64字符，支持字母、数字、- _ . ~）' }, 400, corsHeaders);
  }
  const zipB64 = body?.zip || '';
  if (!zipB64) return jsonResp({ error: '缺少 zip 数据' }, 400, corsHeaders);

  let zipData;
  try {
    zipData = b64ToBytes(zipB64);
  } catch {
    return jsonResp({ error: 'zip 数据解码失败' }, 400, corsHeaders);
  }
  if (zipData.length > MAX_ZIP_B64) {
    return jsonResp({ error: '压缩包过大（超过约 2MB）' }, 400, corsHeaders);
  }

  let files;
  try {
    files = unzipSync(zipData);
  } catch {
    return jsonResp({ error: 'zip 解压失败，请确认是有效的 zip 文件' }, 400, corsHeaders);
  }

  // ---- 校验 ----
  const entries = Object.entries(files);
  if (!entries.length) return jsonResp({ error: '压缩包为空' }, 400, corsHeaders);

  const toUpload = [];
  let total = 0;
  let hasIndex = false;

  for (const [path, data] of entries) {
    if (data.length === 0) continue; 
    if (!isSafePath(path)) {
      return jsonResp({ error: `非法路径: ${path}` }, 400, corsHeaders);
    }
    const dot = path.lastIndexOf('.');
    const ext = dot === -1 ? '' : path.slice(dot + 1).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return jsonResp({ error: `不允许的文件类型: ${path}（仅支持代码/文本文件）` }, 400, corsHeaders);
    }
    if (data.length > MAX_FILE_SIZE) {
      return jsonResp({ error: `单文件超过 200KB: ${path}` }, 400, corsHeaders);
    }
    if (toUpload.length >= MAX_FILES) {
      return jsonResp({ error: `文件数量超过 ${MAX_FILES} 个` }, 400, corsHeaders);
    }
    total += data.length;
    if (total > MAX_TOTAL) {
      return jsonResp({ error: '解压后总大小超过 2MB' }, 400, corsHeaders);
    }
    if (path === 'index.html' || path === 'index.md') hasIndex = true;
    toUpload.push([path, data]);
  }

  if (!hasIndex) {
    return jsonResp({ error: '压缩包内需要有 index.html 或 index.md 作为入口' }, 400, corsHeaders);
  }

  try {
    const supabase = makeSupabase(env);

    const { data: existing } = await supabase.from('gh_site').select('id').eq('name', slugInput).maybeSingle();
    if (existing) return jsonResp({ error: '该站点名称已被占用' }, 409, corsHeaders);

    const ip = getClientIP(request);
    const { data: site, error: siteError } = await supabase.from('gh_site').insert({
      name: slugInput,
      type: 'project',
      owner_id: userId,
      ip_address: ip
    }).select().single();
    if (siteError || !site) {
      return jsonResp({ error: siteError?.message || '创建站点失败' }, 500, corsHeaders);
    }

    const uploaded = [];
    for (const [path, data] of toUpload) {
      const storagePath = `projects/${userId}/${slugInput}/${path}`;
      const res = await fetch(storageUrl(env, storagePath), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': MIME[path.split('.').pop().toLowerCase()] || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: data,
      });
      if (!res.ok) {
        const written = uploaded.map(u => `projects/${userId}/${slugInput}/${u}`);
        if (written.length) {
          await supabase.storage.from('projects').remove(written).catch(() => {});
        }
        await supabase.from('gh_site').delete().eq('id', site.id);
        return jsonResp({ error: '文件上传失败，请稍后重试' }, 500, corsHeaders);
      }
      uploaded.push(path);
    }

    return jsonResp({
      success: true,
      name: slugInput,
      type: 'project',
      url: `${getPublicBaseUrl(env)}/p/${slugInput}`
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ error: err.message }, 500, corsHeaders);
  }
}

// GET /p/:slug/:path
export async function handleServeProject(request, env, slug, subPath) {
  const supabase = makeSupabase(env);
  const { data: site, error: siteError } = await supabase
    .from('gh_site')
    .select('owner_id, type')
    .eq('name', slug)
    .maybeSingle();

  if (siteError || !site || site.type !== 'project') {
    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  let rel = (subPath || '').trim();
  if (!rel) rel = 'index.html';
  if (!isSafePath(rel)) {
    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  let candidates = [rel];
  if (rel.endsWith('/')) {
    candidates = [rel + 'index.html', rel + 'index.md'];
  } else if (!rel.includes('.')) {
    candidates = [rel, rel + '/index.html', rel + '/index.md'];
  }
  if (rel === 'index.html') candidates = ['index.html', 'index.md'];

  const anonHeaders = { Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` };

  for (const cand of candidates) {
    const storagePath = `projects/${site.owner_id}/${slug}/${cand}`;
    const res = await fetch(storageUrl(env, storagePath), { headers: anonHeaders });
    if (!res.ok) continue;
    if (cand === 'index.html' || cand === 'index.md') {
      try {
        await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_visit`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_name: slug }),
        });
      } catch (e) {}
    }
    const dot = cand.lastIndexOf('.');
    const ext = dot === -1 ? '' : cand.slice(dot + 1).toLowerCase();
    const mime = MIME[ext] || 'text/plain; charset=utf-8';

    if (mime === 'text/html; charset=utf-8') {
      const baseTag = `<base href="/p/${slug}/">`;
      const buf = await res.arrayBuffer();
      const html = new TextDecoder('utf-8').decode(buf);
      const fixed = /<head>/i.test(html) ? html.replace(/<head>/i, '<head>' + baseTag)
        : /<html/i.test(html) ? html.replace(/<html(\s[^>]*)?>/i, '<html$1><head>' + baseTag + '</head>')
        : baseTag + html;
      return new Response(fixed, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=60'
        }
      });
    }
    return new Response(res.body, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=60'
      }
    });
  }

  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
