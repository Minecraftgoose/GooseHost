/* ===== GooseHost 广场 · 前端逻辑 ===== */
(function () {
    'use strict';

    // ------------------------------------------------------------------ 基础
    const API_URL_FALLBACK = 'https://page.goose.cc.cd';
    let API_URL = API_URL_FALLBACK;

    const token = localStorage.getItem('sb_token');
    let me = null;                 // 广场资料（登录后才会有）
    let mySites = null;            // 发布站点弹窗缓存

    const state = {
        tab: 'all',                // all | site | text | feed
        sort: 'new',
        q: '',
        page: 1,
        hasMore: false,
        loading: false,
        view: 'list',              // list | post | user
        postId: null,
        userId: null
    };

    const $ = (s) => document.querySelector(s);
    const AI_NAME = '小鹅C';

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function timeAgo(iso) {
        const t = new Date(iso).getTime();
        if (isNaN(t)) return '';
        const diff = Math.floor((Date.now() - t) / 1000);
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
        if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' 天前';
        const d = new Date(t);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    let toastTimer = null;
    function toast(msg) {
        const el = $('#toast');
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }

    function authHeaders(extra) {
        const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
        if (token) h['Authorization'] = 'Bearer ' + token;
        return h;
    }

    async function api(path, opts) {
        opts = opts || {};
        try {
            const res = await fetch(API_URL + path, {
                method: opts.method || 'GET',
                headers: authHeaders(opts.headers),
                body: opts.body ? JSON.stringify(opts.body) : undefined
            });
            let data = null;
            try { data = await res.json(); } catch { data = null; }
            return { ok: res.ok, status: res.status, data };
        } catch (e) {
            return { ok: false, status: 0, data: { error: '网络错误' } };
        }
    }

    function requireLogin(msg) {
        toast(msg || '登录后才能操作哦');
        setTimeout(() => { location.href = '/login/?next=' + encodeURIComponent(location.pathname + location.hash); }, 900);
        return false;
    }

    // 头像/图片地址白名单：只允许 http(s)。
    // 绝对地址直接校验协议，相对地址按当前页面解析后再校验；
    // javascript:/vbscript:/data:/blob:/file: 等危险协议一律返回空串（CWE-79）。
    function safeImgUrl(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return '';
        if (/^[a-z][a-z0-9+.\-]*:/i.test(s) && !/^https?:/i.test(s)) return '';
        let u;
        try { u = new URL(s, location.href); } catch (e) { return ''; }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        return /^https?:\/\/[^\s<>"']+$/i.test(u.href) ? u.href : '';
    }

    // 链接地址白名单：与 safeImgUrl 同策略，非法协议时退回安全占位，
    // 避免 <a href="javascript:..."> 被点击执行（CWE-79）
    function safeLinkUrl(v) {
        return safeImgUrl(v) || '#';
    }

    // 首字母兜底文案存在 data-fb 上，加载失败时由委托 handler 用 textContent 替换，
    // 不再走 innerHTML / 内联 onerror 拼接 HTML
    function avatarHtml(author, cls) {
        cls = cls || '';
        const nick = (author && author.nickname) || '鹅';
        const initial = esc(nick.slice(0, 1));
        if (author && author.avatar_url) {
            const src = safeImgUrl(author.avatar_url);
            if (src) {
                return `<img class="pg-avatar ${cls}" src="${esc(src)}" alt="${esc(nick)}" data-fb="${initial}">`;
            }
        }
        const extra = (author && author.is_ai) ? ' ai' : '';
        return `<span class="pg-avatar ${cls}${extra}">${initial}</span>`;
    }

    // ------------------------------------------------------------------ 启动
    (function boot() {
        // 点阵背景（纯 CSS，无需网络请求）
        const bg = $('#bgLayer');
        if (bg) bg.classList.add('loaded');

        // API 地址
        fetch(API_URL_FALLBACK + '/api/config')
            .then(r => r.json())
            .then(d => { if (d && d.apiUrl) API_URL = d.apiUrl; })
            .catch(() => {});

        bindGlobal();

        // 头像加载失败（404 / 防盗链）→ 退回首字母。
        // error 事件不冒泡，用捕获阶段监听；全程 DOM API + textContent，不拼接 HTML
        document.addEventListener('error', (e) => {
            const el = e.target;
            if (!el || el.tagName !== 'IMG' || !el.classList.contains('pg-avatar')) return;
            const fb = el.getAttribute('data-fb');
            if (fb == null) return;
            const span = document.createElement('span');
            span.className = el.className;
            span.textContent = fb;
            if (el.parentNode) el.parentNode.replaceChild(span, el);
        }, true);

        (async () => {
            if (token) {
                const r = await api('/api/play/me');
                if (r.ok && r.data && r.data.profile) {
                    me = r.data.profile;
                } else if (r.status === 401) {
                    localStorage.removeItem('sb_token');
                    localStorage.removeItem('sb_user');
                }
            }
            renderNav();
            renderMeCard();
            route();
        })();
    })();

    function bindGlobal() {
        // tab
        document.querySelectorAll('#feedTabs .pg-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                setTab(tab);
            });
        });
        // 排序
        document.querySelectorAll('.pg-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pg-sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.sort = btn.dataset.sort;
                reloadList();
            });
        });
        // 搜索
        let st = null;
        $('#searchInput').addEventListener('input', (e) => {
            clearTimeout(st);
            st = setTimeout(() => {
                state.q = e.target.value.trim();
                if (state.view !== 'list') { location.hash = '#/'; return; }
                if (state.tab === 'feed') setTab('all');
                else reloadList();
            }, 350);
        });
        // 加载更多
        $('#loadMoreBtn').addEventListener('click', () => {
            state.page += 1;
            loadPosts(true);
        });
        // 发帖
        $('#btnPublishSite').addEventListener('click', () => openPostModal('site'));
        $('#btnNewPost').addEventListener('click', () => openPostModal('text'));
        $('#postSubmitBtn').addEventListener('click', submitPost);
        $('#profileSubmitBtn').addEventListener('click', submitProfile);
        $('#pfAvatar').addEventListener('input', (e) => {
            const img = $('#pfAvatarPreview');
            // 统一走 safeImgUrl：非 http(s) 一律拒绝，赋给 src 的永远是归一化后的绝对地址
            const src = safeImgUrl(e.target.value);
            if (src) { img.src = src; img.style.display = 'inline-block'; $('#pfAvatarFallback').style.display = 'none'; }
            else { img.removeAttribute('src'); img.style.display = 'none'; $('#pfAvatarFallback').style.display = 'inline-flex'; }
        });
        // 弹窗点遮罩关闭
        document.querySelectorAll('.pg-modal').forEach(m => {
            m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('open'); });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') document.querySelectorAll('.pg-modal.open').forEach(m => m.classList.remove('open'));
        });
        window.addEventListener('hashchange', route);
    }

    // ------------------------------------------------------------------ 导航 / 侧边
    function renderNav() {
        const box = $('#navRight');
        if (token && me) {
            box.innerHTML = `
                <a href="#/u/${esc(me.id)}" class="pg-btn ghost sm" title="我的主页">
                    ${avatarHtml(me, 'sm')} <span>${esc(me.nickname || '我')}</span>
                </a>
                <a href="/dashboard" class="pg-btn outline sm"><i class="fas fa-gauge"></i> 控制台</a>`;
            $('#actionCard').style.display = 'block';
        } else if (token) {
            box.innerHTML = `<a href="/dashboard" class="pg-btn outline sm"><i class="fas fa-gauge"></i> 控制台</a>`;
        } else {
            box.innerHTML = `
                <a href="/login/" class="pg-btn ghost sm">登录</a>
                <a href="/register/" class="pg-btn primary sm">注册</a>`;
            $('#actionCard').style.display = 'none';
        }
        // 头像按钮补齐间距
        const a = box.querySelector('.pg-btn.ghost.sm');
        if (a) a.style.gap = '8px';
    }

    function renderMeCard() {
        const box = $('#meCard');
        if (!token || !me) {
            box.innerHTML = `
                <div class="pg-card-title"><i class="fas fa-user-astronaut"></i> 加入广场</div>
                <p class="pg-muted small">登录后可以发布站点、发帖、点赞、关注，还能在评论区 @${AI_NAME} 唠嗑。</p>
                <div style="margin-top:12px;display:flex;gap:8px;">
                    <a href="/login/" class="pg-btn primary sm" style="flex:1;">登录</a>
                    <a href="/register/" class="pg-btn outline sm" style="flex:1;">注册</a>
                </div>`;
            return;
        }
        box.innerHTML = `
            <div class="pg-me-top">
                ${avatarHtml(me, 'lg')}
                <div class="pg-me-nick">${esc(me.nickname || '未设置昵称')}</div>
                <div class="pg-me-bio">${esc(me.bio || '这个人很懒，什么都没写')}</div>
            </div>
            <div class="pg-me-stats">
                <div class="pg-me-stat" data-go="posts"><div class="n">${me.post_count || 0}</div><div class="l">帖子</div></div>
                <div class="pg-me-stat" data-go="following"><div class="n">${me.following_count || 0}</div><div class="l">关注</div></div>
                <div class="pg-me-stat" data-go="followers"><div class="n">${me.follower_count || 0}</div><div class="l">粉丝</div></div>
            </div>
            <button class="pg-btn ghost block sm" style="margin-top:12px;" id="btnEditProfile">
                <i class="fas fa-pen"></i> 编辑资料
            </button>`;
        box.querySelectorAll('.pg-me-stat').forEach(el => {
            el.addEventListener('click', () => {
                const go = el.dataset.go;
                if (go === 'posts') location.hash = '#/u/' + me.id;
                else openFollowList(me.id, go === 'following' ? 'following' : 'followers');
            });
        });
        const btn = $('#btnEditProfile');
        if (btn) btn.addEventListener('click', openProfileModal);
    }

    // ------------------------------------------------------------------ 路由
    function setTab(tab) {
        state.tab = tab;
        document.querySelectorAll('#feedTabs .pg-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        if (location.hash !== '#/' + (tab === 'all' ? '' : tab)) {
            const target = tab === 'all' ? '#/' : '#/' + tab;
            history.replaceState(null, '', target);
        }
        showView('list');
        reloadList();
    }

    function route() {
        const hash = location.hash || '#/';
        const clean = hash.replace(/^#\/?/, '').split('?')[0];
        const parts = clean.split('/').filter(Boolean);

        if (parts[0] === 'post' && parts[1]) {
            showView('post'); state.postId = parts[1]; renderPost(parts[1]);
        } else if (parts[0] === 'u' && parts[1]) {
            showView('user'); state.userId = parts[1]; renderUser(parts[1]);
        } else if (parts[0] === 'me') {
            if (me) location.replace('#/u/' + me.id); else { requireLogin('先登录一下'); location.hash = '#/'; }
        } else if (['site', 'text', 'feed'].indexOf(parts[0]) >= 0) {
            state.tab = parts[0];
            document.querySelectorAll('#feedTabs .pg-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
            showView('list'); reloadList();
        } else {
            state.tab = 'all';
            document.querySelectorAll('#feedTabs .pg-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'all'));
            showView('list'); reloadList();
        }
    }

    function showView(v) {
        state.view = v;
        $('#viewList').style.display = v === 'list' ? '' : 'none';
        $('#viewPost').style.display = v === 'post' ? '' : 'none';
        $('#viewUser').style.display = v === 'user' ? '' : 'none';
        $('#viewPost').innerHTML = '';
        $('#viewUser').innerHTML = '';
    }

    function reloadList() {
        state.page = 1;
        loadPosts(false);
    }

    // ------------------------------------------------------------------ 列表
    async function loadPosts(append) {
        if (state.loading) return;
        state.loading = true;
        const listEl = $('#postList');
        if (!append) listEl.innerHTML = '<div class="pg-skeleton"></div><div class="pg-skeleton"></div><div class="pg-skeleton"></div>';
        $('#loadMoreBtn').style.display = 'none';
        $('#listEnd').style.display = 'none';

        if (state.tab === 'feed' && !token) {
            listEl.innerHTML = `<div class="pg-empty"><i class="fas fa-user-group"></i>
                登录后可在这里看到关注的人的动态<br>
                <a href="/login/" class="pg-btn primary sm" style="margin-top:14px;">去登录</a></div>`;
            state.loading = false;
            return;
        }

        const params = new URLSearchParams({
            page: String(state.page), limit: '20', sort: state.sort
        });
        if (state.tab === 'site' || state.tab === 'text') params.set('kind', state.tab);
        if (state.q) params.set('q', state.q);

        const path = state.tab === 'feed' ? '/api/play/feed' : '/api/play/posts';
        const r = await api(path + '?' + params.toString());

        if (!r.ok || !r.data) {
            listEl.innerHTML = `<div class="pg-empty"><i class="fas fa-triangle-exclamation"></i>${esc((r.data && r.data.error) || '加载失败')}</div>`;
            state.loading = false;
            return;
        }

        const posts = r.data.posts || [];
        state.hasMore = !!(r.data.pagination && r.data.pagination.has_more);

        if (!append && !posts.length) {
            const tip = state.tab === 'feed'
                ? '你关注的人还没发过帖，去广场逛逛吧'
                : (state.q ? '没有搜到相关内容' : '广场还很安静，来发第一条吧');
            listEl.innerHTML = `<div class="pg-empty"><i class="fas fa-feather"></i>${esc(tip)}</div>`;
            state.loading = false;
            return;
        }

        // 先绑事件再挂到 DOM，避免「加载更多」时旧卡片被重复绑定
        const frag = document.createElement('div');
        frag.innerHTML = posts.map(postCardHtml).join('');
        bindPostCards(frag);
        if (!append) listEl.innerHTML = '';
        while (frag.firstChild) listEl.appendChild(frag.firstChild);

        if (state.hasMore) $('#loadMoreBtn').style.display = 'inline-flex';
        else if (posts.length) $('#listEnd').style.display = 'block';

        state.loading = false;
    }

    function postCardHtml(p) {
        const isSite = p.kind === 'site';
        const badge = isSite
            ? '<span class="pg-badge"><i class="fas fa-globe"></i> 网站</span>'
            : '<span class="pg-badge text"><i class="fas fa-pen"></i> 帖子</span>';

        let siteBox = '';
        if (isSite) {
            const previewSrc = safeImgUrl(p.preview_url);
            const preview = p.preview_url
                ? `<img src="${esc(previewSrc)}" alt="站点预览" loading="lazy">`
                : '<span><i class="fas fa-image"></i><br>预览图位<br>（待接入）</span>';
            siteBox = `
                <div class="pg-site-box">
                    <div class="pg-site-preview">${preview}</div>
                    <div class="pg-site-meta">
                        <div class="pg-site-url"><i class="fas fa-link"></i> ${esc(p.site_url || ('/s/' + (p.site_slug || '')))}</div>
                        <a class="pg-site-visit" href="${esc(safeLinkUrl(p.site_url || ('/s/' + (p.site_slug || ''))))}" target="_blank" rel="noopener noreferrer">
                            <i class="fas fa-arrow-up-right-from-square"></i> 访问站点
                        </a>
                    </div>
                </div>`;
        }

        return `
        <article class="pg-post" data-id="${esc(p.id)}">
            <div class="pg-post-head">
                <span class="pg-post-author" data-uid="${esc(p.author_id)}">
                    ${avatarHtml(p.author, 'sm')}
                    <span class="pg-nick">${esc((p.author && p.author.nickname) || '匿名鹅')}</span>
                </span>
                <span class="pg-time">${timeAgo(p.created_at)}</span>
                ${badge}
            </div>
            <h3 class="pg-post-title">${esc(p.title)}</h3>
            ${p.content ? `<div class="pg-post-excerpt">${esc(p.content)}</div>` : ''}
            ${siteBox}
            <div class="pg-post-foot">
                <button class="pg-act ${p.liked ? 'active' : ''}" data-act="like">
                    <i class="${p.liked ? 'fas' : 'far'} fa-heart"></i> <span>${p.like_count || 0}</span>
                </button>
                <button class="pg-act" data-act="comment">
                    <i class="far fa-comment"></i> <span>${p.comment_count || 0}</span>
                </button>
                ${p.is_mine ? '<button class="pg-act danger" data-act="delete" style="margin-left:auto;"><i class="far fa-trash-can"></i> 删除</button>' : ''}
            </div>
        </article>`;
    }

    function bindPostCards(root) {
        root.querySelectorAll('.pg-post').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('a')) return;
                location.hash = '#/post/' + card.dataset.id;
            });
            const author = card.querySelector('.pg-post-author');
            if (author) author.addEventListener('click', () => { location.hash = '#/u/' + author.dataset.uid; });

            card.querySelectorAll('[data-act]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const act = btn.dataset.act;
                    const id = card.dataset.id;
                    if (act === 'comment') { location.hash = '#/post/' + id; return; }
                    if (act === 'like') { await toggleLike(id, btn); return; }
                    if (act === 'delete') { await deletePost(id); return; }
                });
            });
        });
    }

    // ------------------------------------------------------------------ 互动
    async function toggleLike(postId, btn) {
        if (!token) { requireLogin('登录后才能点赞'); return; }
        const liked = btn.classList.contains('active');
        const r = await api(`/api/play/posts/${encodeURIComponent(postId)}/like`, { method: liked ? 'DELETE' : 'POST' });
        if (!r.ok) { toast((r.data && r.data.error) || '操作失败'); return; }
        const count = r.data.like_count || 0;
        btn.classList.toggle('active', !liked);
        btn.querySelector('i').className = (liked ? 'far' : 'fas') + ' fa-heart';
        btn.querySelector('span').textContent = count;
    }

    async function toggleFollow(userId, btn) {
        if (!token) { requireLogin('登录后才能关注'); return; }
        const following = btn.dataset.following === '1';
        const r = following
            ? await api(`/api/play/follow/${encodeURIComponent(userId)}`, { method: 'DELETE' })
            : await api('/api/play/follow', { method: 'POST', body: { user_id: userId } });
        if (!r.ok) { toast((r.data && r.data.error) || '操作失败'); return; }
        btn.dataset.following = following ? '0' : '1';
        btn.className = 'pg-btn sm ' + (following ? 'primary' : 'following');
        btn.innerHTML = following ? '<i class="fas fa-plus"></i> 关注' : '<i class="fas fa-check"></i> 已关注';
        // 同步关注者自己的关注数
        if (me) {
            me.following_count = Math.max(0, (me.following_count || 0) + (following ? -1 : 1));
            renderMeCard();
        }
    }

    async function deletePost(postId) {
        if (!token) { requireLogin(); return; }
        if (!confirm('确定删除这条帖子吗？评论也会一起删掉。')) return;
        const r = await api(`/api/play/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
        if (!r.ok) { toast((r.data && r.data.error) || '删除失败'); return; }
        toast('已删除');
        if (state.view === 'post') location.hash = '#/';
        else reloadList();
    }

    // ------------------------------------------------------------------ 详情
    async function renderPost(id) {
        const box = $('#viewPost');
        box.innerHTML = '<div class="pg-detail"><div class="pg-skeleton" style="height:200px;"></div></div>';
        const r = await api(`/api/play/posts/${encodeURIComponent(id)}`);
        if (!r.ok || !r.data || !r.data.post) {
            box.innerHTML = `<div class="pg-detail"><div class="pg-empty"><i class="fas fa-ghost"></i>
                ${esc((r.data && r.data.error) || '帖子不存在')}<br>
                <a href="#/" class="pg-btn outline sm" style="margin-top:14px;">回广场</a></div></div>`;
            return;
        }
        const p = r.data.post;
        const isSite = p.kind === 'site';
        const previewSrc = safeImgUrl(p.preview_url);
        const preview = p.preview_url
            ? `<img src="${esc(previewSrc)}" alt="站点预览">`
            : '<span><i class="fas fa-image"></i><br>预览图位<br>（等首屏抓取服务接入）</span>';

        box.innerHTML = `
            <div class="pg-detail">
                <a class="pg-back" id="backBtn"><i class="fas fa-arrow-left"></i> 返回广场</a>
                <div class="pg-post-head">
                    <span class="pg-post-author" id="postAuthor" data-uid="${esc(p.author_id)}" style="cursor:pointer;">
                        ${avatarHtml(p.author, 'sm')}
                        <span class="pg-nick">${esc((p.author && p.author.nickname) || '匿名鹅')}</span>
                    </span>
                    <span class="pg-time">${timeAgo(p.created_at)}</span>
                    <span class="pg-badge ${isSite ? '' : 'text'}">
                        <i class="fas ${isSite ? 'fa-globe' : 'fa-pen'}"></i> ${isSite ? '网站' : '帖子'}
                    </span>
                    ${!p.is_mine && token ? `<button class="pg-btn sm ${(p.author && p.author.is_following) ? 'following' : 'outline'}"
                        id="followBtn2" data-following="${(p.author && p.author.is_following) ? '1' : '0'}" style="margin-left:auto;">${(p.author && p.author.is_following) ? '<i class="fas fa-check"></i> 已关注' : '<i class="fas fa-plus"></i> 关注'}</button>` : ''}
                </div>

                <h1 class="pg-detail-title">${esc(p.title)}</h1>

                ${isSite ? `
                <div class="pg-site-box" style="margin-top:0;margin-bottom:14px;">
                    <div class="pg-site-preview">${preview}</div>
                    <div class="pg-site-meta">
                        <div class="pg-site-url"><i class="fas fa-link"></i> ${esc(p.site_url || '')}</div>
                        <a class="pg-site-visit" href="${esc(safeLinkUrl(p.site_url || ''))}" target="_blank" rel="noopener noreferrer">
                            <i class="fas fa-arrow-up-right-from-square"></i> 访问站点
                        </a>
                    </div>
                </div>` : ''}

                ${p.content ? `<div class="pg-detail-body">${esc(p.content)}</div>` : ''}

                <div class="pg-post-foot">
                    <button class="pg-act ${p.liked ? 'active' : ''}" id="detailLike">
                        <i class="${p.liked ? 'fas' : 'far'} fa-heart"></i> <span>${p.like_count || 0}</span>
                    </button>
                    <button class="pg-act" id="jumpComment"><i class="far fa-comment"></i> <span>${p.comment_count || 0}</span></button>
                    ${p.is_mine ? '<button class="pg-act danger" id="detailDelete" style="margin-left:auto;"><i class="far fa-trash-can"></i> 删除</button>' : ''}
                </div>

                <div class="pg-comments" id="commentsBox">
                    <div class="pg-comments-title"><i class="far fa-comments"></i> 讨论 <span id="cmtCount"></span></div>
                    <div id="commentEditor"></div>
                    <div id="commentTree"><div class="pg-muted small">加载中…</div></div>
                </div>
            </div>`;

        $('#backBtn').addEventListener('click', () => { location.hash = '#/'; });
        $('#postAuthor').addEventListener('click', () => { location.hash = '#/u/' + p.author_id; });
        $('#detailLike').addEventListener('click', (e) => toggleLike(p.id, e.currentTarget));
        $('#jumpComment').addEventListener('click', () => $('#commentTreeTop, #commentEditor').scrollIntoView({ behavior: 'smooth', block: 'center' }));
        const del = $('#detailDelete');
        if (del) del.addEventListener('click', () => deletePost(p.id));
        const f2 = $('#followBtn2');
        if (f2) f2.addEventListener('click', (e) => toggleFollow(p.author_id, e.currentTarget));

        renderCommentEditor(p.id, null, null);
        await loadComments(p.id);
    }

    // ------------------------------------------------------------------ 评论
    function editorHtml(placeholder, btnText) {
        if (!token) {
            return `<div class="pg-comment-box">
                <div class="pg-muted small" style="padding:10px 0;">
                    想参与讨论？<a href="/login/" style="color:var(--accent);">登录</a> 后即可评论，
                    还能 @${AI_NAME} 一起唠嗑。
                </div>
            </div>`;
        }
        return `
        <div class="pg-comment-box">
            ${avatarHtml(me, 'sm')}
            <div class="pg-comment-input-wrap">
                <textarea class="pg-textarea" placeholder="${esc(placeholder)}" maxlength="5000"></textarea>
                <div class="pg-comment-actions">
                    <button class="pg-mention-btn" data-mention><i class="fas fa-at"></i> ${AI_NAME}</button>
                    <button class="pg-btn primary sm" data-submit>${esc(btnText)}</button>
                    <span class="pg-hint">Ctrl + Enter 发送</span>
                </div>
            </div>
        </div>`;
    }

    function renderCommentEditor(postId, parentId, anchorEl, nickname) {
        const box = $('#commentEditor');
        if (!box) return;
        const ph = parentId
            ? `回复 ${nickname || ''}…（输入 @${AI_NAME} 可以召唤吉祥物）`
            : `说点什么…（输入 @${AI_NAME} 召唤吉祥物唠嗑）`;
        box.innerHTML = editorHtml(ph, parentId ? '回复' : '发表评论');

        const ta = box.querySelector('textarea');
        const submitBtn = box.querySelector('[data-submit]');
        const mentionBtn = box.querySelector('[data-mention]');
        if (!ta) return;

        if (mentionBtn) {
            mentionBtn.addEventListener('click', () => {
                const v = ta.value;
                ta.value = (v ? (v.endsWith(' ') ? v : v + ' ') : '') + '@' + AI_NAME + ' ';
                ta.focus();
            });
        }
        ta.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submitBtn && submitBtn.click(); }
        });
        if (submitBtn) submitBtn.addEventListener('click', () => submitComment(postId, parentId, ta, submitBtn, anchorEl));
        if (parentId) ta.focus();
    }

    async function submitComment(postId, parentId, ta, btn, anchorEl) {
        if (!token) { requireLogin('登录后才能评论'); return; }
        const content = ta.value.trim();
        if (!content) { toast('写点什么再发吧'); return; }

        const aiWanted = /@\s*小鹅\s*C/i.test(content);
        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = aiWanted ? AI_NAME + ' 思考中…' : '发送中…';

        const r = await api(`/api/play/posts/${encodeURIComponent(postId)}/comments`, {
            method: 'POST',
            body: { content, parent_id: parentId || null }
        });

        btn.disabled = false;
        btn.textContent = old;

        if (!r.ok) { toast((r.data && r.data.error) || '发送失败'); return; }

        ta.value = '';
        await loadComments(postId);
        if (r.data.ai_reply) toast(AI_NAME + ' 回你啦！');
        else if (r.data.ai_pending) toast(AI_NAME + ' 这次没接上，稍后再试试');
        if (parentId) renderCommentEditor(postId, null, null);
    }

    async function loadComments(postId) {
        const r = await api(`/api/play/posts/${encodeURIComponent(postId)}/comments`);
        const tree = $('#commentTree');
        const countEl = $('#cmtCount');
        if (!r.ok || !r.data) {
            tree.innerHTML = '<div class="pg-muted small">评论加载失败</div>';
            return;
        }
        const list = r.data.comments || [];
        if (countEl) countEl.textContent = (r.data.total || 0) ? `（${r.data.total}）` : '';
        if (!list.length) {
            tree.innerHTML = '<div class="pg-empty" style="padding:28px 12px;"><i class="far fa-comment-dots"></i>还没有评论，来抢沙发</div>';
            return;
        }
        tree.innerHTML = list.map(c => commentHtml(c, postId)).join('');
        bindComments(tree, postId);
    }

    // 超过这个深度就不再往右缩进，改成平铺 + 「回复 @某人」提示，
    // 否则和 AI 连续对话几轮后，手机上会被挤成一条竖线
    const MAX_INDENT_DEPTH = 5;

    function commentHtml(c, postId, parentNick) {
        const nick = (c.author && c.author.nickname) || (c.is_ai ? AI_NAME : '匿名鹅');
        const tagAi = c.is_ai ? '<span class="pg-tag-ai">AI</span>' : '';
        const depth = c.depth || 0;
        const childDepth = depth + 1;
        const flat = childDepth >= MAX_INDENT_DEPTH;
        // 平铺时用「回复 @xxx」标出对话对象，否则看不出这条在回谁
        const replyHint = flat && parentNick
            ? `<span class="pg-reply-hint">回复 @${esc(parentNick)}</span>`
            : '';
        return `
        <div class="pg-cmt ${c.is_ai ? 'ai-row' : ''}" data-id="${esc(c.id)}" data-author="${esc(c.author_id || '')}" data-nick="${esc(nick)}" data-ai="${c.is_ai ? '1' : '0'}">
            <div data-goto="${esc(c.author_id || '')}" style="cursor:pointer;">${avatarHtml(c.author, 'sm')}</div>
            <div class="pg-cmt-main">
                <div class="pg-cmt-head">
                    <span class="pg-cmt-nick ${c.is_ai ? 'ai' : ''}" data-goto="${esc(c.author_id || '')}">${esc(nick)}</span>
                    ${tagAi}
                    <span class="pg-time">${timeAgo(c.created_at)}</span>
                </div>
                ${replyHint}
                <div class="pg-cmt-content">${esc(c.content)}</div>
                <div class="pg-cmt-foot">
                    <button class="pg-cmt-btn" data-reply><i class="fas fa-reply"></i> 回复</button>
                    ${(token && c.author_id && me && c.author_id === me.id)
                        ? '<button class="pg-cmt-btn danger" data-del><i class="far fa-trash-can"></i> 删除</button>' : ''}
                </div>
                <div class="pg-cmt-slot"></div>
                <div class="pg-cmt-children${flat ? ' flat' : ''}">
                    ${(c.children || []).map(child => commentHtml(child, postId, nick)).join('')}
                </div>
            </div>
        </div>`;
    }

    function bindComments(root, postId) {
        root.querySelectorAll('.pg-cmt').forEach(node => {
            const id = node.dataset.id;
            const authorId = node.dataset.author;
            const nick = node.dataset.nick;

            node.querySelectorAll('[data-goto]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const uid = el.dataset.goto;
                    if (uid) location.hash = '#/u/' + uid;
                });
            });

            const replyBtn = node.querySelector(':scope > .pg-cmt-main > .pg-cmt-foot > [data-reply]');
            if (replyBtn) {
                replyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!token) { requireLogin('登录后才能回复'); return; }
                    const slot = node.querySelector(':scope > .pg-cmt-main > .pg-cmt-slot');
                    if (slot.querySelector('textarea')) { slot.innerHTML = ''; return; }
                    // 关掉其它正在展开的回复框
                    root.querySelectorAll('.pg-cmt-slot').forEach(s => { if (s !== slot) s.innerHTML = ''; });
                    const isAi = node.dataset.ai === '1';
                    const wrap = document.createElement('div');
                    wrap.innerHTML = editorHtml(
                        isAi ? `接着和 ${AI_NAME} 聊…` : `回复 ${nick}…（想叫 ${AI_NAME} 就 @ 它）`,
                        '回复'
                    );
                    slot.appendChild(wrap.firstElementChild);

                    const ta = slot.querySelector('textarea');
                    const btn = slot.querySelector('[data-submit]');
                    const mention = slot.querySelector('[data-mention]');
                    // 回复 AI 时预填 @，既省事又保证触发它回话
                    if (isAi) ta.value = '@' + AI_NAME + ' ';
                    if (mention) mention.addEventListener('click', () => {
                        ta.value = (ta.value.trim() ? ta.value.trim() + ' ' : '') + '@' + AI_NAME + ' ';
                        ta.focus();
                    });
                    ta.addEventListener('keydown', (e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); btn.click(); }
                    });
                    btn.addEventListener('click', async () => {
                        const okDone = await submitReply(postId, id, ta, btn);
                        if (okDone) slot.innerHTML = '';
                    });
                    ta.focus();
                    if (isAi) {
                        const pos = ta.value.length;
                        ta.setSelectionRange(pos, pos);
                    }
                });
            }

            const delBtn = node.querySelector(':scope > .pg-cmt-main > .pg-cmt-foot > [data-del]');
            if (delBtn) {
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm('确定删除这条评论？连同回复一起删。')) return;
                    const r = await api(`/api/play/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
                    if (!r.ok) { toast((r.data && r.data.error) || '删除失败'); return; }
                    toast('已删除');
                    await loadComments(postId);
                });
            }
        });
    }

    async function submitReply(postId, parentId, ta, btn) {
        const content = ta.value.trim();
        if (!content) { toast('写点什么再发吧'); return false; }
        const aiWanted = /@\s*小鹅\s*C/i.test(content);
        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = aiWanted ? AI_NAME + ' 思考中…' : '发送中…';
        const r = await api(`/api/play/posts/${encodeURIComponent(postId)}/comments`, {
            method: 'POST', body: { content, parent_id: parentId }
        });
        btn.disabled = false;
        btn.textContent = old;
        if (!r.ok) { toast((r.data && r.data.error) || '发送失败'); return false; }
        await loadComments(postId);
        if (r.data.ai_reply) toast(AI_NAME + ' 回你啦！');
        else if (r.data.ai_pending) toast(AI_NAME + ' 这次没接上，稍后再试试');
        return true;
    }

    // ------------------------------------------------------------------ 用户主页
    async function renderUser(id) {
        const box = $('#viewUser');
        box.innerHTML = '<div class="pg-detail"><div class="pg-skeleton" style="height:180px;"></div></div>';

        const pr = await api(`/api/play/profile/${encodeURIComponent(id)}`);
        if (!pr.ok || !pr.data) {
            box.innerHTML = `<div class="pg-detail"><div class="pg-empty"><i class="fas fa-ghost"></i>用户不存在</div></div>`;
            return;
        }
        const profile = pr.data.profile || {};
        const isMe = !!(me && me.id === id);

        box.innerHTML = `
            <div class="pg-detail">
                <a class="pg-back" id="userBack"><i class="fas fa-arrow-left"></i> 返回广场</a>
                <div class="pg-profile-head">
                    ${avatarHtml(profile, 'lg')}
                    <div class="pg-profile-info">
                        <div class="pg-profile-nick">${esc(profile.nickname || '未设置昵称')}</div>
                        <div class="pg-profile-bio">${esc(profile.bio || '这个人很懒，什么都没写')}</div>
                        <div class="pg-profile-stats">
                            <div class="pg-profile-stat" data-open="posts"><div class="n">${profile.post_count || 0}</div><div class="l">帖子</div></div>
                            <div class="pg-profile-stat" data-open="following"><div class="n">${profile.following_count || 0}</div><div class="l">关注</div></div>
                            <div class="pg-profile-stat" data-open="followers"><div class="n">${profile.follower_count || 0}</div><div class="l">粉丝</div></div>
                        </div>
                    </div>
                    <div class="pg-profile-actions">
                        ${isMe
                            ? '<button class="pg-btn outline sm" id="editBtn2"><i class="fas fa-pen"></i> 编辑资料</button>'
                            : (token ? `<button class="pg-btn sm ${pr.data.is_following ? 'following' : 'primary'}"
                                    data-following="${pr.data.is_following ? '1' : '0'}" id="userFollowBtn">
                                    ${pr.data.is_following ? '<i class="fas fa-check"></i> 已关注' : '<i class="fas fa-plus"></i> 关注'}
                                </button>` : '<a href="/login/" class="pg-btn primary sm">登录关注</a>')}
                    </div>
                </div>
                <div style="margin-top:22px;">
                    <div class="pg-comments-title"><i class="fas fa-feather"></i> TA 的发布 <span id="uPostCount"></span></div>
                    <div id="userPosts"><div class="pg-skeleton" style="height:120px;"></div></div>
                </div>
            </div>`;

        $('#userBack').addEventListener('click', () => { location.hash = '#/'; });
        const eb = $('#editBtn2');
        if (eb) eb.addEventListener('click', openProfileModal);
        const fb = $('#userFollowBtn');
        if (fb) fb.addEventListener('click', (e) => toggleFollow(id, e.currentTarget));
        box.querySelectorAll('.pg-profile-stat').forEach(el => {
            const open = el.dataset.open;
            if (open === 'posts') return;
            el.addEventListener('click', () => openFollowList(id, open));
        });

        const pr2 = await api(`/api/play/profile/${encodeURIComponent(id)}/posts?limit=50`);
        const posts = (pr2.ok && pr2.data && pr2.data.posts) || [];
        const listEl = $('#userPosts');
        if (!posts.length) {
            listEl.innerHTML = '<div class="pg-empty" style="padding:30px;"><i class="fas fa-feather"></i>还没有发布过内容</div>';
            return;
        }
        listEl.className = 'pg-post-list';
        listEl.style.marginTop = '14px';
        listEl.innerHTML = posts.map(postCardHtml).join('');
        bindPostCards(listEl);
    }

    async function openFollowList(userId, type) {
        const modal = $('#listModal');
        modal.classList.add('open');
        $('#listModalTitle').textContent = type === 'following' ? '关注' : '粉丝';
        const body = $('#listModalBody');
        body.innerHTML = '<div class="pg-muted small">加载中…</div>';

        const r = await api(`/api/play/profile/${encodeURIComponent(userId)}/${type}?limit=50`);
        const users = (r.ok && r.data && r.data.users) || [];
        if (!users.length) {
            body.innerHTML = '<div class="pg-muted small">空空如也</div>';
            return;
        }
        body.innerHTML = users.map(u => `
            <div class="pg-site-option" data-uid="${esc(u.id)}" style="cursor:pointer;">
                ${avatarHtml(u, 'sm')}
                <div>
                    <div class="so-name">${esc(u.nickname || '未设置昵称')}</div>
                    <div class="so-meta">${esc(u.bio || '')}</div>
                </div>
            </div>`).join('');
        body.querySelectorAll('.pg-site-option').forEach(el => {
            el.addEventListener('click', () => {
                modal.classList.remove('open');
                location.hash = '#/u/' + el.dataset.uid;
            });
        });
    }

    // ------------------------------------------------------------------ 弹窗
    function closeModal(id) { $('#' + id).classList.remove('open'); }
    window.closeModal = closeModal;

    function openProfileModal() {
        if (!me) { requireLogin(); return; }
        $('#pfNickname').value = me.nickname || '';
        $('#pfAvatar').value = me.avatar_url || '';
        $('#pfBio').value = me.bio || '';
        const img = $('#pfAvatarPreview');
        const avatarSrc = safeImgUrl(me.avatar_url);
        if (avatarSrc) { img.src = avatarSrc; img.style.display = 'inline-block'; $('#pfAvatarFallback').style.display = 'none'; }
        else { img.style.display = 'none'; $('#pfAvatarFallback').style.display = 'inline-flex'; }
        $('#profileModal').classList.add('open');
    }

    async function submitProfile() {
        const nickname = $('#pfNickname').value.trim();
        const avatar_url = $('#pfAvatar').value.trim();
        const bio = $('#pfBio').value.trim();

        if (!nickname) { toast('昵称不能为空'); return; }
        if (avatar_url && !/^https?:\/\/\S+$/i.test(avatar_url)) { toast('头像需要是 http(s) 链接'); return; }

        const btn = $('#profileSubmitBtn');
        btn.disabled = true;
        const r = await api('/api/play/me', { method: 'PUT', body: { nickname, avatar_url, bio } });
        btn.disabled = false;
        if (!r.ok) { toast((r.data && r.data.error) || '保存失败'); return; }
        me = r.data.profile;
        renderNav(); renderMeCard();
        closeModal('profileModal');
        toast('资料已更新');
        if (state.view === 'user' && state.userId === me.id) renderUser(me.id);
    }

    let postModalKind = 'text';
    let pickedSite = null;

    async function openPostModal(kind) {
        if (!token) { requireLogin('登录后才能发布'); return; }
        postModalKind = kind;
        pickedSite = null;
        $('#postTitle').value = '';
        $('#postContent').value = '';
        $('#sitePicker').style.display = kind === 'site' ? '' : 'none';
        $('#postModalTitle').textContent = kind === 'site' ? '发布站点到广场' : '发个帖子';
        $('#contentLabel').textContent = kind === 'site' ? '站点介绍' : '正文';
        $('#postContent').placeholder = kind === 'site' ? '介绍一下这个站点…' : '随便写点什么…';
        $('#postModal').classList.add('open');

        if (kind === 'site') {
            const box = $('#siteOptions');
            box.innerHTML = '<div class="pg-muted small">加载中…</div>';
            const r = await api('/api/play/my-sites');
            const sites = (r.ok && r.data && r.data.sites) || [];
            mySites = sites;
            if (!sites.length) {
                box.innerHTML = `<div class="pg-muted small">你还没有站点。<br>
                    <a href="/dashboard/deploy" style="color:var(--accent);">去部署一个</a></div>`;
                return;
            }
            box.innerHTML = sites.map(s => `
                <div class="pg-site-option ${s.published ? 'disabled' : ''}" data-slug="${esc(s.name)}" data-pub="${s.published ? '1' : '0'}">
                    <i class="fas ${s.type === 'md' ? 'fa-file-lines' : (s.type === 'project' ? 'fa-folder-open' : 'fa-code')}"></i>
                    <div>
                        <div class="so-name">${esc(s.name)} <span class="so-meta">(${esc(s.type)})</span></div>
                        <div class="so-meta">${esc(s.url || '')} ${s.published ? '· 已发布' : ''}</div>
                    </div>
                </div>`).join('');
            box.querySelectorAll('.pg-site-option').forEach(el => {
                if (el.dataset.pub === '1') return;
                el.addEventListener('click', () => {
                    box.querySelectorAll('.pg-site-option').forEach(o => o.classList.remove('selected'));
                    el.classList.add('selected');
                    pickedSite = el.dataset.slug;
                    if (!$('#postTitle').value.trim()) $('#postTitle').value = pickedSite;
                });
            });
        }
    }

    async function submitPost() {
        const title = $('#postTitle').value.trim();
        const content = $('#postContent').value.trim();
        if (!title) { toast('标题不能为空'); return; }
        if (postModalKind === 'site' && !pickedSite) { toast('请选择要发布的站点'); return; }

        const btn = $('#postSubmitBtn');
        btn.disabled = true;
        btn.textContent = '发布中…';
        const r = await api('/api/play/posts', {
            method: 'POST',
            body: {
                kind: postModalKind,
                title,
                content,
                site_slug: postModalKind === 'site' ? pickedSite : undefined
            }
        });
        btn.disabled = false;
        btn.textContent = '发布';
        if (!r.ok) { toast((r.data && r.data.error) || '发布失败'); return; }

        closeModal('postModal');
        toast('发布成功');
        if (me) { me.post_count = (me.post_count || 0) + 1; renderMeCard(); }
        location.hash = '#/post/' + r.data.post.id;
    }
})();
