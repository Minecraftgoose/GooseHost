// ===== 公共访问站点 =====

import { marked } from 'marked';
import { makeSupabaseAnon, storageUrl } from '../utils/supabase.js';

// 配置 marked 生成 URL-safe 的 heading ID
marked.use({
  renderer: {
    heading(token) {
      const text = token.text || '';
      const level = token.depth || 1;
      const raw = token.raw || '';
      const rawText = raw
        .replace(/^#{1,6}[\s]*/, '')
        .replace(/[#*_`~]/g, '')
        .trim();
      const id = rawText
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'heading';
      return `<h${level} id="${id}">${text}</h${level}>\n`;
    }
  }
});

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function render404Page(msg) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - GooseHost</title>
    <link rel="icon" type="image/x-icon" href="https://host.goose.gs.cn/icons/favicon.ico">
    <style>
        @font-face {
            font-family: 'DingTalk JinBuTi';
            src: url('https://host.goose.gs.cn/fonts/DingTalk%20JinBuTi.ttf') format('truetype');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'DingTalk JinBuTi', -apple-system, 'Microsoft YaHei', sans-serif; }
        body { background: #0a0f0d; min-height: 100vh; display: flex; flex-direction: column; }
        .bg-layer { position: fixed; inset: 0; z-index: 0; background: #0a0f0d center/cover; }
        .bg-layer::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, rgba(10,20,15,0.9) 0%, rgba(26,37,32,0.8) 100%);
        }
        .navbar {
            position: relative; z-index: 10;
            height: 60px;
            background: rgba(10,20,15,0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(2,255,142,0.1);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 1.5rem;
        }
        .navbar a { text-decoration: none; color: rgba(255,255,255,0.5); font-size: 14px; transition: color .2s; }
        .navbar a:hover { color: #02ff8e; }
        .container {
            position: relative; z-index: 10;
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 24px;
            text-align: center;
        }
        .code { font-size: 96px; font-weight: 700; color: #02ff8e; line-height: 1; text-shadow: 0 0 40px rgba(2,255,142,0.2); }
        .msg { font-size: 18px; color: rgba(255,255,255,0.5); margin: 20px 0 40px; }
        .back-link {
            display: inline-flex; align-items: center; gap: 8px;
            color: #0a0f0d; background: #02ff8e;
            padding: 12px 28px; border-radius: 8px;
            text-decoration: none; font-size: 15px; font-weight: 500;
            transition: opacity .2s;
        }
        .back-link:hover { opacity: .85; }
        .footer { text-align: center; padding: 24px; font-size: 12px; color: rgba(255,255,255,0.15); position: relative; z-index: 10; }
        .footer a { color: rgba(255,255,255,0.15); text-decoration: none; transition: color .2s; }
        .footer a:hover { color: #02ff8e; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
        ::-webkit-scrollbar-thumb { background: rgba(2,255,142,0.25); border-radius: 3px; }
        @media (max-width: 768px) {
            .code { font-size: 72px; }
            .container { padding: 32px 16px; }
        }
        @media (max-width: 400px) {
            .code { font-size: 56px; }
            .msg { font-size: 15px; }
            .navbar { height: 52px; padding: 0 12px; }
        }
    </style>
</head>
<body>
    <div class="bg-layer"></div>
    <nav class="navbar">
        <a href="https://host.goose.gs.cn/" style="color:#02ff8e;font-weight:600;font-size:16px;">GooseHost</a>
        <a href="https://host.goose.gs.cn/">返回首页</a>
    </nav>
    <main class="container">
        <div class="code">404</div>
        <div class="msg">${escapeHtml(msg)}</div>
        <a href="https://host.goose.gs.cn/" class="back-link">
            <i class="fas fa-arrow-left"></i> 返回首页
        </a>
    </main>
    <footer class="footer"><a href="https://host.goose.gs.cn/" target="_blank">GooseHost</a></footer>
</body>
</html>`;
}

export async function handleServeSite(request, env, slug) {
  const supabase = makeSupabaseAnon(env);

  // 兼容旧格式：slug 带 md/ 前缀时剥掉
  const actualSlug = slug.startsWith('md/') ? slug.replace('md/', '') : slug;

  // 查询站点
  const { data: site, error: siteError } = await supabase
    .from('gh_site')
    .select('owner_id, type')
    .eq('name', actualSlug)
    .maybeSingle();

  if (siteError || !site) {
    return new Response(render404Page('站点不存在'), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const isMdSite = site.type === 'md';

  // 获取文件内容 - Markdown 用 md/<owner>/，HTML 用 sites/
  const storagePath = isMdSite
    ? `md/${site.owner_id}/${actualSlug}/index.md`
    : `sites/${site.owner_id}/${actualSlug}/index.html`;

  const storageRes = await fetch(storageUrl(env, storagePath), {
    headers: { Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
  });

  if (!storageRes.ok) {
    return new Response(render404Page('内容未找到'), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // 计数（await：Worker 响应返回后未 await 的异步会被冻结，必须等待）
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_visit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_name: actualSlug }),
    });
  } catch (e) {}

  const injectBase = (html, prefix) => {
    const baseTag = `<base href="${prefix}">`;
    if (/<head>/i.test(html)) return html.replace(/<head>/i, '<head>' + baseTag);
    if (/<html/i.test(html)) return html.replace(/<html(\s[^>]*)?>/i, '<html$1><head>' + baseTag + '</head>');
    return baseTag + html;
  };
  const content = await storageRes.text();

  // Markdown 站点
  if (isMdSite) {
    const body = marked.parse(content);
    const title = escapeHtml(actualSlug) + ' - GooseHost';
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="icon" type="image/x-icon" href="https://host.goose.gs.cn/icons/favicon.ico">
    <link rel="stylesheet" href="https://cdn.bootcdn.net/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        :root {
            --color-fg-default: #24292f;
            --color-fg-muted: #57606a;
            --color-fg-subtle: #8c959f;
            --color-canvas-default: #ffffff;
            --color-canvas-subtle: #f6f8fa;
            --color-canvas-inset: #eaeef2;
            --color-border-default: #d0d7de;
            --color-border-muted: #d8dee4;
            --color-accent-fg: #2da44e;
            --color-accent-subtle: #e6f9ed;
            --color-success-fg: #1a7f37;
            --color-success-subtle: #dafbe1;
            --color-danger-fg: #cf222e;
            --color-danger-subtle: #ffebe9;
            --color-attention-fg: #9a6700;
            --color-attention-subtle: #fff8c5;
            --radius: 6px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.7;
            color: var(--color-fg-default);
            background: var(--color-canvas-subtle);
            overflow-x: hidden;
        }
        .header {
            background: var(--color-canvas-default);
            border-bottom: 1px solid var(--color-border-muted);
            padding: 0 24px;
            height: 60px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        .header-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 600;
            font-size: 18px;
            text-decoration: none;
            color: inherit;
        }
        .header-brand img { height: 28px; }
        .header-nav { display: flex; align-items: center; gap: 4px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .header-nav::-webkit-scrollbar { display: none; }
        .header-link {
            color: var(--color-fg-muted);
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            padding: 6px 12px;
            border-radius: var(--radius);
            white-space: nowrap;
            transition: background 0.2s;
        }
        .header-link:hover { color: var(--color-fg-default); background: var(--color-canvas-subtle); }
        .header-link.active { color: var(--color-accent-fg); }

        .container { max-width: 820px; margin: 0 auto; padding: 40px 24px 80px; }

        #md-content { color: var(--color-fg-default); }
        #md-content h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; border-bottom: 1px solid var(--color-border-muted); padding-bottom: 16px; }
        #md-content h2 { font-size: 18px; font-weight: 700; margin: 36px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border-muted); }
        #md-content h3 { font-size: 15px; font-weight: 600; margin: 20px 0 8px; }
        #md-content h4 { font-size: 14px; font-weight: 600; margin: 16px 0 6px; }
        #md-content p { margin-bottom: 14px; color: var(--color-fg-muted); }
        #md-content a { color: var(--color-accent-fg); text-decoration: none; }
        #md-content a:hover { text-decoration: underline; }
        #md-content strong { color: var(--color-fg-default); font-weight: 600; }
        #md-content code {
            font-family: 'Cascadia Code', 'Fira Code', Consolas, 'Liberation Mono', monospace;
            font-size: 12px;
            background: var(--color-canvas-inset);
            padding: 2px 5px;
            border-radius: 3px;
            color: var(--color-fg-default);
        }
        #md-content pre {
            background: var(--color-canvas-subtle);
            border: 1px solid var(--color-border-muted);
            border-radius: var(--radius);
            padding: 14px 16px;
            overflow-x: auto;
            margin-bottom: 16px;
            position: relative;
        }
        #md-content pre code {
            background: none;
            padding: 0;
            font-size: 12px;
            line-height: 1.6;
            white-space: pre;
        }
        #md-content pre .copy-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            background: var(--color-canvas-default);
            border: 1px solid var(--color-border-default);
            border-radius: var(--radius);
            padding: 3px 10px;
            font-size: 11px;
            cursor: pointer;
            color: var(--color-fg-muted);
            opacity: 0;
            transition: opacity 0.2s;
        }
        #md-content pre:hover .copy-btn { opacity: 1; }
        #md-content pre .copy-btn:hover { background: var(--color-canvas-inset); }
        #md-content table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            font-size: 13px;
        }
        #md-content th {
            background: var(--color-canvas-subtle);
            padding: 8px 12px;
            text-align: left;
            font-weight: 600;
            border: 1px solid var(--color-border-muted);
            color: var(--color-fg-muted);
        }
        #md-content td {
            padding: 7px 12px;
            border: 1px solid var(--color-border-muted);
            color: var(--color-fg-muted);
        }
        #md-content tr:nth-child(even) td { background: var(--color-canvas-subtle); }
        #md-content ul, #md-content ol { margin: 0 0 14px 20px; color: var(--color-fg-muted); }
        #md-content li { margin-bottom: 4px; }
        #md-content li ul, #md-content li ol { margin-top: 4px; margin-bottom: 0; }
        #md-content blockquote {
            background: var(--color-accent-subtle);
            border-left: 4px solid var(--color-accent-fg);
            padding: 12px 16px;
            margin: 16px 0;
            border-radius: 0 var(--radius) var(--radius) 0;
        }
        #md-content blockquote p { color: var(--color-fg-default); margin: 0; }
        #md-content img { max-width: 100%; height: auto; border-radius: var(--radius); }
        #md-content hr { border: none; border-top: 1px solid var(--color-border-muted); margin: 32px 0; }

        /* 复选框样式 */
        #md-content input[type="checkbox"] {
            width: 15px;
            height: 15px;
            margin-right: 6px;
            accent-color: var(--color-accent-fg);
            vertical-align: middle;
        }

        /* 页脚水印 */
        .md-footer {
            text-align: center;
            padding: 32px 24px 40px;
            font-size: 12px;
            color: var(--color-border-default);
        }
        .md-footer a { color: var(--color-border-default); text-decoration: none; transition: color 0.15s; }
        .md-footer a:hover { color: var(--color-accent-fg); }

        @media (max-width: 768px) {
            .header { height: 48px; padding: 0 12px; }
            .header-link { font-size: 11px; padding: 4px 8px; }
            .container { padding: 28px 16px 24px; }
            #md-content h1 { font-size: 22px; }
            #md-content h2 { font-size: 17px; }
        }
        @media (max-width: 400px) {
            .header { height: 44px; padding: 0 10px; }
            .header-link { font-size: 10px; padding: 3px 6px; }
            .header-brand { font-size: 14px; }
            .container { padding: 20px 12px 16px; }
            #md-content h1 { font-size: 19px; }
        }
        @media (max-width: 640px) {
            #md-content table,
            #md-content tbody,
            #md-content tr,
            #md-content td { display: block; }
            #md-content thead { display: none; }
            #md-content tr {
                margin-bottom: 0.75rem;
                border: 1px solid var(--color-border-muted);
                border-radius: var(--radius);
                padding: 0.6rem 0.75rem;
            }
            #md-content td {
                border: none;
                padding: 4px 0;
                font-size: 13px;
            }
            #md-content td::before {
                content: attr(data-label);
                display: block;
                font-weight: 600;
                color: var(--color-fg-default);
                font-size: 12px;
                margin-bottom: 2px;
            }
        }
    </style>
</head>
<body>
    <header class="header">
        <a href="https://host.goose.gs.cn/" class="header-brand">
            <img src="https://host.goose.gs.cn/logo.svg" alt="GooseHost" onerror="this.style.display='none'">
        </a>
        <nav class="header-nav">
            <a href="https://host.goose.gs.cn/docs/" class="header-link">使用手册</a>
            <a href="https://host.goose.gs.cn/docs/?doc=terms" class="header-link">用户协议</a>
            <a href="https://host.goose.gs.cn/changelog/" class="header-link">更新日志</a>
            <a href="https://host.goose.gs.cn/api-docs/" class="header-link">API 文档</a>
            <a href="https://host.goose.gs.cn/" class="header-link">返回首页</a>
        </nav>
    </header>
    <main class="container">
        <div id="md-content">${body}</div>
    </main>
    <footer class="md-footer"><a href="https://host.goose.gs.cn/" target="_blank">GooseHost</a></footer>
    <script>
    document.querySelectorAll('a[href^="#-"]').forEach(a => a.href = a.href.replace('#-', '#'));
    if (location.hash.startsWith('#-')) location.hash = location.hash.slice(1);

    document.querySelectorAll('#md-content pre').forEach(pre => {
      if (pre.querySelector('.copy-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = '复制';
      btn.onclick = () => {
        const code = pre.querySelector('code');
        if (code) {
          navigator.clipboard.writeText(code.textContent).then(() => {
            btn.textContent = '已复制!';
            setTimeout(() => { btn.textContent = '复制'; }, 1500);
          });
        }
      };
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
    <\/script>
</body>
</html>`;
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  }

  // HTML 站点直接返回
  return new Response(injectBase(content, `/s/${actualSlug}/`), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}