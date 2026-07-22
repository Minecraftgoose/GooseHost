// ===== 公共访问站点 =====

import { marked } from 'marked';
import { makeSupabaseAnon, storageUrl } from '../utils/supabase.js';

// 配置 marked 生成 URL-safe 的 heading ID（旧版 serve.js 配置，更稳定）
marked.use({
  renderer: {
    heading(token) {
      const text = token.text || '';
      const level = token.depth || 1;
      const raw = token.raw || '';
      // 提取标题原始文本（去掉开头的 ## 和空格，处理 ## - xxx 的情况）
      const rawText = raw
        .replace(/^#{1,6}[\s]*/, '')
        .replace(/[#*_`~]/g, '')
        .trim();
      // 生成 URL-safe slug，保留标题中的 - 分隔符
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
    <link rel="icon" type="image/x-icon" href="https://host.goose.cc.cd/icons/favicon.ico">
    <style>
        @font-face {
            font-family: 'DingTalk JinBuTi';
            src: url('https://host.goose.cc.cd/fonts/DingTalk%20JinBuTi.ttf') format('truetype');
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
        <a href="https://host.goose.cc.cd/" style="color:#02ff8e;font-weight:600;font-size:16px;">GooseHost</a>
        <a href="https://host.goose.cc.cd/">返回首页</a>
    </nav>
    <main class="container">
        <div class="code">404</div>
        <div class="msg">${escapeHtml(msg)}</div>
        <a href="https://host.goose.cc.cd/" class="back-link">
            <i class="fas fa-arrow-left"></i> 返回首页
        </a>
    </main>
    <footer class="footer"><a href="https://host.goose.cc.cd/" target="_blank">GooseHost</a></footer>
</body>
</html>`;
}

export async function handleServeSite(request, env, slug) {
  const supabase = makeSupabaseAnon(env);

  // 处理 md/ 前缀
  const isMdSite = slug.startsWith('md/');
  const actualSlug = isMdSite ? slug.replace('md/', '') : slug;

  // 查询站点
  const { data: site, error: siteError } = await supabase
    .from('gh_site')
    .select('owner_id')
    .eq('name', isMdSite ? slug : actualSlug)
    .maybeSingle();

  if (siteError || !site) {
    return new Response(render404Page('站点不存在'), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // 获取文件内容 - Markdown 用 md/public，HTML 用 sites/
  const storagePath = isMdSite
    ? `md/public/${actualSlug}/index.md`
    : `sites/${site.owner_id}/${actualSlug}/index.html`;

  const storageRes = await fetch(storageUrl(env, storagePath), {
    headers: { Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
  });

  if (!storageRes.ok) {
    return new Response(render404Page('内容未找到'), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const content = await storageRes.text();

  // Markdown 站点需要渲染为 HTML 并套上 API 文档同款样式框架
  if (isMdSite) {
    const body = marked.parse(content);
    const title = escapeHtml(actualSlug) + ' - GooseHost';
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="icon" type="image/x-icon" href="https://host.goose.cc.cd/icons/favicon.ico">
    <link rel="stylesheet" href="https://cdn.bootcdn.net/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        :root {
            --text: #1a1a2e;
            --muted: #6b7280;
            --bg: #ffffff;
            --bg-subtle: #f9fafb;
            --border: #e5e7eb;
            --accent: #2da44e;
            --accent-bg: #e6f9ed;
            --green: #2da44e;
            --radius: 8px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
            font-size: 15px;
            line-height: 1.75;
            color: var(--text);
            background: var(--bg-subtle);
        }
        .header {
            background: var(--bg);
            border-bottom: 1px solid var(--border);
            padding: 0 24px;
            height: 56px;
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
            gap: 8px;
            font-weight: 600;
            font-size: 16px;
            text-decoration: none;
            color: inherit;
        }
        .header-brand img { height: 24px; }
        .header-nav { display: flex; align-items: center; gap: 2px; }
        .header-link {
            color: var(--muted);
            text-decoration: none;
            font-size: 13px;
            font-weight: 500;
            padding: 6px 10px;
            border-radius: var(--radius);
            transition: background 0.15s;
            white-space: nowrap;
        }
        .header-link:hover { color: var(--text); background: var(--bg-subtle); }
        .container { max-width: 780px; margin: 0 auto; padding: 48px 24px 32px; }

        #md-content h1 { font-size: 28px; font-weight: 700; margin-bottom: 6px; letter-spacing: -0.02em; scroll-margin-top: 68px; }
        #md-content h2 { font-size: 20px; font-weight: 600; margin: 32px 0 10px; scroll-margin-top: 68px; }
        #md-content h3 { font-size: 16px; font-weight: 600; margin: 20px 0 6px; scroll-margin-top: 68px; }
        #md-content p { margin-bottom: 14px; color: var(--text); }
        #md-content a { color: var(--accent); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.15s; }
        #md-content a:hover { border-bottom-color: var(--accent); }
        #md-content code {
            font-family: 'Cascadia Code', 'Fira Code', Consolas, 'Liberation Mono', monospace;
            font-size: 13px;
            background: var(--bg-subtle);
            padding: 2px 6px;
            border-radius: 4px;
            color: var(--text);
            border: 1px solid var(--border);
        }
        #md-content pre {
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 16px 18px;
            overflow-x: auto;
            margin-bottom: 16px;
            position: relative;
        }
        #md-content pre code {
            background: none;
            border: none;
            padding: 0;
            font-size: 13px;
            line-height: 1.65;
        }
        #md-content pre .copy-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 4px 8px;
            font-size: 12px;
            cursor: pointer;
            color: var(--muted);
            opacity: 0.6;
            transition: opacity 0.15s;
        }
        #md-content pre .copy-btn:hover { opacity: 1; }
        #md-content pre .copy-btn.copied { color: var(--green); border-color: var(--green); }

        #md-content table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            font-size: 14px;
            border-radius: var(--radius);
            overflow: hidden;
        }
        #md-content th {
            background: var(--bg-subtle);
            padding: 10px 14px;
            text-align: left;
            font-weight: 600;
            border: 1px solid var(--border);
            color: var(--text);
        }
        #md-content td {
            padding: 9px 14px;
            border: 1px solid var(--border);
            color: var(--muted);
        }
        #md-content tr:nth-child(even) td { background: var(--bg-subtle); }
        #md-content tr:hover td { background: #f3f4f6; }

        #md-content ul, #md-content ol { margin: 0 0 14px 20px; color: var(--text); }
        #md-content li { margin-bottom: 4px; }

        #md-content blockquote {
            background: var(--accent-bg);
            border-left: 3px solid var(--accent);
            padding: 14px 18px;
            margin: 16px 0;
            border-radius: 0 var(--radius) var(--radius) 0;
        }
        #md-content blockquote p { color: var(--text); margin: 0; }
        #md-content img { max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        #md-content hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }

        /* 复选框样式 */
        #md-content input[type="checkbox"] {
            width: 15px;
            height: 15px;
            margin-right: 6px;
            accent-color: var(--green);
            vertical-align: middle;
        }

        /* 页脚水印 */
        .md-footer {
            text-align: center;
            padding: 32px 24px 40px;
            font-size: 12px;
            color: var(--border);
        }
        .md-footer a { color: var(--border); text-decoration: none; transition: color 0.15s; }
        .md-footer a:hover { color: var(--accent); }

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
    </style>
</head>
<body>
    <header class="header">
        <a href="https://host.goose.cc.cd/" class="header-brand">
            <img src="https://host.goose.cc.cd/logo.svg" alt="GooseHost" onerror="this.style.display='none'">
        </a>
        <nav class="header-nav">
            <a href="https://host.goose.cc.cd/changelog/" class="header-link">更新日志</a>
            <a href="https://host.goose.cc.cd/api-docs/" class="header-link">API 文档</a>
            <a href="https://host.goose.cc.cd/docs/" class="header-link">用户协议</a>
            <a href="https://host.goose.cc.cd/" class="header-link">返回首页</a>
        </nav>
    </header>
    <main class="container">
        <div id="md-content">${body}</div>
    </main>
    <footer class="md-footer"><a href="https://host.goose.cc.cd/" target="_blank">GooseHost</a></footer>
    <script>
    // 修复 Markdown 锚点兼容：支持 #xxx 和 #-xxx 两种写法
    document.querySelectorAll('a[href^="#-"]').forEach(a => a.href = a.href.replace('#-', '#'));
    if (location.hash.startsWith('#-')) location.hash = location.hash.slice(1);

    // 复制按钮功能：始终显示，点击复制，图标切换
    document.querySelectorAll('#md-content pre').forEach(pre => {
      if (pre.querySelector('.copy-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.innerHTML = '<i class="fas fa-copy"></i>';
      btn.title = '复制代码';
      btn.onclick = () => {
        const code = pre.querySelector('code');
        if (code) {
          navigator.clipboard.writeText(code.textContent).then(() => {
            btn.innerHTML = '<i class="fas fa-check"></i>';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.innerHTML = '<i class="fas fa-copy"></i>';
              btn.classList.remove('copied');
            }, 1500);
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
  return new Response(content, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}