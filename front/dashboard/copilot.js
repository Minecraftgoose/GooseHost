(function () {
    'use strict';
    var API_FALLBACK = 'https://page.goose.cc.cd';

    var CUSTOM_MODEL_KEY = 'cop_custom_model_v1';
    var customModel = loadCustomModel();

    function loadCustomModel() {
        try {
            var o = JSON.parse(localStorage.getItem(CUSTOM_MODEL_KEY) || 'null') || {};
            return {
                enabled: !!o.enabled,
                endpoint: String(o.endpoint || '').trim(),
                apiKey: '',
                model: String(o.model || '').trim()
            };
        } catch (e) {
            return { enabled: false, endpoint: '', apiKey: '', model: '' };
        }
    }
    function saveCustomModel(cfg) {
        customModel = {
            enabled: !!cfg.enabled,
            endpoint: String(cfg.endpoint || '').trim(),
            apiKey: String(cfg.apiKey || '').trim(),
            model: String(cfg.model || '').trim()
        };
        // 安全：apiKey 属于敏感凭据，不写入 localStorage（避免 clear-text storage / XSS 窃取）。
        // 仅持久化非敏感配置；apiKey 只保留在内存中，刷新后需重新填写。
        try {
            var persisted = { enabled: customModel.enabled, endpoint: customModel.endpoint, model: customModel.model };
            localStorage.setItem(CUSTOM_MODEL_KEY, JSON.stringify(persisted));
        } catch (e) { }
        return customModel;
    }
    function normalizeEndpoint(v) {
        var base = String(v || '').trim().replace(/\/+$/, '');
        if (!base) return '';
        if (/\/chat\/completions$/i.test(base)) return base;
        return base + '/chat/completions';
    }
    function customModelReady() {
        return !!(customModel.enabled && customModel.endpoint && customModel.apiKey);
    }
    function chatEndpoint() {
        if (customModelReady()) return normalizeEndpoint(customModel.endpoint);
        if (window.COPILOT_CHAT_URL) return window.COPILOT_CHAT_URL;
        var base = (window.API_URL || API_FALLBACK).replace(/\/$/, '');
        return base + '/api/ai/chat';
    }
    function buildChatBody(messages, stream) {
        var body = { messages: messages, tools: TOOLS, temperature: 0.3 };
        if (customModelReady() && customModel.model) body.model = customModel.model;
        if (stream) body.stream = true;
        return JSON.stringify(body);
    }
    function botIcon(size) {
        var s = size || 50;
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
            + 'width="' + s + '" height="' + s + '" fill="none">'
            + '<path d="M 50 10 H 20 C 20 10 10 10 10 50" stroke="currentColor" stroke-width="10" stroke-linecap="square" />'
            + '<path d="M 50 90 H 80 C 80 90 90 90 90 50" stroke="currentColor" stroke-width="10" stroke-linecap="square" />'
            + '<circle cx="50" cy="50" r="5" fill="currentColor" />'
            + '</svg>';
    }
    var PUBLIC_BASE = window.COPILOT_PUBLIC_BASE || 'https://page.goose.cc.cd';
    var SITE_PREFIX = { html: '/s/', md: '/md/', project: '/p/' };               
    var MAX_FILES = 50;                 
    var MAX_FILE_SIZE = 200 * 1024;     
    var MAX_TOTAL = 2 * 1024 * 1024;    
    var MAX_ZIP_B64 = 3 * 1024 * 1024;  
    var ALLOWED_EXTS = new Set([
        'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'md', 'markdown',
        'json', 'txt', 'text', 'svg', 'xml', 'yml', 'yaml', 'toml',
        'ini', 'conf', 'cfg', 'csv', 'ts', 'tsx', 'jsx', 'py',
        'c', 'cpp', 'cc', 'h', 'hpp', 'java', 'go', 'rs',
        'sh', 'bash', 'zsh', 'vue', 'svelte', 'wasm'
    ]);
    var BLOCKED_HINT = {
        png: 'PNG 位图', jpg: 'JPG 位图', jpeg: 'JPEG 位图', gif: 'GIF 动图',
        webp: 'WebP 位图', ico: 'ICO 图标', bmp: 'BMP 位图',
        ttf: '字体文件', woff: '字体文件', woff2: '字体文件', otf: '字体文件', eot: '字体文件'
    };
    function extOf(path) {
        var dot = String(path).lastIndexOf('.');
        return dot === -1 ? '' : String(path).slice(dot + 1).toLowerCase();
    }
    function apiBase() {
        try {
            if (typeof API_URL !== 'undefined' && API_URL) return String(API_URL).replace(/\/$/, '');
        } catch (e) { }
        if (window.API_URL) return String(window.API_URL).replace(/\/$/, '');
        return 'https://page.goose.cc.cd';
    }
    function dashApi(path, options) {
        var url = apiBase() + path;
        if (typeof apiFetch === 'function') return apiFetch(url, options || {});
        return copFetch(url, options || {});
    }
    function parseBody(res) {
        var data = {};
        try {
            return res.json().then(function (d) { return d || {}; }).catch(function () { return {}; })
                .then(function (d) {
                    if (!res.ok) throw new Error(d.error || ('请求失败（HTTP ' + res.status + '）'));
                    return d;
                });
        } catch (e) {
            return Promise.reject(new Error('响应解析失败'));
        }
    }
    function dashGet(path) {
        return dashApi(path, { method: 'GET' }).then(parseBody);
    }
    function dashSend(path, method, payload) {
        return dashApi(path, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: payload === undefined ? undefined : JSON.stringify(payload)
        }).then(parseBody);
    }
    function copConfirm(title, message) {
        try {
            if (typeof showConfirm === 'function') return showConfirm(title, message);
        } catch (e) { }
        return Promise.resolve(window.confirm(title + '\n' + message));
    }
    function refreshDashboard() {
        try { if (typeof loadSites === 'function') loadSites(); } catch (e) { }
    }
    function dashToast(msg, type) {
        try { if (typeof showToast === 'function') showToast(msg, type || 'success'); } catch (e) { }
    }
    function siteDigest() {
        var list = [];
        try { if (window.allSites && window.allSites.length) list = window.allSites; } catch (e) { }
        if (!list.length) return '';
        var lines = list.slice(0, 60).map(function (s) {
            return '- ' + s.name + ' [' + (s.type || 'html') + '] 访问 ' + (s.visit_count || 0)
                + ' 次 · 更新 ' + String(s.updated_at || '').slice(0, 10);
        });
        return '【当前账号站点清单 · 共 ' + list.length + ' 个】\n' + lines.join('\n')
            + '\n访问地址：html → ' + PUBLIC_BASE.replace(/\/$/, '') + '/s/<slug>'
            + '，md → /md/<slug>，project → /p/<slug>';
    }
    var SLUG_RE = /^[A-Za-z0-9_\-.~]{1,64}$/;
    function validateForDeploy(files) {
        var errors = [];
        var ok = [];
        var total = 0;
        if (!files.length) errors.push('沙箱为空，先写点东西再部署');
        if (files.length > MAX_FILES) errors.push('文件数量 ' + files.length + ' 个，超过上限 ' + MAX_FILES + ' 个');
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var ext = extOf(f.path);
            var size = f.binary ? (f.blob ? f.blob.size : 0) : (f.content ? f.content.length : 0);
            if (BLOCKED_HINT[ext]) {
                errors.push('不支持的文件类型：' + f.path + '（' + BLOCKED_HINT[ext] + ' 被后端拒绝）。'
                    + '图片请改用 SVG 内联或 .svg 文件，字体请改用系统字体或外部 CDN');
                continue;
            }
            if (!ALLOWED_EXTS.has(ext)) {
                errors.push('不允许的文件类型：' + f.path + '（扩展名 .' + (ext || '无') + ' 不在白名单）');
                continue;
            }
            if (size > MAX_FILE_SIZE) {
                errors.push('单文件超过 200KB：' + f.path + '（' + Math.ceil(size / 1024) + 'KB）');
                continue;
            }
            total += size;
            ok.push(f);
        }
        if (total > MAX_TOTAL) {
            errors.push('解压后总计 ' + (total / 1024 / 1024).toFixed(2) + 'MB，超过 2MB 上限');
        }
        return { files: ok, total: total, errors: errors };
    }
    var MAX_ROUNDS = 12;          
    var MAX_OUT = 8000;           
    var mounted = false;
    var VFS = (function () {
        var DB = 'goosehost_copilot_vfs', VER = 1, STORE = 'nodes', dbp = null, rootp = null;
        function open() {
            if (dbp) return dbp;
            dbp = new Promise(function (res, rej) {
                var r = indexedDB.open(DB, VER);
                r.onupgradeneeded = function () {
                    var db = r.result;
                    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'path' });
                };
                r.onsuccess = function () { res(r.result); };
                r.onerror = function () { rej(r.error); };
            });
            return dbp;
        }
        function ensureRoot() {
            if (!rootp) {
                rootp = open().then(function (db) {
                    return new Promise(function (res, rej) {
                        var t = db.transaction(STORE, 'readwrite');
                        t.objectStore(STORE).put({ path: '/', type: 'dir', updatedAt: Date.now() });
                        t.oncomplete = function () { res(true); };
                        t.onerror = t.onabort = function () { rej(t.error); };
                    });
                });
            }
            return rootp;
        }
        function run(mode, fn) {
            return ensureRoot().then(function () { return open(); }).then(function (db) {
                return new Promise(function (res, rej) {
                    var t = db.transaction(STORE, mode), s = t.objectStore(STORE), out;
                    try { out = fn(s); } catch (e) { rej(e); return; }
                    t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
                    t.onerror = t.onabort = function () { rej(t.error); };
                });
            });
        }
        function norm(p) {
            p = String(p == null ? '' : p).trim().replace(/\\/g, '/');
            if (!p) return '/';
            if (!p.startsWith('/')) p = '/' + p;
            var out = [], segs = p.split('/');
            for (var i = 0; i < segs.length; i++) {
                var seg = segs[i];
                if (!seg || seg === '.') continue;
                if (seg === '..') out.pop(); else out.push(seg);
            }
            return '/' + out.join('/');
        }
        function dirname(p) { p = norm(p); var i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
        function basename(p) { p = norm(p); return p === '/' ? '/' : p.slice(p.lastIndexOf('/') + 1); }
        function parents(p) { var out = [], d = dirname(p); while (d && d !== '/') { out.push(d); d = dirname(d); } return out; }
        function all() { return run('readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; }); }
        function get(p) { return run('readonly', function (s) { return s.get(norm(p)); }); }
        function put(node) { return run('readwrite', function (s) { return s.put(node); }); }
        function del(p) { return run('readwrite', function (s) { return s.delete(norm(p)); }); }
        async function clear() {
            await run('readwrite', function (s) { return s.clear(); });
            rootp = null;                 
            await ensureRoot();
        }
        async function writeFile(p, content, binary, meta) {
            p = norm(p);
            var ps = parents(p);
            for (var i = 0; i < ps.length; i++) await put({ path: ps[i], type: 'dir', updatedAt: Date.now() });
            await put(Object.assign({ path: p, type: 'file', content: content, binary: !!binary, updatedAt: Date.now() }, meta || {}));
            return p;
        }
        async function mkdir(p) {
            p = norm(p);
            var ps = parents(p).concat([p]);
            for (var i = 0; i < ps.length; i++) await put({ path: ps[i], type: 'dir', updatedAt: Date.now() });
            return p;
        }
        async function readFile(p) {
            var n = await get(p);
            if (!n) throw new Error('ENOENT: 文件不存在 → ' + norm(p));
            if (n.type === 'dir') throw new Error('EISDIR: 这是一个目录 → ' + norm(p));
            return n;
        }
        async function exists(p) { return !!(await get(p)); }
        async function list(p) {
            p = norm(p);
            var nodes = await all();
            var prefix = p === '/' ? '/' : p + '/', out = [];
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (n.path === p || n.path.indexOf(prefix) !== 0) continue;
                if (n.path.slice(prefix.length).indexOf('/') !== -1) continue;
                out.push(n);
            }
            return out.sort(function (a, b) {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return a.path.localeCompare(b.path);
            });
        }
        async function remove(p, recursive) {
            p = norm(p);
            var nodes = await all();
            var group = nodes.filter(function (n) { return n.path === p || n.path.indexOf(p === '/' ? '/' : p + '/') === 0; });
            if (!group.length) throw new Error('ENOENT: 不存在 → ' + p);
            if (group.length > 1 && !recursive) throw new Error('ENOTEMPTY: 目录非空，请使用 rm -r');
            for (var i = 0; i < group.length; i++) await del(group[i].path);
            if (p === '/') { rootp = null; await ensureRoot(); }
            return group.length;
        }
        async function move(a, b) {
            a = norm(a); b = norm(b);
            var nodes = await all();
            var group = nodes.filter(function (n) { return n.path === a || n.path.indexOf(a + '/') === 0; });
            if (!group.length) throw new Error('ENOENT: 不存在 → ' + a);
            for (var i = 0; i < group.length; i++) {
                var n = group[i], np = b + n.path.slice(a.length);
                await put(Object.assign({}, n, { path: np }));
                if (np !== n.path) await del(n.path);
            }
            return b;
        }
        async function copy(a, b) {
            a = norm(a); b = norm(b);
            var nodes = await all();
            var group = nodes.filter(function (n) { return n.path === a || n.path.indexOf(a + '/') === 0; });
            if (!group.length) throw new Error('ENOENT: 不存在 → ' + a);
            for (var i = 0; i < group.length; i++) {
                var n = group[i], np = b + n.path.slice(a.length);
                await put(Object.assign({}, n, { path: np, updatedAt: Date.now() }));
            }
            return b;
        }
        async function grep(pattern, p, ignoreCase) {
            p = norm(p || '/');
            var re;
            try { re = new RegExp(pattern, ignoreCase ? 'gi' : 'g'); }
            catch (e) { throw new Error('正则非法: ' + pattern); }
            var nodes = await all(), hits = [], total = 0;
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (n.type !== 'file' || n.binary) continue;
                if (p !== '/' && n.path !== p && n.path.indexOf(p === '/' ? '/' : p + '/') !== 0) continue;
                var lines = String(n.content).split('\n');
                for (var j = 0; j < lines.length; j++) {
                    re.lastIndex = 0;
                    if (re.test(lines[j])) { hits.push(n.path + ':' + (j + 1) + ': ' + lines[j]); total++; }
                    if (hits.length >= 200) break;
                }
                if (hits.length >= 200) break;
            }
            return { hits: hits, truncated: total >= 200 };
        }
        async function tree(p) {
            var nodes = (await all()).filter(function (n) { return n.type === 'file'; }).map(function (n) { return n.path; });
            return nodes.sort();
        }
        async function exportFiles(dir) {
            dir = norm(dir || '/');
            var nodes = await all(), out = [];
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (n.type !== 'file') continue;
                if (dir !== '/' && n.path !== dir && n.path.indexOf(dir + '/') !== 0) continue;
                out.push({ path: n.path, content: n.content, binary: !!n.binary, generated: !!n.generated });
            }
            return out;
        }
        return {
            norm: norm, dirname: dirname, basename: basename, all: all, get: get, clear: clear,
            writeFile: writeFile, mkdir: mkdir, readFile: readFile, exists: exists, list: list,
            remove: remove, move: move, copy: copy, grep: grep, tree: tree, exportFiles: exportFiles
        };
    })();
    var Shell = {
        cwd: '/',
        resolve: function (p) {
            if (!p || p === '.') return this.cwd;
            if (p === '..') return VFS.dirname(this.cwd);
            if (p === '~' || p === '/') return '/';
            return VFS.norm(p.startsWith('/') ? p : (this.cwd === '/' ? '' : this.cwd) + '/' + p);
        },
        tokenize: function (line) {
            var out = [], cur = '', q = null;
            for (var i = 0; i < line.length; i++) {
                var c = line[i];
                if (q) { if (c === q) q = null; else cur += c; continue; }
                if (c === '"' || c === "'") { q = c; continue; }
                if (/\s/.test(c)) { if (cur) { out.push(cur); cur = ''; } continue; }
                cur += c;
            }
            if (cur) out.push(cur);
            return out;
        },
        run: function (line) { return runLine(String(line || '').trim()); }
    };
    async function runLine(line) {
        if (!line) return '';
        var parts = splitPipe(line);
        var stdin = '';
        for (var i = 0; i < parts.length; i++) {
            stdin = await runOne(parts[i], stdin);
        }
        return stdin;
    }
    function splitPipe(line) {
        var out = [], cur = '', q = null;
        for (var i = 0; i < line.length; i++) {
            var c = line[i];
            if (q) { cur += c; if (c === q) q = null; continue; }
            if (c === '"' || c === "'") { q = c; cur += c; continue; }
            if (c === '|') { out.push(cur); cur = ''; continue; }
            cur += c;
        }
        out.push(cur);
        return out.map(function (s) { return s.trim(); }).filter(Boolean);
    }
    async function runOne(seg, stdin) {
        var redirect = null, m = seg.match(/(>>?>?)\s*([^\s>|]+)\s*$/);
        if (m && (m[1] === '>' || m[1] === '>>')) {
            redirect = { mode: m[1], path: m[2] };
            seg = seg.slice(0, m.index).trim();
        }
        var tk = Shell.tokenize(seg);
        if (!tk.length) return stdin;
        var cmd = tk[0], args = tk.slice(1);
        var out = await execCmd(cmd, args, stdin);
        if (redirect) {
            var p = Shell.resolve(redirect.path);
            if (redirect.mode === '>>') {
                var old = '';
                try { old = (await VFS.readFile(p)).content || ''; } catch (e) { old = ''; }
                await VFS.writeFile(p, old + out);
            } else {
                await VFS.writeFile(p, out);
            }
            refreshTree();
            return '';
        }
        return out;
    }
    async function execCmd(cmd, args, stdin) {
        var flags = args.filter(function (a) { return a.charAt(0) === '-'; }).join('');
        var pos = args.filter(function (a) { return a.charAt(0) !== '-'; });
        switch (cmd) {
            case 'help':
                return [
                    'GooseHost Copilot 沙箱命令：',
                    '',
                    '  查看',
                    '  ls [-l] [path]',
                    '    列出目录，-l 显示大小',
                    '  cat <file>',
                    '    查看文件内容',
                    '  tree',
                    '    列出沙箱全部文件',
                    '  pwd',
                    '    显示当前路径',
                    '  head [-n N] <file>',
                    '    查看开头 N 行，默认 10 行',
                    '  tail [-n N] <file>',
                    '    查看结尾 N 行，默认 10 行',
                    '  wc [-l] <file>',
                    '    统计字符数与行数',
                    '',
                    '  编辑',
                    '  cd <dir>',
                    '    切换目录，.. 上级，/ 根目录',
                    '  echo <text> [> file]',
                    '    输出文本，带 > 则写入文件',
                    '  mkdir [-p] <dir>',
                    '    创建目录',
                    '  touch <file>',
                    '    创建空文件',
                    '  rm [-r] <path>',
                    '    删除文件，加 -r 删目录',
                    '  mv <src> <dst>',
                    '    移动或重命名',
                    '  cp <src> <dst>',
                    '    复制',
                    '',
                    '  搜索',
                    '  grep [-i] <pat> [path]',
                    '    搜索文件内容，-i 忽略大小写',
                    '',
                    '  发布与导出',
                    '  zip [out.zip] [dir]',
                    '    把沙箱打成 zip',
                    '  deploy <slug> [dir] [--force]',
                    '    发布站点，--force 覆盖旧站',
                    '  download <file>',
                    '    导出文件到本地',
                    '',
                    '  其他',
                    '  wipe',
                    '    清空整个沙箱',
                    '  clear',
                    '    清屏',
                    '  help',
                    '    显示本帮助',
                    '',
                    '  管道与重定向',
                    '  支持 | 管道与 > >> 重定向',
                    '  例：grep -i title / | head',
                ].join('\n');
            case 'pwd': return Shell.cwd;
            case 'cd': {
                var t = Shell.resolve(pos[0] || '/');
                var node = await VFS.get(t);
                if (!node) throw new Error('cd: 目录不存在 → ' + t);
                if (node.type !== 'dir') throw new Error('cd: 不是目录 → ' + t);
                Shell.cwd = t;
                return '';
            }
            case 'ls': {
                var dir = Shell.resolve(pos[0] || Shell.cwd);
                var items = await VFS.list(dir);
                if (!items.length) return '（空目录）';
                if (flags.indexOf('l') !== -1) {
                    return items.map(function (n) {
                        var size = n.type === 'file' ? String(n.content == null ? 0 : n.content.length) : '-';
                        return (n.type === 'dir' ? 'd' : '-') + 'rw-r--r--  ' + pad(size, 8) + '  ' + relLabel(n.path, dir, true);
                    }).join('\n');
                }
                return items.map(function (n) { return relLabel(n.path, dir, true); }).join('  ');
            }
            case 'cat': {
                if (!pos.length) return stdin;
                var chunks = [];
                for (var i = 0; i < pos.length; i++) {
                    var f = await VFS.readFile(Shell.resolve(pos[i]));
                    chunks.push(f.binary ? '[二进制文件 ' + f.path + ']' : f.content);
                }
                return chunks.join('\n');
            }
            case 'echo': {
                var text = args.join(' ');
                text = stdin ? (text ? text + '\n' + stdin : stdin) : text;
                return text + '\n';   
            }
            case 'mkdir': {
                var d = Shell.resolve(pos[0]);
                await VFS.mkdir(d);
                refreshTree();
                return '';
            }
            case 'touch': {
                var tp = Shell.resolve(pos[0]);
                if (!(await VFS.exists(tp))) await VFS.writeFile(tp, '');
                refreshTree();
                return '';
            }
            case 'rm': {
                var rp = Shell.resolve(pos[0]);
                var n = await VFS.remove(rp, flags.indexOf('r') !== -1);
                refreshTree();
                return '已删除 ' + n + ' 个节点';
            }
            case 'mv': await VFS.move(Shell.resolve(pos[0]), Shell.resolve(pos[1])); refreshTree(); return '已移动';
            case 'cp': await VFS.copy(Shell.resolve(pos[0]), Shell.resolve(pos[1])); refreshTree(); return '已复制';
            case 'grep': {
                var pat = pos[0];
                var target = pos[1] ? Shell.resolve(pos[1]) : Shell.cwd;
                var r = await VFS.grep(pat, target, flags.indexOf('i') !== -1);
                return r.hits.length ? r.hits.join('\n') + (r.truncated ? '\n…（结果过多已截断）' : '') : '无匹配';
            }
            case 'tree': {
                var files = await VFS.tree();
                if (!files.length) return '（沙箱为空）';
                return files.map(function (p) { return p.slice(1); }).join('\n');
            }
            case 'wc': {
                var src = pos.length ? (await VFS.readFile(Shell.resolve(pos[0]))).content : stdin;
                var lines = String(src).split('\n').length;
                return (flags.indexOf('l') !== -1 ? '' : String(src).length + ' ') + lines;
            }
            case 'head': case 'tail': {
                var body = pos.length ? (await VFS.readFile(Shell.resolve(pos[0]))).content : stdin;
                var arr = String(body).split('\n');
                var k = parseInt((flags.match(/\d+/) || [10])[0], 10) ||
                    parseInt((args.join(' ').match(/-n\s*(\d+)/) || [])[1] || 10, 10);
                return (cmd === 'head' ? arr.slice(0, k) : arr.slice(-k)).join('\n');
            }
            case 'zip': {
                var outZip = pos[0] || 'site.zip';
                var srcDir = pos[1] ? Shell.resolve(pos[1]) : '/';
                var info = await packZip(srcDir, outZip);
                refreshTree();
                return '已打包 ' + info.count + ' 个文件 → ' + info.path + '（' + fmtSize(info.size) + '）';
            }
            case 'deploy': {
                var slug = pos[0];
                var dir = pos[1] && pos[1].charAt(0) !== '-' ? Shell.resolve(pos[1]) : '/';
                if (!slug || slug.charAt(0) === '-') throw new Error('用法: deploy <子域名> [目录] [--force]');
                var force = flags.indexOf('force') !== -1;
                var res = await deploySite(slug, dir, force);
                return '部署成功' + (res.overwritten ? '（已覆盖旧站点）' : '') + ' → ' + res.url;
            }
            case 'download': {
                var dp = Shell.resolve(pos[0]);
                var node2 = await VFS.readFile(dp);
                downloadBlob(new Blob([node2.binary ? b64ToU8(node2.content) : node2.content]), VFS.basename(dp));
                return '已导出 ' + dp;
            }
            case 'wipe': {
                await VFS.clear();
                Shell.cwd = '/';
                refreshTree();
                return '沙箱已清空';
            }
            case 'clear': return '__CLEAR__';
            default:
                throw new Error('未知命令: ' + cmd + '（输入 help 查看可用命令）');
        }
    }
    function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
    function relLabel(p, dir, markDir) {
        var name = p.slice(dir === '/' ? 1 : dir.length + 1);
        return name;
    }
    function b64ToU8(b64) {
        var bin = atob(b64), u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
    }
    function toBase64(blob) {
        return new Promise(function (res, rej) {
            var fr = new FileReader();
            fr.onload = function () { res(String(fr.result).split(',')[1] || ''); };
            fr.onerror = function () { rej(fr.error); };
            fr.readAsDataURL(blob);
        });
    }
    var JSZIP_SOURCES = [
        'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
        'https://cdn.bootcdn.net/ajax/libs/jszip/3.10.1/jszip.min.js',
        'https://cdn.staticfile.org/jszip/3.10.1/jszip.min.js'
    ];
    var jszipPromise = null;
    function loadJSZip() {
        if (window.JSZip) return Promise.resolve(window.JSZip);
        if (jszipPromise) return jszipPromise;   
        jszipPromise = (async function () {
            var errs = [];
            for (var i = 0; i < JSZIP_SOURCES.length; i++) {
                try {
                    await new Promise(function (res, rej) {
                        var s = document.createElement('script');
                        s.src = JSZIP_SOURCES[i];
                        s.async = true;
                        s.onload = res;
                        s.onerror = function () { rej(new Error('加载失败')); };
                        document.head.appendChild(s);
                    });
                    if (window.JSZip) return window.JSZip;
                    errs.push(JSZIP_SOURCES[i] + ' 已加载但 JSZip 未定义');
                } catch (e) {
                    errs.push(JSZIP_SOURCES[i] + ' ' + (e && e.message ? e.message : e));
                }
            }
            throw new Error('JSZip 加载失败（已尝试 ' + JSZIP_SOURCES.length + ' 个 CDN）：' + errs.join('；'));
        })();
        return jszipPromise;
    }
    async function packZip(dir, outPath) {
        var target = VFS.norm((outPath && outPath.match(/\.zip$/i)) ? outPath : (outPath || 'site') + '.zip');
        var files = (await VFS.exportFiles(dir)).filter(function (f) {
            return f.path !== target && !f.generated;
        });
        if (!files.length) throw new Error('目录为空，没有可打包的文件');
        var JSZip = await loadJSZip();
        var zip = new JSZip();
        files.forEach(function (f) {
            var rel = f.path.replace(/^\//, '');
            zip.file(rel, f.binary ? b64ToU8(f.content) : f.content);
        });
        var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        await VFS.writeFile(target, await toBase64(blob), true, { generated: true });
        return { path: target, size: blob.size, count: files.length, blob: blob };
    }
    async function deleteSite(slug) {
        var res = await apiFetch(apiBase() + '/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: slug })
        });
        var data = {};
        try { data = await res.json(); } catch (e) { }
        return res.ok && data.success;
    }
    function siteUrl(slug, data) {
        if (data && data.url) return data.url;
        var type = (data && data.type) || 'html';
        var prefix = SITE_PREFIX[type] || SITE_PREFIX.html;
        return PUBLIC_BASE.replace(/\/$/, '') + prefix + slug;
    }
    async function deploySite(slug, dir, force) {
        slug = String(slug || '').trim();
        if (!slug) throw new Error('缺少子域名');
        if (!SLUG_RE.test(slug)) {
            throw new Error('子域名格式不合法：只支持 1-64 位字母、数字、- _ . ~，'
                + '不能用中文或空格。当前值「' + slug + '」请换一个');
        }
        var raw = (await VFS.exportFiles(dir || '/')).filter(function (f) { return !f.generated; });
        var v = validateForDeploy(raw);
        if (v.errors.length) {
            throw new Error('部署前校验未通过：\n- ' + v.errors.join('\n- '));
        }
        var files = v.files;
        var body = { slug: slug };
        var type = 'project';
        if (files.length === 1 && !files[0].binary) {
            var ext = extOf(files[0].path);
            if (ext === 'html' || ext === 'htm') { body.html = files[0].content; type = 'html'; }
            else if (ext === 'md' || ext === 'markdown') { body.md = files[0].content; type = 'md'; }
        }
        if (!body.html && !body.md) {
            var info = await packZip(dir || '/', 'site.zip');
            var b64 = await toBase64(info.blob);
            if (b64.length > MAX_ZIP_B64) {
                throw new Error('压缩包过大：base64 后 ' + Math.ceil(b64.length / 1024 / 1024 * 100) / 100
                    + 'MB，超过 3MB 上限。请精简资源或减少文件');
            }
            body.type = 'project';
            body.zip = b64;
            type = 'project';
        }
        var res = await apiFetch(apiBase() + '/api/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        var data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        if (res.status === 409 && force) {
            var deleted = await deleteSite(slug);
            if (!deleted) throw new Error('站点名「' + slug + '」已被占用，且删除旧站点失败');
            var res2 = await apiFetch(apiBase() + '/api/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            try { data = await res2.json(); } catch (e) { data = {}; }
            if (!res2.ok || !data.success) {
                throw new Error(data.error || ('覆盖部署失败（HTTP ' + res2.status + '）'));
            }
            return { slug: slug, url: siteUrl(slug, data), data: data, overwritten: true };
        }
        if (!res.ok || !data.success) {
            var msg = data.error || ('部署失败（HTTP ' + res.status + '）');
            if (res.status === 409) msg += '。可以换个名字，或用 force=true 覆盖（会先删除同名旧站点）';
            throw new Error(msg);
        }
        return { slug: slug, url: siteUrl(slug, { url: data.url, type: data.type || type }), data: data };
    }
    async function updateProjectFile(slug, relPath, content) {
        slug = String(slug || '').trim();
        relPath = String(relPath || '').trim().replace(/^\/+/, '');
        if (!slug || !relPath) throw new Error('缺少 slug 或文件路径');
        if (!ALLOWED_EXTS.has(extOf(relPath))) {
            throw new Error('不允许的文件类型：' + relPath + '（扩展名不在后端白名单）');
        }
        if (content.length > MAX_FILE_SIZE) {
            throw new Error('内容超过 200KB：' + relPath);
        }
        var res = await apiFetch(apiBase() + '/api/proj-file/' + encodeURIComponent(slug) + '/' + relPath, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
        });
        var data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok || !data.success) throw new Error(data.error || ('更新失败（HTTP ' + res.status + '）'));
        return { slug: slug, path: relPath, url: PUBLIC_BASE.replace(/\/$/, '') + '/p/' + slug };
    }
    function downloadBlob(blob, name) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name || 'file';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function fmtSize(n) {
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1024 / 1024).toFixed(2) + ' MB';
    }
    var SYSTEM_PROMPT = [
        '你是 GooseHost Copilot，别名"小鹅C"，运行在沙箱环境中，帮用户创建、修改并发布静态网站。',
        '沙箱是一个类 Unix 的虚拟文件系统（根为 /，全局单一工作区）。',
        '规则：',
        '1. 只通过工具操作文件，不要凭空声称已创建；每次写文件后简要说明改了什么。',
        '2. 做站点时以 index.html 为入口，静态资源用相对路径，保证 zip 上传后可直接访问。',
        '3. 需要一次性写多文件时，逐个调用 write_file，不要偷懒只给代码片段让用户自己拼。',
        '4. 不确定目录结构时先 list_dir 或 tree。',
        '5. 发布前确认子域名（slug）；用户没给就先问，不要擅自 deploy。部署成功后务必把完整访问链接告诉用户。',
        '6. 多文件站点必须先用 zip_pack 或直接 deploy（内部会自动打包成 zip 再上传）。',
        '7. 默认输出结构清晰的多文件（index.html + style.css + script.js）。',
        '   若 deploy 报错提到不支持 zip / project / 多文件，就把 CSS 和 JS 全部内联进单个 index.html，',
        '   改成单文件后重新 deploy —— 单文件走 html 通道，兼容性最好。',
        '',
        '【后端硬性限制 · 违反会被直接拒绝，务必遵守】',
        'A. 文件类型白名单：只允许代码和文本文件，外加 .svg。',
        '   **严禁生成 png / jpg / jpeg / gif / webp / ico 等位图，严禁 ttf / woff / woff2 / otf 字体文件**。',
        '   需要图片就用内联 SVG 或 .svg 文件；需要图标用 SVG symbol 或 emoji；',
        '   需要字体就用系统字体栈（如 -apple-system, "PingFang SC", sans-serif）或外部 CDN 链接。',
        'B. 体积：单文件 ≤ 200KB，所有文件合计 ≤ 2MB，最多 50 个文件。',
        '   压缩包内必须有 index.html（或 index.md）作为入口，否则部署失败。',
        'C. 子域名 slug：1-64 位，只能用字母、数字、- _ . ~，**不能用中文和空格**。',
        '   用户给了中文站点名，你要自己翻译成合适的英文 slug（比如「我的博客」→ my-blog）。',
        'D. 站点名被占用（报错含「已被占用」）：先问用户换名字还是覆盖；',
        '   用户同意覆盖就传 force=true（会先删除同名旧站点再发布，旧内容不可恢复，必须先征询用户）。',
        'E. 访问地址格式：单文件 HTML 是 https://page.goose.cc.cd/s/<slug>，',
        '   Markdown 是 /md/<slug>，多文件是 /p/<slug>。部署成功后把完整链接给用户。',
        'F. 改已发布的多文件站点中的单个文件，优先用 update_project_file，不必重新打包整个站点。',
        '',
        '9. 工具返回以 ERROR: 开头表示执行失败，读清错误原因再重试或换方案，不要假装成功。',
        '   尤其遇到「部署前校验未通过」，按提示逐个修掉问题文件再重试。',
        '10. 回复用简体中文，简洁克制，不堆砌解释。',
        '',
        '【账号控制面板能力 · 你可以直接操作这个账号下已存在的站点】',
        '除了在沙箱里造新站，你还能像用户本人一样管理账号里已发布的所有站点：',
        '- list_my_sites：列出账号下全部站点（类型、访问量、更新时间）。',
        '  用户说「我的那个站」「把 xxx 删了」时，先调它核对 slug，不要凭记忆猜。',
        '- get_site_content / update_site_content：读写 html、md 站点的线上内容（改前可先读回原文，避免误覆盖）。',
        '- list_project_files / read_project_file / update_project_file / delete_project_file：管理多文件（project）站点的文件。',
        '- delete_site：删除站点，不可恢复。必须先向用户复述站点名并得到同意，工具执行时用户还要再点一次确认框。',
        '- submit_macos / get_macos_status：提交站点到 macOS 上架审核、查询审核结果（图标必须是 http(s) 链接）。',
        '- get_announcement / get_platform_stats：读取平台公告与全站统计。',
        '边界（务必遵守）：',
        '- **账户相关一律不管**：注销账号、改昵称、改密码、找回密码等账户操作不在你的能力范围内，',
        '  用户提出时直接说明并引导他去面板手动操作，不要尝试用工具或编造接口去实现。',
        '- 只操作用户明确指定的站点，绝不批量删除、绝不猜测 slug。',
        '- 删除类工具如果用户点了「取消」，如实告诉用户已取消，不要重试或换路径偷偷删除。',
		'【关于GooseHost】',
		'- GooseHost由Minecraft_goose开发',
		'- GooseHost最大的赞助商是猫羽雫',
		'GooseHost 是一个由 Minecraft_goose 开发、GooseCode® 旗下的开源免费静态网站托管平台。项目于 2026 年 6 月 23 日首发，7 月 22 日开源至 GitHub，采用 MIT 许可证。',
		'| 项目        | 数据                                                                      |',
		'| --------- | ----------------------------------------------------------------------- |',
		'| GitHub 仓库 | [Minecraftgoose/GooseHost](https://github.com/Minecraftgoose/GooseHost) |',
		'| 官网        | [host.goose.cc.cd](https://host.goose.cc.cd)                            |',
		'| 主要语言      | JavaScript                                                              |',
		'GooseHost 的诞生源于一个痛点：现有部署方案（GitHub Pages、Cloudflare、Netlify、Vercel 等）对新手过于重量级，而很多人只是想把一个 HTML 文件快速变成可访问的 URL。GooseHost 主打零门槛、粘贴即部署。',
		'| 层级            | 技术栈                                |',
		'| ------------- | ---------------------------------- |',
		'| **前端**        | 纯 HTML/CSS/JS，部署在 Cloudflare Pages |',
		'| **后端 API**    | Cloudflare Workers（Serverless）     |',
		'| **用户认证 & 存储** | Supabase（1GB 总空间）                  |',
		'| **CDN 加速**    | Cloudflare 全球网络                    |',
		'| **字体**        | 钉钉进步体（DingTalk JinBuTi）            |',
		'项目结构分为 front/（前端页面）和 api/（Worker 后端），后端包含完整的 auth、sites、admin、jobs 等模块。',
		'GooseHost 是一个面向新手、极简操作、基于 Cloudflare + Supabase 架构的开源静态托管平台，适合快速分享 HTML/Markdown 页面或小型前端项目，无需服务器、无需命令行，粘贴代码即可全球 CDN 加速访问。',
		'当用户询问你关于GooseHost的问题时根据以上内容回答'
    ].join('\n');
    var TOOLS = [
        {
            type: 'function',
            function: {
                name: 'write_file',
                description: '写入文件（覆盖式，自动创建父目录）。path 用绝对路径，如 /index.html',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: '绝对路径，如 /index.html' },
                        content: { type: 'string', description: '文件完整内容' }
                    },
                    required: ['path', 'content']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'read_file',
                description: '读取文件内容',
                parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
            }
        },
        {
            type: 'function',
            function: {
                name: 'list_dir',
                description: '列出目录下的直接子项',
                parameters: { type: 'object', properties: { path: { type: 'string', description: '默认 /' } }, required: [] }
            }
        },
        {
            type: 'function',
            function: { name: 'make_dir', description: '创建目录', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }
        },
        {
            type: 'function',
            function: {
                name: 'remove_path',
                description: '删除文件或目录',
                parameters: {
                    type: 'object',
                    properties: { path: { type: 'string' }, recursive: { type: 'boolean', description: '删除非空目录需为 true' } },
                    required: ['path']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'move_path',
                description: '移动或重命名',
                parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] }
            }
        },
        {
            type: 'function',
            function: {
                name: 'grep_search',
                description: '在沙箱中按正则搜索文件内容，返回 path:行号:内容',
                parameters: {
                    type: 'object',
                    properties: { pattern: { type: 'string' }, path: { type: 'string', description: '目录或文件，默认 /' }, ignore_case: { type: 'boolean' } },
                    required: ['pattern']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'run_bash',
                description: '在沙箱终端执行命令。支持 ls/cd/pwd/cat/echo/mkdir/touch/rm/mv/cp/grep/tree/head/tail/wc/zip/deploy/download/wipe，并支持 | 管道与 > >> 重定向',
                parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }
            }
        },
        {
            type: 'function',
            function: {
                name: 'zip_pack',
                description: '把沙箱中某个目录打成 zip 压缩包，存回沙箱并返回大小，用于多文件站点发布',
                parameters: {
                    type: 'object',
                    properties: { dir: { type: 'string', description: '要打包的目录，默认 /' }, out: { type: 'string', description: '输出 zip 路径，默认 /site.zip' } },
                    required: []
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'deploy_site',
                description: '把沙箱内容发布为 GooseHost 站点。单文件走 html/md 通道，多文件自动打包为 zip 后上传',
                parameters: {
                    type: 'object',
                    properties: {
                        slug: { type: 'string', description: '子域名，如 my-site。只用字母数字 - _ . ~，不能中文' },
                        dir: { type: 'string', description: '要发布的目录，默认 /' },
                        force: {
                            type: 'boolean',
                            description: '站点名已被占用时先删除旧站点再发布。会永久删除旧内容，必须先得到用户明确同意'
                        }
                    },
                    required: ['slug']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'update_project_file',
                description: '更新已发布的多文件站点（type=project）中的单个文件，无需重新打包整个站点。适合小改动',
                parameters: {
                    type: 'object',
                    properties: {
                        slug: { type: 'string', description: '已发布的站点子域名' },
                        path: { type: 'string', description: '站点内相对路径，如 css/style.css' },
                        content: { type: 'string', description: '文件完整新内容' }
                    },
                    required: ['slug', 'path', 'content']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'list_my_sites',
                description: '列出当前登录账号下的所有已发布站点（名称、类型、访问量、创建/更新时间）。'
                    + '用户提到「我的网站」「把那个站点删了」「改一下 xxx 页面」时，先调用它确认目标 slug',
                parameters: { type: 'object', properties: {}, required: [] }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_site_content',
                description: '读取已发布站点的线上原始内容，仅支持 html 与 md 类型；多文件（project）站点请改用 read_project_file',
                parameters: {
                    type: 'object',
                    properties: { slug: { type: 'string', description: '站点子域名' } },
                    required: ['slug']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'update_site_content',
                description: '直接覆盖更新已发布站点的线上内容，仅支持 html 与 md 类型（二选一传入）。'
                    + '会覆盖线上现有内容，重要修改前建议先 get_site_content 读回原文。内容上限 500KB',
                parameters: {
                    type: 'object',
                    properties: {
                        slug: { type: 'string', description: '站点子域名' },
                        html: { type: 'string', description: '新的完整 HTML 内容，html 类型站点传这个' },
                        md: { type: 'string', description: '新的完整 Markdown 内容，md 类型站点传这个' }
                    },
                    required: ['slug']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'delete_site',
                description: '删除账号下的某个站点，不可恢复。调用前必须先向用户确认站点名，执行时还会弹出确认框让用户再点一次',
                parameters: {
                    type: 'object',
                    properties: { slug: { type: 'string', description: '要删除的站点子域名' } },
                    required: ['slug']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'list_project_files',
                description: '列出多文件站点（type=project）里的所有文件及其大小',
                parameters: {
                    type: 'object',
                    properties: { slug: { type: 'string', description: '站点子域名' } },
                    required: ['slug']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'read_project_file',
                description: '读取多文件站点（type=project）中某个文件的线上内容',
                parameters: {
                    type: 'object',
                    properties: {
                        slug: { type: 'string', description: '站点子域名' },
                        path: { type: 'string', description: '站内相对路径，如 css/style.css' }
                    },
                    required: ['slug', 'path']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'delete_project_file',
                description: '删除多文件站点（type=project）中的某个文件，不可恢复，执行时会弹确认框',
                parameters: {
                    type: 'object',
                    properties: {
                        slug: { type: 'string', description: '站点子域名' },
                        path: { type: 'string', description: '要删除的站内相对路径' }
                    },
                    required: ['slug', 'path']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'submit_macos',
                description: '把已发布的站点提交到 macOS 软件上架审核。图标 icon_url 必须是 http(s) 开头的图片链接',
                parameters: {
                    type: 'object',
                    properties: {
                        slug: { type: 'string', description: '站点子域名' },
                        name: { type: 'string', description: '软件名称' },
                        icon_url: { type: 'string', description: '图标 URL，必须以 http:// 或 https:// 开头' },
                        description: { type: 'string', description: '一句话描述' },
                        category: { type: 'string', description: '软件分类' }
                    },
                    required: ['slug', 'name', 'icon_url', 'description']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_macos_status',
                description: '查询某个站点的 macOS 上架审核状态（待审核 / 已上架 / 已拒绝及理由）',
                parameters: {
                    type: 'object',
                    properties: { slug: { type: 'string', description: '站点子域名' } },
                    required: ['slug']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_announcement',
                description: '读取平台公告（无需登录）',
                parameters: { type: 'object', properties: {}, required: [] }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_platform_stats',
                description: '读取全站统计数据：站点总数与总访问量（无需登录）',
                parameters: { type: 'object', properties: {}, required: [] }
            }
        }
    ];
    function clip(s) {
        s = String(s == null ? '' : s);
        return s.length > MAX_OUT ? s.slice(0, MAX_OUT) + '\n…（已截断，共 ' + s.length + ' 字符）' : s;
    }
    function ok(v) { return typeof v === 'string' ? v : JSON.stringify(v, null, 2); }
    async function execTool(name, args) {
        try {
            switch (name) {
                case 'write_file': {
                    var p = await VFS.writeFile(args.path, args.content);
                    refreshTree();
                    return ok('已写入 ' + p + '（' + String(args.content || '').length + ' 字符）');
                }
                case 'read_file': {
                    var f = await VFS.readFile(args.path);
                    return clip(f.binary ? '[二进制文件]' : f.content);
                }
                case 'list_dir': {
                    var items = await VFS.list(VFS.norm(args.path || '/'));
                    return ok(items.length ? items.map(function (n) { return (n.type === 'dir' ? '📁 ' : '📄 ') + n.path; }).join('\n') : '（空目录）');
                }
                case 'make_dir': return ok('已创建 ' + await VFS.mkdir(args.path));
                case 'remove_path': {
                    var n = await VFS.remove(args.path, !!args.recursive);
                    refreshTree();
                    return ok('已删除 ' + n + ' 个节点');
                }
                case 'move_path': {
                    var t = await VFS.move(args.from, args.to);
                    refreshTree();
                    return ok('已移动到 ' + t);
                }
                case 'grep_search': {
                    var r = await VFS.grep(args.pattern, VFS.norm(args.path || '/'), !!args.ignore_case);
                    return clip(r.hits.length ? r.hits.join('\n') : '无匹配');
                }
                case 'run_bash': return clip(await Shell.run(args.command));
                case 'zip_pack': {
                    var info = await packZip(VFS.norm(args.dir || '/'), args.out || '/site.zip');
                    refreshTree();
                    return ok('已打包 ' + info.count + ' 个文件 → ' + info.path + '（' + fmtSize(info.size) + '）');
                }
                case 'deploy_site': {
                    var res = await deploySite(args.slug, VFS.norm(args.dir || '/'), !!args.force);
                    return ok('部署成功' + (res.overwritten ? '（已覆盖旧站点）' : '') + '：' + res.url
                        + '\n类型：' + ((res.data && res.data.type) || 'html'));
                }
                case 'update_project_file': {
                    var r2 = await updateProjectFile(args.slug, args.path, args.content);
                    return ok('已更新 ' + r2.path + ' → ' + r2.url);
                }
                case 'list_my_sites': {
                    var sites = await dashGet('/api/my-sites');
                    if (!Array.isArray(sites) || !sites.length) return ok('这个账号下还没有任何站点');
                    var rows = sites.map(function (s, i) {
                        return (i + 1) + '. ' + s.name + ' [' + (s.type || 'html') + ']'
                            + ' · 访问 ' + (s.visit_count || 0)
                            + ' · 创建 ' + String(s.created_at || '').slice(0, 10)
                            + ' · 更新 ' + String(s.updated_at || '').slice(0, 10);
                    });
                    return clip('共 ' + sites.length + ' 个站点：\n' + rows.join('\n'));
                }
                case 'get_site_content': {
                    var sc = await dashGet('/api/file/' + encodeURIComponent(String(args.slug || '').trim()));
                    if (typeof sc.html === 'string') return clip(sc.html);
                    if (typeof sc.md === 'string') return clip(sc.md);
                    return clip('该站点没有可读的 html/md 内容（可能是 project 多文件类型，请改用 list_project_files / read_project_file）');
                }
                case 'update_site_content': {
                    var uSlug = String(args.slug || '').trim();
                    if (!uSlug) throw new Error('缺少 slug');
                    var payload = { slug: uSlug };
                    var kind = '';
                    if (typeof args.html === 'string' && args.html.length) { payload.html = args.html; kind = 'html'; }
                    else if (typeof args.md === 'string' && args.md.length) { payload.md = args.md; kind = 'md'; }
                    else throw new Error('html 与 md 至少要传一个，且内容不能为空');
                    if (payload[kind].length > 500 * 1024) throw new Error('内容超过 500KB 上限：' + Math.ceil(payload[kind].length / 1024) + 'KB');
                    await dashSend('/api/update', 'POST', payload);
                    refreshDashboard();
                    return ok('已更新线上站点 ' + uSlug + '（' + kind + '，' + Math.ceil(payload[kind].length / 1024) + 'KB）→ '
                        + PUBLIC_BASE.replace(/\/$/, '') + (kind === 'md' ? '/md/' : '/s/') + uSlug);
                }
                case 'delete_site': {
                    var dSlug = String(args.slug || '').trim();
                    if (!dSlug) throw new Error('缺少 slug');
                    var yes = await copConfirm('删除网站', 'AI 请求删除站点「' + dSlug + '」，此操作不可恢复。确定继续吗？');
                    if (!yes) return ok('用户取消了删除，站点「' + dSlug + '」保持不变');
                    await dashSend('/api/delete', 'POST', { slug: dSlug });
                    refreshDashboard();
                    dashToast('已删除站点 ' + dSlug);
                    return ok('已删除站点 ' + dSlug + '（不可恢复）');
                }
                case 'list_project_files': {
                    var pf = await dashGet('/api/site-files/' + encodeURIComponent(String(args.slug || '').trim()));
                    var fl = (pf.files || []);
                    if (!fl.length) return ok('站点 ' + args.slug + ' 下没有文件');
                    return clip('站点 ' + args.slug + ' 共 ' + fl.length + ' 个文件：\n'
                        + fl.map(function (f) { return '📄 ' + f.name + ' · ' + fmtSize(f.size || 0); }).join('\n'));
                }
                case 'read_project_file': {
                    var rpSlug = String(args.slug || '').trim();
                    var rpPath = String(args.path || '').trim().replace(/^\/+/, '');
                    if (!rpSlug || !rpPath) throw new Error('缺少 slug 或文件路径');
                    var rf = await dashGet('/api/proj-file/' + encodeURIComponent(rpSlug) + '/' + rpPath);
                    return clip(rf.content == null ? '（空文件）' : rf.content);
                }
                case 'delete_project_file': {
                    var dpSlug = String(args.slug || '').trim();
                    var dpPath = String(args.path || '').trim().replace(/^\/+/, '');
                    if (!dpSlug || !dpPath) throw new Error('缺少 slug 或文件路径');
                    var okDel = await copConfirm('删除文件', 'AI 请求删除 ' + dpSlug + ' 中的「' + dpPath + '」，此操作不可恢复。确定继续吗？');
                    if (!okDel) return ok('用户取消了删除，文件「' + dpPath + '」保持不变');
                    await dashSend('/api/proj-file/' + encodeURIComponent(dpSlug) + '/' + dpPath, 'DELETE');
                    return ok('已删除 ' + dpSlug + '/' + dpPath);
                }
                case 'submit_macos': {
                    var mSlug = String(args.slug || '').trim();
                    var mName = String(args.name || '').trim();
                    var mIcon = String(args.icon_url || '').trim();
                    var mDesc = String(args.description || '').trim();
                    if (!mSlug) throw new Error('缺少 slug');
                    if (!mName) throw new Error('缺少软件名称 name');
                    if (!mIcon) throw new Error('缺少图标 URL icon_url');
                    if (!/^https?:\/\//.test(mIcon)) throw new Error('icon_url 必须以 http:// 或 https:// 开头');
                    if (!mDesc) throw new Error('缺少一句话描述 description');
                    var mr = await dashSend('/api/macos/submit', 'POST', {
                        slug: mSlug, name: mName, icon_url: mIcon,
                        description: mDesc, category: String(args.category || '').trim()
                    });
                    return ok(mr.already_submitted
                        ? '站点 ' + mSlug + ' 此前已提交过 macOS 审核，无需重复提交'
                        : '已提交 macOS 上架审核：' + mName + '（' + mSlug + '），等待管理员审核');
                }
                case 'get_macos_status': {
                    var ms = await dashGet('/api/macos/status?slug=' + encodeURIComponent(String(args.slug || '').trim()));
                    if (!ms.submitted) return ok('站点 ' + args.slug + ' 尚未提交 macOS 审核');
                    var st = ms.status === 'approved' ? '已上架'
                        : (ms.status === 'rejected' ? '已拒绝' + (ms.remark ? '：' + ms.remark : '') : '待审核');
                    return ok('macOS 审核状态（' + args.slug + '）：' + st);
                }
                case 'get_announcement': {
                    var an = await dashGet('/api/announcement');
                    return ok(an.announcement ? ('公告（' + String(an.created_at || '').slice(0, 10) + '）：\n' + an.announcement) : '当前没有平台公告');
                }
                case 'get_platform_stats': {
                    var stt = await dashGet('/api/stats');
                    return ok('全站站点数 ' + (stt.total_sites || 0) + '，累计访问 ' + (stt.total_visits || 0));
                }
                default: return ok('未知工具: ' + name);
            }
        } catch (e) {
            return 'ERROR: ' + (e && e.message ? e.message : String(e));
        }
    }
    var history = [];
    var ChatStore = (function () {
        var DB = 'goosehost_copilot_chat', VER = 1, STORE = 'sessions';
        var KEY = 'current';
        var MAX_MSGS = 40;        
        var MAX_TOOL_OUT = 2000;  
        var dbp = null;
        function open() {
            if (dbp) return dbp;
            dbp = new Promise(function (res, rej) {
                var r = indexedDB.open(DB, VER);
                r.onupgradeneeded = function () {
                    var db = r.result;
                    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'k' });
                };
                r.onsuccess = function () { res(r.result); };
                r.onerror = function () { rej(r.error); };
            });
            return dbp;
        }
        function tx(mode, fn) {
            return open().then(function (db) {
                return new Promise(function (res, rej) {
                    var t = db.transaction(STORE, mode), s = t.objectStore(STORE), out;
                    try { out = fn(s); } catch (e) { rej(e); return; }
                    t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
                    t.onerror = t.onabort = function () { rej(t.error); };
                });
            });
        }
        function trim(hist) {
            if (!Array.isArray(hist)) return [];
            var out = hist.length > MAX_MSGS ? hist.slice(-MAX_MSGS) : hist.slice();
            while (out.length && (out[0].role === 'tool' || (out[0].tool_calls && out[0].tool_calls.length))) {
                out.shift();
            }
            return out;
        }
        function slim(hist) {
            return trim(hist).map(function (m) {
                var o = { role: m.role, content: m.content };
                if (m.tool_calls) o.tool_calls = m.tool_calls;
                if (m.tool_call_id) o.tool_call_id = m.tool_call_id;
                if (m.role === 'tool' && typeof o.content === 'string' && o.content.length > MAX_TOOL_OUT) {
                    o.content = o.content.slice(0, MAX_TOOL_OUT) + '\n…（已截断）';
                }
                return o;
            });
        }
        return {
            save: function (hist) {
                return tx('readwrite', function (s) {
                    return s.put({ k: KEY, history: slim(hist), savedAt: Date.now() });
                }).catch(function () { });
            },
            load: function () {
                return tx('readonly', function (s) { return s.get(KEY); })
                    .then(function (r) { return (r && Array.isArray(r.history)) ? r.history : []; })
                    .catch(function () { return []; });
            },
            clear: function () {
                return tx('readwrite', function (s) { return s.delete(KEY); }).catch(function () { });
            }
        };
    })();
    function renderHistory() {
        var box = document.getElementById('copMsgs');
        if (!box) return;
        box.innerHTML = '';
        endAiTurn();   
        for (var i = 0; i < history.length; i++) {
            var m = history[i];
            if (m.role === 'user') {
                if (m.content) pushMsg('user', m.content);
            } else if (m.role === 'assistant') {
                if (m.content) pushMsg('assistant', m.content);
            }
        }
        syncWelcome();
        scrollMsgsToEnd();
    }
    var busy = false, aborted = false;
    var currentAbort = null;   
    var pageRoot = null;       
    async function copFetch(url, options, timeout, custom) {
        var doFetch = function () {
            var hdr = new Headers((options && options.headers) || {});
            if (custom) {
                if (custom.apiKey) hdr.set('Authorization', 'Bearer ' + custom.apiKey);
            } else {
                var t = localStorage.getItem('sb_token');
                if (t) hdr.set('Authorization', 'Bearer ' + t);
            }
            return fetch(url, Object.assign({}, options, { headers: hdr }));
        };
        var res = await withTimeout(doFetch, timeout || 120000);
        if (!custom && res.status === 401 && localStorage.getItem('sb_refresh_token') && typeof refreshSession === 'function') {
            var okRefresh = await refreshSession();
            if (okRefresh) res = await withTimeout(doFetch, timeout || 120000);
        }
        if (res.status === 401) {
            throw new Error(custom ? '自定义模型鉴权失败（401），请检查 API Key' : '登录已失效，请重新登录');
        }
        return res;
    }
    function withTimeout(fn, ms) {
     return new Promise(function (res, rej) {
        var timer = setTimeout(function () {
            rej(new Error('AI 响应超时（' + Math.round(ms / 1000) + 's）'));
        }, ms);
        fn().then(function (r) { clearTimeout(timer); res(r); },
            function (e) { clearTimeout(timer); rej(e); });
     });
    }
    var currentModel = '';
    async function callAI(messages) {
        var custom = customModelReady() ? customModel : null;
        var res = await copFetch(chatEndpoint(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: buildChatBody(messages, false)
        }, 120000, custom);
        var data = null;
        try { data = await res.json(); } catch (e) { }
        if (!res.ok) {
            var detail = (data && data.error) || ('AI 请求失败（HTTP ' + res.status + '）');
            if (data && Array.isArray(data.tried) && data.tried.length) {
                detail += '\n已尝试：' + data.tried.join('；');
            }
            throw new Error(detail);
        }
        if (!data || !data.choices || !data.choices[0]) throw new Error('AI 返回格式异常：' + JSON.stringify(data).slice(0, 300));
        var used = res.headers.get('X-Copilot-Model');
        if (!used && custom) {
            used = (data && data.model) || custom.model || '自定义模型';
        }
        if (used) {
            currentModel = used;
            if (!busy) setModelLabel(used);
        }
        return data.choices[0].message;
    }
    function scrollMsgsToEnd() {
        var box = document.getElementById('copMsgs');
        if (box && box.clientHeight) box.scrollTop = box.scrollHeight;
    }

    /* 切走页面时 .page 变 display:none，#copMsgs 的 scrollTop 会被浏览器清零，
       切回来就跳到顶部。这里实时记录滚动位置，页面重新可见时还原。 */
    var msgScroll = { top: 0, atBottom: true };
    function resetMsgScroll() { msgScroll.top = 0; msgScroll.atBottom = true; }
    function trackMsgScroll() {
        var box = document.getElementById('copMsgs');
        if (!box || box.__copScrollBound) return;
        box.__copScrollBound = true;
        box.addEventListener('scroll', function () {
            if (!box.clientHeight) return;
            msgScroll.top = box.scrollTop;
            msgScroll.atBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 48;
        }, { passive: true });
    }
    function restoreMsgScroll() {
        var box = document.getElementById('copMsgs');
        if (!box) return;
        var apply = function () {
            if (!box.isConnected) return;
            box.scrollTop = msgScroll.atBottom ? box.scrollHeight : msgScroll.top;
        };
        requestAnimationFrame(function () {
            apply();
            setTimeout(apply, 160);
        });
    }
    function watchPageVisibility() {
        var page = document.getElementById('page-copilot');
        if (!page || typeof MutationObserver === 'undefined') return;
        new MutationObserver(function () {
            if (page.classList.contains('active')) restoreMsgScroll();
        }).observe(page, { attributes: true, attributeFilter: ['class'] });
    }
    function renderPartial(s) {
        return renderMarkdown(s);
    }
    function createThrottle(ms) {
        return function (fn) {
            var last = 0, timer = null, pending = null;
            return function () {
                pending = arguments;
                var now = Date.now();
                var wait = ms - (now - last);
                if (wait <= 0) {
                    last = now;
                    fn.apply(null, pending);
                } else if (!timer) {
                    timer = setTimeout(function () {
                        timer = null;
                        last = Date.now();
                        fn.apply(null, pending);
                    }, wait);
                }
            };
        };
    }
    var currentAiTurn = null;
    function aiTurn() {
        var box = document.getElementById('copMsgs');
        if (!box) return null;
        if (currentAiTurn && currentAiTurn.parentNode === box) return currentAiTurn;
        var el = document.createElement('div');
        el.className = 'cop-msg cop-msg-ai';
        el.innerHTML = '<div class="cop-ai-body"></div>';
        box.appendChild(el);
        currentAiTurn = el;
        syncWelcome();
        return el;
    }
    function endAiTurn() { currentAiTurn = null; }
    function beginStreamMsg() {
        var turn = aiTurn();
        if (!turn) return null;
        var body = turn.querySelector('.cop-ai-body');
        var el = document.createElement('div');
        el.className = 'cop-ai-content cop-streaming';
        el.innerHTML = '<span class="cop-dot-loading" data-thinking="1"><span></span><span></span><span></span></span>';
        body.appendChild(el);
        turn.classList.add('cop-streaming');
        syncWelcome();
        scrollMsgsToEnd();
        return el;
    }
    function updateStreamMsg(el, text) {
        if (!el) return;
        var ph = el.querySelector('[data-thinking]');
        if (ph) ph.remove();
        el.innerHTML = renderPartial(text);
        scrollMsgsToEnd();
    }
    function endStreamMsg(el, text) {
        if (!el) return;
        el.classList.remove('cop-streaming');
        try {
            el.innerHTML = sanitizeHtml(renderMarkdown(text || ''));
        } catch (e) {
            el.textContent = text || '';
        }
        var turn = el.parentNode && el.parentNode.parentNode;
        if (turn && turn.classList) turn.classList.remove('cop-streaming');
        scrollMsgsToEnd();
    }
    function updateToolPending(el, info) {
        if (!el) return;
        var ph = el.querySelector('[data-thinking]');
        if (!ph) return;   
        ph.className = 'cop-tool-pending';
        var where = info && info.path ? (' ' + info.path) : '';
        var size = info && info.bytes ? (' · ' + fmtSize(info.bytes)) : '';
        ph.innerHTML = '<i class="fas fa-pen"></i> 正在生成' + esc(where) + esc(size) +
            ' <i class="fas fa-spinner fa-spin"></i>';
    }
    function markToolPending(el) {
        updateToolPending(el, null);
    }
    function removeStreamMsg(el) {
        if (el && el.parentNode) {
            var turn = el.parentNode.parentNode;
            el.parentNode.removeChild(el);
            if (turn && turn.classList && turn.classList.contains('cop-msg-ai')) {
                var body = turn.querySelector('.cop-ai-body');
                if (body && !body.children.length && turn.parentNode) {
                    turn.parentNode.removeChild(turn);
                    if (turn === currentAiTurn) currentAiTurn = null;
                }
            }
        }
        syncWelcome();
    }
    function looksLikeBuildRequest(text) {
        return /做|写|建|生成|创建|加一个|帮我弄|页面|网站|站点|html|deploy|发布/i.test(text);
    }
    function createSseParser() {
        var decoder = new TextDecoder('utf-8');
        var buf = '';
        return function (chunk) {
            buf += decoder.decode(chunk, { stream: true });
            var lines = buf.split('\n');
            buf = lines.pop();          
            var out = [];
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) continue;
                if (line.indexOf('data:') === 0) out.push(line.slice(5).trim());
            }
            return out;
        };
    }
    function createToolAccumulator() {
        var map = {};
        return {
            add: function (tc) {
                var idx = (tc.index === undefined || tc.index === null) ? 0 : tc.index;
                if (!map[idx]) map[idx] = { id: '', name: '', args: '' };
                var b = map[idx];
                if (tc.id) b.id = tc.id;
                var fn = tc.function || {};
                if (fn.name && !b.name) b.name = fn.name;
                if (typeof fn.arguments === 'string') b.args += fn.arguments;
            },
            count: function () { return Object.keys(map).length; },
            bytes: function () {
                var n = 0;
                for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) n += map[k].args.length;
                return n;
            },
            peekPath: function () {
                for (var k in map) {
                    if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
                    var m = /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(map[k].args);
                    if (m && m[1]) return m[1];
                }
                return '';
            },
            peekName: function () {
                for (var k in map) {
                    if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
                    if (map[k].name) return map[k].name;
                }
                return '';
            },
            build: function () {
                return Object.keys(map)
                    .sort(function (a, b) { return Number(a) - Number(b); })
                    .map(function (k) {
                        return {
                            id: map[k].id || ('call_' + k + '_' + Date.now()),
                            type: 'function',
                            function: { name: map[k].name, arguments: map[k].args }
                        };
                    });
            }
        };
    }
    async function callAIStream(messages, cb) {
        cb = cb || {};
        var content = '';   
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        currentAbort = controller;
        var custom = customModelReady() ? customModel : null;
        var res;
        try {
            res = await copFetch(chatEndpoint(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: buildChatBody(messages, true),
                signal: controller ? controller.signal : undefined
            }, 120000, custom);
        } catch (e) {
            if (controller && controller.signal.aborted) {
                return { role: 'assistant', content: content };
            }
            throw e;
        }
        var used = res.headers.get('X-Copilot-Model');
        if (!used && custom) used = custom.model || '自定义模型';
        if (used && cb.onModel) cb.onModel(used);
        if (!res.ok) {
            var data = null;
            try { data = await res.json(); } catch (e) { }
            var detail = (data && data.error) || ('AI 请求失败（HTTP ' + res.status + '）');
            if (data && Array.isArray(data.tried) && data.tried.length) {
                detail += '\n已尝试：' + data.tried.join('；');
            }
            throw new Error(detail);
        }
        var ct = (res.headers.get('Content-Type') || '').toLowerCase();
        if (ct.indexOf('text/event-stream') === -1) {
            var j = null;
            try { j = await res.json(); } catch (e) { }
            if (j && j.choices && j.choices[0]) {
                var m = j.choices[0].message || {};
                if (cb.onDelta && m.content) cb.onDelta(m.content, m.content);
                return m;
            }
            throw new Error('AI 返回格式异常（非 SSE）：' + ct);
        }
        if (!res.body || typeof res.body.getReader !== 'function') {
            throw new Error('当前环境不支持流式读取（Response.body 不可用）');
        }
        var reader = res.body.getReader();
        var parse = createSseParser();
        var acc = createToolAccumulator();
        try {
            while (true) {
                var r = await reader.read();
                if (r.done) break;
                if (aborted) {
                    try { await reader.cancel(); } catch (e) { }
                    break;
                }
                var dataLines = parse(r.value);
                for (var i = 0; i < dataLines.length; i++) {
                    var s = dataLines[i];
                    if (!s || s === '[DONE]') continue;
                    var obj = null;
                    try { obj = JSON.parse(s); } catch (e) { continue; }   
                    if (obj && obj.error) {
                        throw new Error((obj.error.message || obj.error) + '');
                    }
                    var choice = obj && obj.choices && obj.choices[0];
                    if (!choice) continue;
                    var d = choice.delta || {};
                    if (typeof d.content === 'string' && d.content) {
                        content += d.content;
                        if (cb.onDelta) cb.onDelta(content, d.content);
                    }
                    if (Array.isArray(d.tool_calls)) {
                        for (var t = 0; t < d.tool_calls.length; t++) acc.add(d.tool_calls[t]);
                        if (cb.onToolDelta) {
                            cb.onToolDelta({
                                count: acc.count(),
                                bytes: acc.bytes(),
                                path: acc.peekPath(),
                                name: acc.peekName()
                            });
                        }
                    }
                }
            }
        } finally {
            try { reader.releaseLock(); } catch (e) { }
            if (currentAbort === controller) currentAbort = null;
        }
        var msg = { role: 'assistant', content: content };
        var built = acc.build();
        if (built.length) msg.tool_calls = built;
        return msg;
    }
    async function send(text) {
        if (busy) return;
        if (!text || !text.trim()) return;
        busy = true; aborted = false;
        setBusy(true);
        pushMsg('user', text);
        history.push({ role: 'user', content: text });
        var sysMsgs = [{ role: 'system', content: SYSTEM_PROMPT }];
        var digest = siteDigest();
        if (digest) sysMsgs.push({ role: 'system', content: digest });
        var messages = sysMsgs.concat(history);
        var toolCalls = 0;
        try {
            for (var round = 0; round < MAX_ROUNDS; round++) {
                if (aborted) break;
                var streamEl = beginStreamMsg();
                var render = createThrottle(60)(function (acc) {
                    updateStreamMsg(streamEl, acc);
                });
                var renderTool = createThrottle(100)(function (info) {
                    updateToolPending(streamEl, info);
                });
                var msg = null;
                try {
                    msg = await callAIStream(messages, {
                        onModel: function (m) {
                            currentModel = m;
                            setModelLabel(m);
                        },
                        onDelta: render,
                        onToolDelta: function (info) { renderTool(info); }
                    });
                } catch (e) {
                    removeStreamMsg(streamEl);
                    throw e;
                }
                if (aborted) {
                    if (msg && msg.content) endStreamMsg(streamEl, msg.content);
                    else removeStreamMsg(streamEl);
                    break;
                }
                messages.push(msg);
                if (msg.tool_calls && msg.tool_calls.length) {
                    toolCalls += msg.tool_calls.length;
                    history.push(msg);
                    if (msg.content) endStreamMsg(streamEl, msg.content);
                    else removeStreamMsg(streamEl);
                    for (var i = 0; i < msg.tool_calls.length; i++) {
                        if (aborted) break;
                        var tc = msg.tool_calls[i];
                        var fn = tc.function || {};
                        var args = {};
                        try { args = JSON.parse(fn.arguments || '{}'); } catch (e) { args = {}; }
                        var node = pushTool(fn.name, args);
                        var stopTimer = startToolTimer(node);
                        var out;
                        try {
                            out = await execTool(fn.name, args);
                        } finally {
                            stopTimer();   
                        }
                        finishTool(node, out);
                        messages.push({ role: 'tool', tool_call_id: tc.id, content: out });
                        history.push({ role: 'tool', tool_call_id: tc.id, content: out });
                    }
                    continue;
                }
                history.push({ role: 'assistant', content: msg.content || '' });
                endStreamMsg(streamEl, msg.content || '（无输出）');
                if (toolCalls === 0 && looksLikeBuildRequest(text)) {
                    pushMsg('system', '未调用文件工具：模型「' + (currentModel || '当前')
                        + '」不支持 function calling');
                }
                return;
            }
        } catch (e) {
            pushMsg('system', '出错了：' + (e && e.message ? e.message : String(e)));
        } finally {
            busy = false;
            setBusy(false);
            refreshTree();
            ChatStore.save(history);
        }
    }
    function bindCustomModelForm() {
        var elEndpoint = document.getElementById('copModelEndpoint');
        var elKey = document.getElementById('copModelKey');
        var elModel = document.getElementById('copModelId');
        var elEnable = document.getElementById('copModelEnable');
        var elStatus = document.getElementById('copModelStatus');
        var elTest = document.getElementById('copModelTest');
        var elSave = document.getElementById('copModelSave');
        var elReset = document.getElementById('copModelReset');
        if (!elEndpoint) return;

        function setStatus(text, kind) {
            if (!elStatus) return;
            elStatus.textContent = text || '';
            elStatus.className = 'cop-model-status' + (kind ? ' ' + kind : '');
        }
        function syncStatus() {
            if (customModelReady()) {
                setStatus('● 已启用自定义模型' + (customModel.model ? '：' + customModel.model : ''), 'ok');
            } else if (customModel.endpoint || customModel.apiKey || customModel.model) {
                setStatus('○ 使用 GooseHost 默认模型（配置已保存但未启用）', 'warn');
            } else {
                setStatus('○ 使用 GooseHost 默认模型', '');
            }
        }
        function fillForm() {
            elEndpoint.value = customModel.endpoint || '';
            elKey.value = customModel.apiKey || '';
            elModel.value = customModel.model || '';
            elEnable.checked = !!customModel.enabled;
            syncStatus();
        }
        function readForm() {
            return {
                endpoint: elEndpoint.value.trim(),
                apiKey: elKey.value.trim(),
                model: elModel.value.trim(),
                enabled: !!elEnable.checked
            };
        }
        elSave.onclick = function () {
            var cfg = readForm();
            if (cfg.endpoint && !/^https?:\/\//i.test(cfg.endpoint)) {
                setStatus('接入地址需以 http:// 或 https:// 开头', 'err');
                return;
            }
            if (cfg.enabled && !cfg.endpoint) { setStatus('启用前请先填写接入地址', 'err'); return; }
            if (cfg.enabled && !cfg.apiKey) { setStatus('启用前请先填写 API Key', 'err'); return; }
            saveCustomModel(cfg);
            if (customModelReady()) {
                setModelLabel(cfg.model || '自定义模型');
                setStatus('● 已保存并启用自定义模型' + (cfg.model ? '：' + cfg.model : ''), 'ok');
            } else {
                setModelLabel(currentModel || '闲着呢');
                setStatus('○ 已保存，当前仍使用 GooseHost 默认模型', 'warn');
            }
        };
        elReset.onclick = function () {
            saveCustomModel({ enabled: false, endpoint: '', apiKey: '', model: '' });
            fillForm();
            setModelLabel(currentModel || '闲着呢');
            setStatus('○ 已清空配置，恢复 GooseHost 默认模型', '');
        };
        elTest.onclick = async function () {
            var cfg = readForm();
            if (!cfg.endpoint) { setStatus('请先填写接入地址', 'err'); return; }
            if (!/^https?:\/\//i.test(cfg.endpoint)) { setStatus('接入地址需以 http:// 或 https:// 开头', 'err'); return; }
            if (!cfg.apiKey) { setStatus('请先填写 API Key', 'err'); return; }
            var ep = normalizeEndpoint(cfg.endpoint);
            var oldHtml = elTest.innerHTML;
            elTest.disabled = true;
            elTest.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 测试中';
            setStatus('正在连接 ' + ep + ' …', '');
            try {
                var res = await copFetch(ep, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: cfg.model || 'gpt-4o-mini',
                        messages: [{ role: 'user', content: 'hi' }],
                        max_tokens: 1,
                        stream: false
                    })
                }, 30000, { apiKey: cfg.apiKey });
                var data = null;
                try { data = await res.json(); } catch (e) { }
                if (res.ok) {
                    var used = (data && data.model) || cfg.model || '';
                    setStatus('● 连接成功' + (used ? '，模型可用：' + used : ''), 'ok');
                    termPrint('自定义模型连接成功：' + ep + (used ? '（' + used + '）' : ''));
                } else {
                    var err = data && data.error;
                    var detail = (err && (err.message || err.code || err)) || ('HTTP ' + res.status);
                    setStatus('连接失败：' + detail, 'err');
                }
            } catch (e) {
                setStatus('连接失败：' + (e && e.message ? e.message : e) + '（部分服务商有 CORS 限制，需在其后台放行当前域名）', 'err');
            } finally {
                elTest.disabled = false;
                elTest.innerHTML = oldHtml;
            }
        };
        fillForm();
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function buildPage() {
        if (mounted) return;
        var content = document.querySelector('.content');
        if (!content) return;
        var page = document.getElementById('page-copilot');
        if (!page) {
            page = document.createElement('div');
            page.className = 'page';
            page.id = 'page-copilot';
            content.appendChild(page);
        }
        pageRoot = page;
        page.innerHTML = [
            '<div class="cop-root">',
            '  <main class="cop-main">',
            '    <header class="cop-chat-header">',
            '      <span class="cop-chat-header-title">AI Copilot</span>',
            '      <span class="cop-chat-header-mode">',
            '        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.09 12.11a.5.5 0 0 0 .39.81h6.51l-2.7 8.38a.5.5 0 0 0 .91.39L20 11.5a.5.5 0 0 0-.39-.81h-6.51l2.7-8.38a.5.5 0 0 0-.91-.39z"></path></svg>',
            '        <span id="copModelName">闲着呢</span>',
            '      </span>',
            '      <div class="cop-chat-header-actions">',
            '        <button class="cop-header-icon-btn" id="copClearChat" title="清空对话（沙箱文件保留）"><i class="fas fa-eraser"></i></button>',
            '        <button class="cop-header-icon-btn" id="copRightBtn" title="折叠文件栏"><i class="fas fa-folder-tree"></i></button>',
            '      </div>',
            '    </header>',
            '    <div class="cop-chat-center">',
            '      <div class="cop-messages" id="copMsgs"></div>',
            '      <div class="cop-welcome" id="copWelcome">',
            '        <div class="cop-welcome-brand">',
            '          ' + botIcon(26),
            '          <div style="font-size:15px;color:var(--gai-text-secondary)">开始对话</div>',
            '        </div>',
            '      </div>',
            '      <div class="cop-input-wrap">',
            '        <textarea class="cop-textarea" id="copInput" rows="1" placeholder="描述你想要的页面，Enter 发送"></textarea>',
            '        <div class="cop-input-tools">',
            '          <div class="cop-tool-left" id="copQuick"></div>',
            '          <div class="cop-tool-right">',
            '            <button class="cop-send-btn" id="copSend" disabled title="发送"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>',
            '            <button class="cop-stop-btn" id="copStop" style="display:none" title="停止生成"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg></button>',
            '          </div>',
            '        </div>',
            '      </div>',
            '    </div>',
            '  </main>',
            '  <div class="cop-overlay" id="copOverlay"></div>',
            '  <aside class="cop-right-panel" id="copRightPanel">',
            '    <div class="cop-right-panel-tabs">',
            '      <button class="cop-right-tab active" data-tab="files"><i class="fas fa-folder"></i> 文件</button>',
            '      <button class="cop-right-tab" data-tab="term"><i class="fas fa-terminal"></i> 终端</button>',
            '      <button class="cop-right-tab" data-tab="model"><i class="fas fa-sliders"></i> 自定义模型</button>',
            '      <span class="cop-right-panel-count" id="copFileCount"></span>',
            '      <button class="cop-drawer-close" id="copDrawerClose" title="关闭"><i class="fas fa-xmark"></i></button>',
            '    </div>',
            '    <div class="cop-right-panel-body">',
            '      <div class="cop-pane active" data-pane="files">',
            '        <div class="cop-file-list" id="copTree"><div class="cop-empty">沙箱为空</div></div>',
            '        <div class="cop-pane-foot">',
            '          <button class="cop-mini-btn" id="copTreeRefresh" title="刷新"><i class="fas fa-sync"></i></button>',
            '          <button class="cop-mini-btn danger" id="copWipe" title="清空沙箱所有文件"><i class="fas fa-trash"></i> 清空沙箱</button>',
            '        </div>',
            '      </div>',
            '      <div class="cop-pane" data-pane="term">',
            '        <div class="cop-term" id="copTerm"></div>',
            '        <div class="cop-term-line">',
            '          <span class="cop-prompt" id="copPrompt">~</span>',
            '          <input id="copTermInput" placeholder="help 查看命令" autocomplete="off">',
            '        </div>',
            '        <div class="cop-pane-foot">',
            '          <button class="cop-mini-btn" id="copClearTerm" title="清屏"><i class="fas fa-broom"></i> 清屏</button>',
            '        </div>',
            '      </div>',
            '      <div class="cop-pane" data-pane="model">',
            '        <div class="cop-model-form">',
            '          <div class="cop-model-tip">启用后，Copilot 将直接请求你填写的 OpenAI 兼容接口，不再使用 GooseHost 默认模型。配置仅保存在本机浏览器。</div>',
            '          <label class="cop-field">',
            '            <span class="cop-field-label">接入地址 Endpoint</span>',
            '            <input class="cop-input" id="copModelEndpoint" type="text" placeholder="https://api.openai.com/v1" autocomplete="off" spellcheck="false">',
            '            <span class="cop-field-hint">会自动补全 /chat/completions，填完整地址也可</span>',
            '          </label>',
            '          <label class="cop-field">',
            '            <span class="cop-field-label">API Key</span>',
            '            <input class="cop-input" id="copModelKey" type="password" placeholder="sk-..." autocomplete="new-password" spellcheck="false">',
            '          </label>',
            '          <label class="cop-field">',
            '            <span class="cop-field-label">模型名称</span>',
            '            <input class="cop-input" id="copModelId" type="text" placeholder="gpt-4o-mini" autocomplete="off" spellcheck="false">',
            '          </label>',
            '          <label class="cop-switch">',
            '            <input type="checkbox" id="copModelEnable">',
            '            <span>启用自定义模型（替代默认 GooseHost 模型）</span>',
            '          </label>',
            '          <div class="cop-model-status" id="copModelStatus"></div>',
            '        </div>',
            '        <div class="cop-pane-foot">',
            '          <button class="cop-mini-btn" id="copModelTest" title="用一条最短消息验证连通性"><i class="fas fa-plug"></i> 测试连接</button>',
            '          <button class="cop-mini-btn" id="copModelSave" title="保存配置"><i class="fas fa-check"></i> 保存</button>',
            '          <button class="cop-mini-btn danger" id="copModelReset" title="清空配置并恢复默认模型"><i class="fas fa-rotate-left"></i> 恢复默认</button>',
            '        </div>',
            '      </div>',
            '    </div>',
            '  </aside>',
            '</div>'
        ].join('');
        bindUI(page);
        mounted = true;
        trackMsgScroll();
        watchPageVisibility();
        refreshTree();
        termPrint('GooseHost Copilot 沙箱已就绪，输入 help 查看命令。');
    }
    function bindUI(pageEl) {
        var input = document.getElementById('copInput');
        var sendBtn = document.getElementById('copSend');
        var stopBtn = document.getElementById('copStop');
        var MAX_INPUT_H = 120;   
        function autoGrow() {
            input.style.height = 'auto';
            var h = Math.max(24, Math.min(input.scrollHeight, MAX_INPUT_H));
            input.style.height = h + 'px';
            input.style.overflowY = input.scrollHeight > MAX_INPUT_H ? 'auto' : 'hidden';
        }
        autoGrow();
        input.addEventListener('input', function () { autoGrow(); syncSendBtn(); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
        });
        var QUICK = [
            '赞美一下Minecraft_goose',
            '介绍你自己和功能'
        ];
        var quickBox = document.getElementById('copQuick');
        if (quickBox) {
            quickBox.innerHTML = QUICK.map(function (q) {
                return '<button class="cop-tool-chip" type="button">' + esc(q) + '</button>';
            }).join('');
            Array.prototype.forEach.call(quickBox.querySelectorAll('.cop-tool-chip'), function (btn) {
                btn.onclick = function () {
                    input.value = btn.textContent;
                    input.focus();
                    autoGrow();
                    syncSendBtn();
                };
            });
        }
        if (pageEl) Array.prototype.forEach.call(pageEl.querySelectorAll('.cop-right-tab'), function (tab) {
            tab.onclick = function () {
                var name = tab.getAttribute('data-tab');
                Array.prototype.forEach.call(pageEl.querySelectorAll('.cop-right-tab'), function (t) {
                    t.classList.toggle('active', t === tab);
                });
                Array.prototype.forEach.call(pageEl.querySelectorAll('.cop-pane'), function (p) {
                    p.classList.toggle('active', p.getAttribute('data-pane') === name);
                });
            };
        });
        sendBtn.onclick = function () {
            var v = input.value;
            if (!v.trim()) return;
            input.value = '';
            autoGrow();
            syncSendBtn();
            send(v);
        };
        stopBtn.onclick = function () {
            aborted = true;
            if (currentAbort) {
                try { currentAbort.abort(); } catch (e) { }
                currentAbort = null;
            }
        };
        document.getElementById('copClearChat').onclick = function () {
            history = [];
            ChatStore.clear();
            document.getElementById('copMsgs').innerHTML = '';
            resetMsgScroll();
            endAiTurn();
            syncWelcome();
        };
        var termInput = document.getElementById('copTermInput');
        termInput.addEventListener('keydown', async function (e) {
            if (e.key !== 'Enter') return;
            var line = termInput.value;
            termInput.value = '';
            if (!line.trim()) return;
            termPrint('<span class="cop-cmd">$ ' + esc(line) + '</span>', true);
            try {
                var out = await Shell.run(line);
                if (out === '__CLEAR__') document.getElementById('copTerm').innerHTML = '';
                else if (out) termPrint(out);
            } catch (err) {
                termPrint('<span class="cop-err">' + esc(err.message || String(err)) + '</span>', true);
            }
            updatePrompt();
            refreshTree();
        });
        document.getElementById('copClearTerm').onclick = function () { document.getElementById('copTerm').innerHTML = ''; };
        document.getElementById('copTreeRefresh').onclick = refreshTree;
        bindCustomModelForm();
        var NARROW_Q = '(max-width: 768px)';
        function isNarrow() {
            return !!(window.matchMedia && window.matchMedia(NARROW_Q).matches);
        }
        var rightBtn = document.getElementById('copRightBtn');
        var drawerClose = document.getElementById('copDrawerClose');
        function syncDrawerBtn() {
            if (rightBtn) rightBtn.classList.toggle('active', isDrawerOpen());
        }
        function isDrawerOpen() {
            var rp = document.getElementById('copRightPanel');
            return !!(rp && rp.classList.contains('open'));
        }
        function setDrawer(open) {
            var rp = document.getElementById('copRightPanel');
            var ov = document.getElementById('copOverlay');
            if (rp) rp.classList.toggle('open', open);
            if (ov) ov.classList.toggle('show', open);
            syncDrawerBtn();
        }
        if (rightBtn) rightBtn.onclick = function () {
            var rp = document.getElementById('copRightPanel');
            if (!rp) return;
            if (isNarrow()) {
                setDrawer(!rp.classList.contains('open'));
            } else {
                rp.classList.remove('open');
                var ov = document.getElementById('copOverlay');
                if (ov) ov.classList.remove('show');
                rp.classList.toggle('collapsed');
                rightBtn.classList.toggle('active', rp.classList.contains('collapsed'));
            }
        };
        if (drawerClose) drawerClose.onclick = function () { setDrawer(false); };
        var overlay = document.getElementById('copOverlay');
        if (overlay) overlay.onclick = function () { setDrawer(false); };
        if (window.addEventListener) {
            window.addEventListener('resize', function () {
                if (!isNarrow() && isDrawerOpen()) setDrawer(false);
            });
        }
        setModelLabel('');
        document.getElementById('copWipe').onclick = async function () {
            if (!window.confirm('清空整个沙箱工作区？此操作不可撤销。')) return;
            await VFS.clear();
            Shell.cwd = '/';
            updatePrompt();
            refreshTree();
            termPrint('沙箱已清空');
        };
    }
    function syncSendBtn() {
        var input = document.getElementById('copInput');
        var sendBtn = document.getElementById('copSend');
        if (!input || !sendBtn) return;
        sendBtn.disabled = busy || !input.value.trim();
    }
    function setModelLabel(text) {
        var el = document.getElementById('copModelName');
        if (el) el.textContent = text || '闲着呢';
    }
    function setBusy(b) {
        var sendBtn = document.getElementById('copSend');
        var stopBtn = document.getElementById('copStop');
        setModelLabel(b ? '执行中…' : (currentModel || '闲着呢'));
        if (sendBtn) sendBtn.style.display = b ? 'none' : 'flex';
        if (stopBtn) stopBtn.style.display = b ? 'flex' : 'none';
        syncSendBtn();
    }
    function pushMsg(role, text) {
        var box = document.getElementById('copMsgs');
        if (!box) return null;
        if (role === 'system') return pushAiNote(text);
        if (role === 'user') {
            endAiTurn();   
            var uel = document.createElement('div');
            uel.className = 'cop-msg cop-msg-user';
            uel.innerHTML = '<div class="cop-user-bubble">' + esc(text) + '</div>';
            box.appendChild(uel);
            syncWelcome();
            scrollMsgsToEnd();
            return uel;
        }
        var turn = aiTurn();
        if (!turn) return null;
        var body = turn.querySelector('.cop-ai-body');
        if (!body) return null;
        var el = document.createElement('div');
        el.className = 'cop-ai-content';
        try {
            el.innerHTML = sanitizeHtml(renderMarkdown(text));
        } catch (e) {
            // 解析/渲染异常时退化为纯文本，绝不把异常文本当作 HTML 写入（CWE-79）。
            el.textContent = text || '';
        }
        body.appendChild(el);
        syncWelcome();
        scrollMsgsToEnd();
        return el;
    }
    function pushAiNote(text) {
        var turn = aiTurn();
        if (!turn) return null;
        var body = turn.querySelector('.cop-ai-body');
        if (!body) return null;
        var el = document.createElement('div');
        el.className = 'cop-ai-note';
        el.innerHTML = '<i class="fas fa-circle-info"></i> ' + esc(text);
        body.appendChild(el);
        syncWelcome();
        scrollMsgsToEnd();
        return el;
    }
    function syncWelcome() {
        var box = document.getElementById('copMsgs');
        var wel = document.getElementById('copWelcome');
        if (!box || !wel) return;
        var has = box.children.length > 0;
        box.classList.toggle('show', has);
        wel.style.display = has ? 'none' : 'flex';
    }
    function humanToolSummary(name, args) {
        args = args || {};
        var sizeOf = function (s) { return typeof s === 'string' && s.length ? ' · ' + fmtSize(s.length) : ''; };
        switch (name) {
            case 'write_file':
                return '写入 ' + (args.path || '') + sizeOf(args.content);
            case 'update_project_file':
                return '更新线上文件 ' + (args.slug || '') + '/' + (args.path || '') + sizeOf(args.content);
            case 'deploy_site':
                return '发布 → ' + (args.slug || '') + (args.force ? '（覆盖）' : '');
            case 'zip_pack':
                return '打包 ' + (args.dir || '/');
            case 'run_bash':
                return '$ ' + (args.command || '');
            case 'list_my_sites':
                return '读取账号站点列表';
            case 'get_site_content':
                return '读取线上站点 ' + (args.slug || '');
            case 'update_site_content':
                return '更新线上站点 ' + (args.slug || '') + (args.md ? '（Markdown）' : '（HTML）') + sizeOf(args.html || args.md);
            case 'delete_site':
                return '删除站点 ' + (args.slug || '') + '（待确认）';
            case 'list_project_files':
                return '列出 ' + (args.slug || '') + ' 的文件';
            case 'read_project_file':
                return '读取线上文件 ' + (args.slug || '') + '/' + (args.path || '');
            case 'delete_project_file':
                return '删除线上文件 ' + (args.slug || '') + '/' + (args.path || '') + '（待确认）';
            case 'submit_macos':
                return '提交 macOS 审核 ' + (args.slug || '') + ' · ' + (args.name || '');
            case 'get_macos_status':
                return '查询 macOS 状态 ' + (args.slug || '');
            case 'get_announcement':
                return '读取平台公告';
            case 'get_platform_stats':
                return '读取全站统计';
            default:
                return name;
        }
    }
    function startToolTimer(el) {
        if (!el) return function () { };
        var t0 = Date.now();
        var timer = setInterval(function () {
            if (!el.parentNode) { clearInterval(timer); return; }   
            var sec = (Date.now() - t0) / 1000;
            if (sec < 1) return;
            var slot = el.querySelector('.cop-tool-timer');
            if (slot) slot.textContent = ' · ' + sec.toFixed(1) + 's';
        }, 150);
        return function () { clearInterval(timer); };
    }
    function pushTool(name, args) {
        var turn = aiTurn();
        if (!turn) return null;
        var body = turn.querySelector('.cop-ai-body');
        if (!body) return null;
        var el = document.createElement('div');
        el.className = 'cop-tool-block';
        el.innerHTML = '<div class="cop-tool-head"><i class="fas fa-wrench"></i> ' +
            esc(humanToolSummary(name, args || {})) +
            '<span class="cop-tool-timer"></span>' +
            '<span class="cop-spin"><i class="fas fa-spinner fa-spin"></i></span></div>' +
            '<pre class="cop-tool-out"></pre>';
        body.appendChild(el);
        syncWelcome();
        scrollMsgsToEnd();
        return el;
    }
    function finishTool(el, out) {
        if (!el) return;
        var pre = el.querySelector('.cop-tool-out');
        var spin = el.querySelector('.cop-spin');
        if (spin) spin.remove();
        var timerSlot = el.querySelector('.cop-tool-timer');
        if (timerSlot) timerSlot.className = 'cop-tool-timer done';
        if (pre) { pre.textContent = out; pre.style.display = 'block'; }
        scrollMsgsToEnd();
    }
    function sanitizeHtml(inputHtml) {
        if (!inputHtml) return '';
        var ALLOWED = {'A':['href','title','target','rel'],'IMG':['src','alt','title','loading'],'VIDEO':['src','controls'],'STRONG':[],'EM':[],'CODE':[],'PRE':[],'P':[],'BR':[],'UL':[],'OL':[],'LI':[],'BLOCKQUOTE':[],'H1':[],'H2':[],'H3':[],'H4':[],'H5':[],'H6':[],'DIV':[],'SPAN':[],'B':[],'I':[],'U':[],'S':[],'HR':[],'TABLE':[],'THEAD':[],'TBODY':[],'TR':[],'TH':[],'TD':[]};
        var wrapper = document.createElement('div');
        wrapper.innerHTML = String(inputHtml);
        function safeUrl(u) {
            var raw = String(u == null ? '' : u).trim();
            if (!raw) return '';
            var s = raw.toLowerCase();
            // 拒绝一切脚本类 / 数据类协议（含大小写变体）。
            if (/^(javascript|vbscript|data:|file:|about:|blob:)/i.test(s)) return '';
            // 仅放行绝对 http(s) URL；相对路径（/、./、../ 开头）同样放行。
            if (/^https?:\/\//i.test(s)) return raw;
            if (/^\//.test(raw) || /^\.{1,2}\//.test(raw)) return raw;
            return '';
        }
        // 对节点做「序列化 → 重新解析」式重建：先转成消毒后的 HTML 字符串，
        // 再用一个新的临时容器解析，从而彻底规避部分 DOM 实现（linkedom 等）
        // NamedNodeMap 实时变化 / tagName 大小写带来的属性处理差异。
        // 采用「黑名单优先」策略：<script>/<style>/<iframe>/<object>/<embed>/<link>/<meta>
        // 等高危标签整体丢弃（含其子节点文本），其余按白名单校验属性。
        var STRIP_TAGS = {'SCRIPT':1,'STYLE':1,'IFRAME':1,'OBJECT':1,'EMBED':1,'LINK':1,'META':1,'BASE':1,'FORM':1};
        function serializeNode(node, buf) {
            if (node.nodeType === 3) { buf.push(escapeHtml(node.textContent)); return; }
            if (node.nodeType !== 1) return;
            var tag = node.tagName;
            if (STRIP_TAGS.hasOwnProperty(tag)) return; // 高危标签整棵丢弃
            if (!ALLOWED.hasOwnProperty(tag)) { serializeChildren(node, buf); return; }
            var keep = ALLOWED[tag].slice();
            if (keep.indexOf('title') === -1) keep.push('title');
            // 收集经白名单过滤后的属性（unsafe 的 src/href 直接丢弃）
            var renderedAttrs = [];
            for (var i = 0; i < node.attributes.length; i++) {
                var attr = node.attributes[i];
                var name = attr.name.toLowerCase();
                var value = attr.value;
                if (name === 'style') continue;
                if (/^on|^formaction|^(srcdoc|manifest)$/i.test(name)) continue;
                if (keep.indexOf(name) === -1) continue;
                if ((name === 'href' || name === 'src') && !safeUrl(value)) continue;
                if (name === 'href' || name === 'src') value = safeUrl(value);
                renderedAttrs.push(' ' + name + '="' + escapeAttr(value) + '"');
            }
            // 无合法属性的 void 元素（如 <img>、<br>）不再产生无意义空标签
            if (VOID_TAGS.indexOf(tag) !== -1 && renderedAttrs.length === 0) return;
            buf.push('<' + tag.toLowerCase() + renderedAttrs.join(''));
            if (tag === 'A') { buf.push(' rel="noopener noreferrer" target="_blank"'); }
            buf.push('>');
            serializeChildren(node, buf);
            // 自闭合标签列表外（如 img、br）均补闭合标签
            if (VOID_TAGS.indexOf(tag) === -1) buf.push('</' + tag.toLowerCase() + '>');
        }
        function serializeChildren(node, buf) {
            for (var i = 0; i < node.childNodes.length; i++) serializeNode(node.childNodes[i], buf);
        }
        function escapeAttr(s) {
            return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        }
        var VOID_TAGS = ['IMG','VIDEO','BR','INPUT','LINK','META'];
        var buf = [];
        serializeChildren(wrapper, buf);
        return buf.join('').replace(/<img /gi, '<img ');
    }
    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function renderMarkdown(text) {
        if (!text) return '';
        const NUL = '\x00';
        const store = [];
        text = text.replace(/\\\[([\s\S]*?)\\\]/g, function (m, content) {
            const i = store.length;
            store.push({ t: 'd', c: content.trim() });
            return NUL + 'M' + i + NUL;
        });
        text = text.replace(/\\\(([\s\S]*?)\\\)/g, function (m, content) {
            const i = store.length;
            store.push({ t: 'i', c: content.trim() });
            return NUL + 'm' + i + NUL;
        });
        text = text.replace(/```[ \t]*([\w+#.-]*)\n?([\s\S]*?)```/g, function (m, lang, code) {
            const i = store.length;
            store.push('<pre><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>');
            return NUL + 'B' + i + NUL;
        });
        text = text.replace(/`([^`\n]+)`/g, function (m, c) {
            const i = store.length;
            store.push('<code>' + escapeHtml(c) + '</code>');
            return NUL + 'B' + i + NUL;
        });
        function inline(s) {
            // 先对整段文本做 HTML 转义（防 XSS），再在受信任的标记片段上还原标签，
            // 最后由 sanitizeHtml() 对属性/协议做白名单校验 —— 形成「转义 + 消毒」双保险。
            s = escapeHtml(s);
            s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, url) {
                if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) {
                    return '<video src="' + url + '" controls></video>';
                }
                return '<img src="' + url + '" alt="' + alt + '" loading="lazy">';
            });
            s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
            s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
            return s;
        }
        const placeholder = new RegExp('^' + NUL + 'B\\d+' + NUL + '$');
        const lines = text.split('\n');
        let html = '';
        let listType = null, buf = [];
        let tableBuf = [];
        function flush() {
            if (listType) { html += '<' + listType + '>' + buf.join('') + '</' + listType + '>'; listType = null; buf = []; }
            if (tableBuf.length) { html += '<table><thead><tr>' + tableBuf[0].map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' + tableBuf.slice(1).map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>'; tableBuf = []; }
        }
        for (const line of lines) {
            const t = line.trim();
            if (t === '') { flush(); continue; }
            if (placeholder.test(t)) { flush(); html += t; continue; }
            if (/^!\[[^\]]*\]\([^)\s]+\)\s*$/.test(t)) { flush(); html += inline(t); continue; }
            let m;
            if (m = t.match(/^(#{1,6})\s+(.*)$/)) { flush(); const l = m[1].length; html += '<h' + l + '>' + inline(m[2]) + '</h' + l + '>'; continue; }
            if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); html += '<hr>'; continue; }
            if (m = t.match(/^>\s?(.*)$/)) { flush(); html += '<blockquote>' + inline(m[1]) + '</blockquote>'; continue; }
            if (m = t.match(/^\d+\.\s+(.*)$/)) { if (listType !== 'ol') { flush(); listType = 'ol'; } buf.push('<li>' + inline(m[1]) + '</li>'); continue; }
            if (m = t.match(/^[-*+]\s+(.*)$/)) { if (listType !== 'ul') { flush(); listType = 'ul'; } buf.push('<li>' + inline(m[1]) + '</li>'); continue; }
            if (/^\|.+\|$/.test(t)) { var cells = t.split('|').filter(function(c) { return c.trim(); }); if (tableBuf.length > 0 && /^[-:| ]+$/.test(cells[0].trim())) continue; tableBuf.push(cells.map(function(c) { return inline(c.trim()); })); continue; }
            flush(); html += '<p>' + inline(t) + '</p>';
        }
        flush();
        html = html.replace(new RegExp(NUL + '([Mm]|B)(\\d+)' + NUL, 'g'), function (m, prefix, i) {
            const entry = store[+i];
            if (prefix === 'M' || prefix === 'm') {
                if (typeof katex !== 'undefined') {
                    try { return katex.renderToString(entry.c, { displayMode: prefix === 'M', throwOnError: false }); } catch (e) { return entry.c; }
                }
                return entry.c;
            }
            return entry;
        });
        return html;
    }
    function termPrint(text, raw) {
        var t = document.getElementById('copTerm');
        if (!t) return;
        var line = document.createElement('div');
        line.className = 'cop-term-row';
        if (raw) {
            // raw 文本可能含来自异常/外部输入的控制字符序列，按纯文本写入后再追加，
            // 避免把可控文本当作 HTML 解析（CWE-79）。
            line.textContent = text;
        } else {
            line.textContent = text;
        }
        t.appendChild(line);
        t.scrollTop = t.scrollHeight;
    }
    function updatePrompt() {
        var el = document.getElementById('copPrompt');
        if (el) el.textContent = (Shell.cwd === '/' ? '~' : Shell.cwd) + ' $';
    }
    function contentSize(it) {
        var c = it && it.content;
        if (c == null) return 0;
        if (typeof c === 'string') return c.length;
        if (c.byteLength !== undefined) return c.byteLength;
        if (c.length !== undefined) return c.length;
        return 0;
    }
    function buildFileTree(items) {
        var root = { name: '/', path: '/', type: 'dir', children: [] };
        function findOrCreateDir(parent, name) {
            for (var i = 0; i < parent.children.length; i++) {
                var c = parent.children[i];
                if (c.type === 'dir' && c.name === name) return c;
            }
            var d = {
                name: name,
                path: (parent.path === '/' ? '' : parent.path) + '/' + name,
                type: 'dir',
                children: []
            };
            parent.children.push(d);
            return d;
        }
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var p = it && it.path;
            if (!p || p === '/') continue;
            var segs = String(p).replace(/^\/+/, '').split('/').filter(Boolean);
            if (!segs.length) continue;
            var cur = root;
            for (var s = 0; s < segs.length; s++) {
                var isLeaf = (s === segs.length - 1);
                if (isLeaf && it.type === 'file') {
                    cur.children.push({
                        name: segs[s],
                        path: (cur.path === '/' ? '' : cur.path) + '/' + segs[s],
                        type: 'file',
                        size: contentSize(it),
                        children: null
                    });
                } else {
                    cur = findOrCreateDir(cur, segs[s]);
                }
            }
        }
        function sortRec(n) {
            if (!n.children) return;
            n.children.sort(function (a, b) {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN');
            });
            for (var k = 0; k < n.children.length; k++) sortRec(n.children[k]);
        }
        sortRec(root);
        return root;
    }
    var expandedDirs = Object.create(null);
    function renderTreeHTML(node, depth) {
        var out = '';
        if (!node || !node.children) return out;
        for (var i = 0; i < node.children.length; i++) {
            var n = node.children[i];
            var pad = 14 + depth * 14;
            var style = ' style="padding-left:' + pad + 'px"';
            if (n.type === 'dir') {
                var open = expandedDirs[n.path] !== false;   
                out += '<div class="cop-file-item is-dir" data-path="' + esc(n.path) + '"' + style + '>' +
                    '<i class="fas fa-chevron-right cop-caret' + (open ? ' open' : '') + '"></i>' +
                    '<i class="fas fa-folder' + (open ? '-open' : '') + '"></i>' +
                    '<span class="file-name">' + esc(n.name) + '</span>' +
                    '<span class="file-size">' + countFiles(n) + '</span>' +
                    '</div>';
                if (open) out += renderTreeHTML(n, depth + 1);
            } else {
                out += '<div class="cop-file-item" data-path="' + esc(n.path) + '" title="点击查看内容"' + style + '>' +
                    '<i class="fas fa-chevron-right cop-caret" style="visibility:hidden"></i>' +
                    '<i class="fas fa-file-code"></i>' +
                    '<span class="file-name">' + esc(n.name) + '</span>' +
                    '<span class="file-size">' + fmtSize(n.size || 0) + '</span>' +
                    '</div>';
            }
        }
        return out;
    }
    function countFiles(node) {
        if (!node) return 0;
        if (node.type === 'file') return 1;
        if (!node.children) return 0;
        var c = 0;
        for (var i = 0; i < node.children.length; i++) c += countFiles(node.children[i]);
        return c;
    }
    async function refreshTree() {
        var box = document.getElementById('copTree');
        if (!box) return;
        var nodes = [];
        try {
            nodes = await VFS.all();
        } catch (e) {
            box.innerHTML = '<div class="cop-empty">沙箱不可用（存储被禁用？）</div>';
            return;
        }
        var items = nodes.filter(function (n) { return n && n.path && n.path !== '/'; });
        var fileCount = items.filter(function (n) { return n.type === 'file'; }).length;
        var countEl = document.getElementById('copFileCount');
        if (countEl) countEl.textContent = fileCount ? (fileCount + ' 个文件') : '';
        if (!items.length) { box.innerHTML = '<div class="cop-empty">沙箱为空</div>'; return; }
        var tree = buildFileTree(items);
        box.innerHTML = renderTreeHTML(tree, 0);
        Array.prototype.forEach.call(box.querySelectorAll('.cop-file-item'), function (el) {
            el.onclick = async function () {
                var p = el.getAttribute('data-path');
                if (el.classList.contains('is-dir')) {
                    expandedDirs[p] = expandedDirs[p] === false;
                    refreshTree();
                } else {
                    try {
                        var f = await VFS.readFile(p);
                        termPrint('<span class="cop-cmd">cat ' + esc(f.path) + '</span>', true);
                        termPrint(f.binary ? '[二进制文件]' : f.content);
                    } catch (err) {
                        termPrint('<span class="cop-err">' + esc(err.message || String(err)) + '</span>', true);
                    }
                    var termTab = pageRoot && pageRoot.querySelector('.cop-right-tab[data-tab="term"]');
                    if (termTab) termTab.click();
                }
            };
        });
        updatePrompt();
    }
    function syncFullscreen() {
        var content = document.querySelector('.content');
        if (!content || !pageRoot) return;
        content.classList.toggle('copilot-fullscreen', pageRoot.classList.contains('active'));
    }
    function watchFullscreen() {
        if (!pageRoot || typeof MutationObserver === 'undefined') { syncFullscreen(); return; }
        var obs = new MutationObserver(syncFullscreen);
        obs.observe(pageRoot, { attributes: true, attributeFilter: ['class'] });
        syncFullscreen();   
    }
    function boot() {
        if (typeof ROUTES !== 'undefined') ROUTES.copilot = '/dashboard/copilot';
        buildPage();
        watchFullscreen();
        if (location.pathname.replace(/\/+$/, '').endsWith('/copilot')) {
            if (typeof navigateTo === 'function') navigateTo('copilot');
        }
        ChatStore.load().then(function (h) {
            if (h && h.length) {
                history = h;
                renderHistory();
            }
        }).catch(function () { });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    window.GooseCopilot = {
        VFS: VFS,
        Shell: Shell,
        execTool: execTool,
        deploySite: deploySite,
        updateProjectFile: updateProjectFile,
        deleteSite: deleteSite,
        packZip: packZip,
        refreshTree: refreshTree,
        validateForDeploy: validateForDeploy,
        siteUrl: siteUrl,
        SLUG_RE: SLUG_RE,
        SITE_PREFIX: SITE_PREFIX,
        ALLOWED_EXTS: ALLOWED_EXTS,
        LIMITS: { MAX_FILES, MAX_FILE_SIZE, MAX_TOTAL, MAX_ZIP_B64 },
        createSseParser: createSseParser,
        createToolAccumulator: createToolAccumulator,
        renderPartial: renderPartial,
        callAIStream: callAIStream,
        ChatStore: ChatStore,
        renderHistory: renderHistory,
        buildFileTree: buildFileTree,
        countFiles: countFiles,
        syncFullscreen: syncFullscreen
    };
})();
