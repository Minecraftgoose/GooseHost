        const API_URL = 'https://page.goose.gs.cn';
        let pendingDeleteSite = null;
        let pendingDeleteUser = null;
        let allData = { sites: [], users: [] };
        let token = localStorage.getItem('sb_token');

        // ===== 会话刷新 =====
        function jwtExpiry(t) {
            try {
                const parts = t.split('.');
                if (parts.length !== 3) return null;
                const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                const pad = '='.repeat((4 - (b64.length % 4)) % 4);
                const binary = atob(b64 + pad);
                const payload = JSON.parse(new TextDecoder().decode(new Uint8Array([...binary].map(c => c.charCodeAt(0)))));
                return payload.exp ? payload.exp * 1000 : null;
            } catch { return null; }
        }

        async function refreshSession() {
            const rt = localStorage.getItem('sb_refresh_token');
            if (!rt) return false;
            try {
                const res = await fetch(API_URL + '/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: rt })
                });
                const data = await res.json();
                if (res.ok && data.access_token) {
                    localStorage.setItem('sb_token', data.access_token);
                    if (data.refresh_token) localStorage.setItem('sb_refresh_token', data.refresh_token);
                    if (data.user) localStorage.setItem('sb_user', JSON.stringify(data.user));
                    token = data.access_token;
                    return true;
                }
                localStorage.removeItem('sb_refresh_token');
                return false;
            } catch { return false; }
        }

        async function apiFetch(url, options = {}) {
            const cur = localStorage.getItem('sb_token');
            const exp = cur ? jwtExpiry(cur) : null;
            if (cur && exp && (exp - Date.now() < 5 * 60 * 1000)) {
                await refreshSession();
            }
            const latest = localStorage.getItem('sb_token');
            const hdr = new Headers(options.headers || {});
            if (latest) hdr.set('Authorization', 'Bearer ' + latest);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            try {
                let res = await fetch(url, { ...options, headers: hdr, signal: controller.signal });
                if (res.status === 401 && localStorage.getItem('sb_refresh_token')) {
                    const ok = await refreshSession();
                    if (ok) {
                        const nt = localStorage.getItem('sb_token');
                        const hdr2 = new Headers(options.headers || {});
                        if (nt) hdr2.set('Authorization', 'Bearer ' + nt);
                        res = await fetch(url, { ...options, headers: hdr2, signal: controller.signal });
                    }
                }
                clearTimeout(timeout);
                if (res.status === 401) {
                    localStorage.removeItem('sb_token');
                    localStorage.removeItem('sb_user');
                    localStorage.removeItem('sb_refresh_token');
                    token = null;
                    location.href = '../login/';
                    throw new Error('Unauthorized');
                }
                return res;
            } catch (e) {
                clearTimeout(timeout);
                if (e.name === 'AbortError') throw new Error('请求超时');
                throw e;
            }
        }

        // Auth
        function checkAuth() {
            if (!token) { location.href = '../login/'; return null; }
            return token;
        }

        async function loadAdminNickname() {
            if (!token) return;
            try {
                const res = await apiFetch(`${API_URL}/api/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) return;
                const data = await res.json();
                const el = document.getElementById('adminNickname');
                if (!el) return;
                el.textContent = data.nickname || data.email || '管理员';
            } catch (e) {  }
        }
        loadAdminNickname();

        function showToast(msg, type = 'error') {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.className = `toast ${type} show`;
            setTimeout(() => t.classList.remove('show'), 3000);
        }

        function switchTab(tab) {
            document.getElementById('tab-sites').style.display = tab === 'sites' ? 'block' : 'none';
            document.getElementById('tab-users').style.display = tab === 'users' ? 'block' : 'none';
            document.getElementById('tabBtnSites').classList.toggle('active', tab === 'sites');
            document.getElementById('tabBtnUsers').classList.toggle('active', tab === 'users');
            document.getElementById('tabLabel').textContent = tab === 'sites' ? '全部数据' : '用户列表';
            document.getElementById('searchWrap').style.display = tab === 'sites' ? 'flex' : 'none';
            if (tab === 'users') {
                if (!allData.users.length) loadUsers();
                else renderUsers();
            }
        }

        async function syncEmails() {
            const token = checkAuth();
            if (!token) return;
            const btn = document.getElementById('syncEmailsBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 同步中...';
            try {
                const res = await apiFetch(`${API_URL}/api/admin/sync-emails`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok) {
                    showToast(`同步成功，已记录 ${data.count} 个用户邮箱`, 'success');
                    loadData();
                } else {
                    showToast(data.error || '同步失败', 'error');
                }
            } catch (err) {
                showToast('同步失败: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-address-book"></i> 同步邮箱';
            }
        }

        var paginationState = {
            sites: { page: 1, total: 0, loading: false },
            users: { page: 1, total: 0, loading: false }
        };

        const PAGE_SIZE = 50;

        async function loadData() {
            const token = checkAuth();
            if (!token) return;
            document.getElementById('tab-sites').innerHTML = '<div class="loading-state"><i class="fas fa-circle-notch"></i></div>';
            try {
                await loadSitesFull();
                renderStats();
                renderSites();
                if (!allData.users.length) loadUsersSilent();
            } catch (err) {
                if (err.message === 'ADMIN_403') {
                    document.getElementById('tab-sites').innerHTML = '<div class="empty-state"><i class="fas fa-shield-halved"></i><p>您没有管理员权限</p></div>';
                } else {
                    document.getElementById('tab-sites').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${err.message}</p></div>`;
                }
            }
        }

        async function loadSitesFull() {
            const token = checkAuth();
            if (!token) return;
            let page = 1, collected = [], total = 0;
            while (true) {
                const res = await apiFetch(`${API_URL}/api/admin/sites?page=${page}&limit=${PAGE_SIZE}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.status === 403) throw new Error('ADMIN_403');
                if (!res.ok) break;
                const data = await res.json();
                const arr = Array.isArray(data) ? data : (data.sites || []);
                collected = collected.concat(arr);
                if (data.pagination && data.pagination.total) total = data.pagination.total;
                const hasMore = data.pagination
                    ? (page * PAGE_SIZE < (data.pagination.total || 0))
                    : (arr.length === PAGE_SIZE);
                if (!hasMore) break;
                if (++page > 1000) break;
            }
            allData.sites = collected;
            paginationState.sites.total = total || collected.length;
            paginationState.sites.page = 1;
        }

        function pageNumbers(current, totalPages) {
            const pages = [];
            if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                if (current > 3) pages.push('...');
                for (let i = Math.max(2, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) pages.push(i);
                if (current < totalPages - 2) pages.push('...');
                pages.push(totalPages);
            }
            return pages;
        }

        function renderPageBar(total, page, cb) {
            const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            if (totalPages <= 1) {
                return `<div class="page-bar"><span class="page-info">共 ${total} 条</span></div>`;
            }
            let html = '<div class="page-bar">';
            html += `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="${cb}(${page - 1})">上一页</button>`;
            pageNumbers(page, totalPages).forEach(n => {
                if (n === '...') html += '<span class="page-ellipsis">…</span>';
                else html += `<button class="page-btn ${n === page ? 'active' : ''}" onclick="${cb}(${n})">${n}</button>`;
            });
            html += `<button class="page-btn" ${page >= totalPages ? 'disabled' : ''} onclick="${cb}(${page + 1})">下一页</button>`;
            html += `<span class="page-info">第 ${page}/${totalPages} 页 · 共 ${total} 条</span>`;
            html += '</div>';
            return html;
        }

        function gotoSitesPage(p) {
            p = Math.max(1, p | 0);
            paginationState.sites.page = p;
            renderSites(document.getElementById('siteSearchInput').value || '');
            const el = document.getElementById('tab-sites');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        async function loadUsersSilent() {
            const token = checkAuth();
            if (!token) return;
            try {
                await loadUsersFull();
                renderStats();
                if (document.getElementById('tabBtnUsers').classList.contains('active')) {
                    renderUsers();
                }
            } catch (_) {}
        }

        async function loadUsers() {
            const token = checkAuth();
            if (!token) return;
            document.getElementById('tab-users').innerHTML = '<div class="loading-state"><i class="fas fa-circle-notch"></i></div>';
            try {
                await loadUsersFull();
                renderUsers();
            } catch (err) {
                document.getElementById('tab-users').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${err.message}</p></div>`;
            }
        }

        async function loadUsersFull() {
            const token = checkAuth();
            if (!token) return;
            let page = 1, collected = [], total = 0;
            while (true) {
                const res = await apiFetch(`${API_URL}/api/admin/users?page=${page}&limit=${PAGE_SIZE}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.status === 403) throw new Error('ADMIN_403');
                if (!res.ok) break;
                const data = await res.json();
                const arr = Array.isArray(data) ? data : (data.users || []);
                collected = collected.concat(arr);
                if (data.pagination && data.pagination.total) total = data.pagination.total;
                const hasMore = data.pagination
                    ? (page * PAGE_SIZE < (data.pagination.total || 0))
                    : (arr.length === PAGE_SIZE);
                if (!hasMore) break;
                if (++page > 1000) break;
            }
            allData.users = collected;
            paginationState.users.total = total || collected.length;
            paginationState.users.page = 1;
        }

        function gotoUsersPage(p) {
            p = Math.max(1, p | 0);
            paginationState.users.page = p;
            renderUsers();
            const el = document.getElementById('tab-users');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        async function renderStats() {
            try {
                const token = checkAuth();
                const res = await apiFetch(`${API_URL}/api/admin/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const st = await res.json();
                    document.getElementById('totalSites').textContent = st.totalSites ?? 0;
                    document.getElementById('totalUsers').textContent = st.totalUsers ?? 0;
                    document.getElementById('todaySites').textContent = st.sitesToday ?? 0;
                    return;
                }
            } catch (err) {
                console.error('renderStats error:', err);
            }
            document.getElementById('totalSites').textContent = allData.sites.length;
            const userCount = allData.users.length || new Set(allData.sites.map(s => s.owner_id)).size;
            document.getElementById('totalUsers').textContent = userCount;
            const today = new Date().toDateString();
            document.getElementById('todaySites').textContent = allData.sites.filter(s => new Date(s.created_at).toDateString() === today).length;
        }

        function renderSites(query) {
            query = (query || '').toLowerCase().trim();
            var view = query
                ? allData.sites.filter(s =>
                    s.name.toLowerCase().includes(query) ||
                    (s.ownerEmail || '').toLowerCase().includes(query) ||
                    (s.owner_id || '').toLowerCase().includes(query) ||
                    (s.ip_address || '').includes(query))
                : allData.sites;
            if (!view.length) {
                document.getElementById('tab-sites').innerHTML = query
                    ? '<div class="empty-state"><i class="fas fa-search"></i><p>没有找到匹配「' + esc(query) + '」的网站</p></div>'
                    : '<div class="empty-state"><i class="fas fa-globe"></i><p>暂无网站</p></div>';
                return;
            }
            const page = paginationState.sites.page;
            const start = (page - 1) * PAGE_SIZE;
            const sites = view.slice(start, start + PAGE_SIZE);
            const rows = sites.map(site => {
                const siteType = site.type === 'md' ? 'md' : (site.type === 'project' ? 'project' : 'html');
                const urlPrefix = siteType === 'md' ? '/md/' : (siteType === 'project' ? '/p/' : '/s/');
                const siteUrl = API_URL + urlPrefix + encodeURIComponent(site.name);

                const typeBadge = site.type === 'md'
                    ? '<span style="padding:1px 7px;border-radius:999px;font-size:10px;color:#f9a825;border:1px solid rgba(249,168,37,.4);margin-left:6px;vertical-align:1px;">MD</span>'
                    : site.type === 'project'
                    ? '<span style="padding:1px 7px;border-radius:999px;font-size:10px;color:#bb86fc;border:1px solid rgba(187,134,252,.4);margin-left:6px;vertical-align:1px;">PROJECT</span>'
                    : '<span style="padding:1px 7px;border-radius:999px;font-size:10px;color:#03dac6;border:1px solid rgba(3,218,198,.4);margin-left:6px;vertical-align:1px;">HTML</span>';
                return `<tr onclick="openSiteDetailPage('${esc(site.name)}')" style="cursor:pointer;">
                    <td><a href="javascript:void(0)" onclick="event.stopPropagation();openSiteDetailPage('${esc(site.name)}')" class="site-name">${esc(site.name)}</a>${typeBadge}</td>
                    <td style="color:var(--color-fg-default);font-size:13px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(site.ownerEmail || site.owner_id || '—')}">${esc(site.ownerEmail || site.owner_id || '—')}</td>
                    <td style="font-family:monospace;font-size:12px;color:var(--color-fg-default);white-space:nowrap;">${esc(site.ip_address || '—')}</td>
                </tr>`;
            }).join('');
            document.getElementById('tab-sites').innerHTML = `
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>网站</th>
                                <th>所有者</th>
                                <th>IP</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                ${renderPageBar(view.length, page, 'gotoSitesPage')}`;
        }

        function filterSites() {
            paginationState.sites.page = 1;
            const query = document.getElementById('siteSearchInput').value;
            renderSites(query);
        }

        function renderUsers() {
            if (!allData.users.length) {
                document.getElementById('tab-users').innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>暂无用户</p></div>';
                return;
            }
            const page = paginationState.users.page;
            const start = (page - 1) * PAGE_SIZE;
            const users = allData.users.slice(start, start + PAGE_SIZE);
            const rows = users.map(u => {
                const createdAt = new Date(u.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
                const sitesHtml = u.sites && u.sites.length
                    ? u.sites.map(s => {
                        const sType = s.type === 'md' ? 'md' : (s.type === 'project' ? 'project' : 'html');
                        const urlPrefix = sType === 'md' ? '/md/' : (sType === 'project' ? '/p/' : '/s/');
                        const siteSlug = s.name;
                        const url = API_URL + urlPrefix + encodeURIComponent(siteSlug);
                        return `<a href="${url}" target="_blank" class="btn btn-secondary" style="margin:2px;"><i class="fas fa-globe"></i> ${esc(s.name)}</a>`;
                    }).join('')
                    : '<span style="color: var(--color-fg-subtle);">—</span>';
                return `<tr>
                    <td><strong>${esc(u.email)}</strong></td>
                    <td class="site-time">${createdAt}</td>
                    <td>${sitesHtml}</td>
                    <td><button class="btn btn-danger" onclick="showDeleteUser('${esc(u.id)}', '${esc(u.email)}', ${u.siteCount || 0})"><i class="fas fa-user-times"></i></button></td>
                </tr>`;
            }).join('');
            document.getElementById('tab-users').innerHTML = `
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>邮箱</th>
                                <th>注册时间</th>
                                <th>网站</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                ${renderPageBar(allData.users.length, page, 'gotoUsersPage')}`;
        }

        function editSite(name, siteType) {
            siteType = siteType || 'html';
            if (siteType === 'project') {
                openSiteDetailPage(name);
                return;
            }
            const isMd = siteType === 'md';
            document.getElementById('editType').value = isMd ? 'md' : 'html';
            document.getElementById('editSiteName').textContent = name;

            if (isMd) {
                document.getElementById('html-editor-panel').style.display = 'none';
                document.getElementById('md-editor-panel').style.display = 'block';
            } else {
                document.getElementById('html-editor-panel').style.display = 'block';
                document.getElementById('md-editor-panel').style.display = 'none';
            }

            document.getElementById('editModal').classList.add('active');

            if (isMd) {
                document.getElementById('editMd').value = '加载中...';
            } else {
                document.getElementById('editHtml').value = '加载中...';
            }

            fetchSiteContent(name);
        }

        async function fetchSiteContent(name) {
            const isMd = document.getElementById('editType').value === 'md';
            try {
                const res = await apiFetch(`${API_URL}/api/admin/site/${encodeURIComponent(name)}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '加载失败');

                if (isMd) {
                    const md = data.md || '';
                    document.getElementById('editMd').value = md;
                } else {
                    const html = data.html || '';
                    document.getElementById('editHtml').value = html;
                }
            } catch (err) {
                const msg = '加载失败: ' + err.message;
                if (isMd) {
                    document.getElementById('editMd').value = msg;
                } else {
                    document.getElementById('editHtml').value = msg;
                }
            }
        }

        async function saveSite() {
            const name = document.getElementById('editSiteName').textContent;
            const isMd = document.getElementById('editType').value === 'md';
            const token = checkAuth();
            if (!token) return;

            let body = { slug: name };
            if (isMd) {
                const md = document.getElementById('editMd').value;
                body.md = md;
            } else {
                const html = document.getElementById('editHtml').value;
                body.html = html;
            }

            try {
                const res = await apiFetch(`${API_URL}/api/admin/site/${encodeURIComponent(name)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(body)
                });
                if (!res.ok) {
                    const d = await res.json();
                    throw new Error(d.error || '保存失败');
                }
                showToast('保存成功', 'success');
                closeEditModal();
                loadData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        function closeEditModal() {
            document.getElementById('editModal').classList.remove('active');
        }

        let currentDetailSlug = null;

        function openSiteDetailPage(name) {
            history.pushState({ adminDetail: name }, '', '?site=' + encodeURIComponent(name));
            renderSiteDetailPage(name);
        }

        function backToAdmin() {
            history.pushState({}, '', location.pathname);
            document.getElementById('siteDetailPage').style.display = 'none';
            document.querySelectorAll('.stats-grid, .section').forEach(el => {
                if (el.id !== 'siteDetailPage') el.style.display = '';
            });
            currentDetailSlug = null;
        }

        async function renderSiteDetailPage(name) {
            currentDetailSlug = name;
            document.querySelectorAll('.stats-grid, .section').forEach(el => {
                if (el.id !== 'siteDetailPage') el.style.display = 'none';
            });
            document.getElementById('siteDetailPage').style.display = 'block';
            document.getElementById('detailPageName').textContent = name;
            document.getElementById('detailPageMeta').innerHTML = '加载中...';
            document.getElementById('detailPageFiles').innerHTML = '';
            document.getElementById('detailPageActions').innerHTML = '';
            try {
                const res = await apiFetch(API_URL + '/api/admin/site/' + encodeURIComponent(name), {
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sb_token') }
                });
                const d = await res.json();
                if (!res.ok) { document.getElementById('detailPageMeta').innerHTML = '<p style="color:var(--color-danger-fg);">' + esc(d.error || '加载失败') + '</p>'; return; }
                const fmt = (n) => n == null ? '—' : (n < 1024 ? n + ' B' : (n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'));
                const typeTag = '<span style="padding:2px 10px;border-radius:999px;font-size:11px;' + (d.type === 'md' ? 'color:#f9a825;border:1px solid rgba(249,168,37,.4);' : d.type === 'project' ? 'color:#bb86fc;border:1px solid rgba(187,134,252,.4);' : 'color:#03dac6;border:1px solid rgba(3,218,198,.4);') + '">' + esc(d.type || 'html').toUpperCase() + '</span>';
                const siteUrl = API_URL + (d.type === 'md' ? '/md/' : d.type === 'project' ? '/p/' : '/s/') + encodeURIComponent(d.name);
                let actions = '<a href="' + siteUrl + '" target="_blank" class="btn btn-primary" style="padding:8px 16px;"><i class="fas fa-external-link-alt"></i> 访问</a>';
                if (d.type !== 'project') {
                    actions += '<button class="btn btn-secondary" onclick="editSite(\'' + name.replace(/'/g, "\\'") + '\',\'' + d.type + '\')" style="padding:8px 16px;"><i class="fas fa-edit"></i> 编辑</button>';
                }
                actions += '<button class="btn btn-danger" onclick="showDelete(\'' + name.replace(/'/g, "\\'") + '\')" style="padding:8px 16px;"><i class="fas fa-trash"></i> 删除</button>';
                document.getElementById('detailPageActions').innerHTML = actions;
                const meta = [
                    ['类型', typeTag],
                    ['访问量', String(d.visit_count || 0)],
                    ['所有者', esc(d.owner_id || '—')],
                    ['IP', esc(d.ip_address || '—')],
                    ['创建', d.created_at ? new Date(d.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'],
                    ['更新', d.updated_at ? new Date(d.updated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—']
                ].map(([k, v]) => '<div style="background:var(--color-canvas-subtle);border:1px solid var(--color-border-muted);border-radius:8px;padding:10px 14px;"><div style="font-size:11px;color:var(--color-fg-muted);margin-bottom:4px;">' + k + '</div><div style="font-size:13px;word-break:break-all;">' + v + '</div></div>').join('');
                document.getElementById('detailPageMeta').innerHTML = meta;
                document.getElementById('detailPageContentSection').style.display = 'none';
                if (d.type === 'project' && d.files) {
                    document.getElementById('detailPageFilesSection').style.display = '';
                    document.getElementById('detailPageFiles').innerHTML =
                        '<div style="font-size:12px;color:var(--color-fg-muted);margin-bottom:8px;">共 ' + d.files.files.length + ' 个文件 · ' + fmt(d.files.totalSize) + '（可拖拽文件到行上替换）</div>' +
                        '<div style="border:1px solid var(--color-border-muted);border-radius:8px;background:var(--color-canvas-subtle);">' +
                        d.files.files.map(f => '<div class="admin-file-row" data-path="' + esc(f.name) + '" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 12px;font-size:12px;border-bottom:1px solid var(--color-border-muted);font-family:monospace;word-break:break-all;"><span>' + esc(f.name) + '</span><span style="display:flex;align-items:center;gap:6px;flex-shrink:0;"><span style="color:var(--color-fg-muted);">' + fmt(f.size) + '</span><button onclick="adminEditProjFile(\'' + name.replace(/'/g, "\\'") + '\',\'' + f.name.replace(/'/g, "\\'") + '\')" style="background:var(--color-success-subtle);border:1px solid var(--color-success-fg);color:var(--color-success-fg);border-radius:4px;font-size:11px;padding:1px 7px;cursor:pointer;">编辑</button><button onclick="adminDeleteProjFile(\'' + name.replace(/'/g, "\\'") + '\',\'' + f.name.replace(/'/g, "\\'") + '\')" style="background:var(--color-danger-subtle);border:1px solid var(--color-danger-fg);color:var(--color-danger-fg);border-radius:4px;font-size:11px;padding:1px 7px;cursor:pointer;">删除</button></span></div>').join('') +
                        '</div>';
                } else {
                    document.getElementById('detailPageFilesSection').style.display = 'none';
                    document.getElementById('detailPageContentSection').style.display = '';
                    const content = d.type === 'md' ? (d.md || '') : (d.html || '');
                    document.getElementById('detailPageContent').textContent = content.substring(0, 3000) + (content.length > 3000 ? '...（过长仅预览前 3000 字符）' : '');
                }
            } catch (e) {
                document.getElementById('detailPageMeta').innerHTML = '<p style="color:var(--color-danger-fg);">网络错误</p>';
            }
        }

        (function initAdminFileDrag() {
            let overRow = null;
            document.addEventListener('dragover', (e) => {
                const row = e.target.closest ? e.target.closest('.admin-file-row') : null;
                if (!row) { if (overRow) { overRow.style.background = ''; overRow = null; } return; }
                e.preventDefault();
                if (overRow && overRow !== row) overRow.style.background = '';
                row.style.background = 'rgba(2,255,142,.15)';
                overRow = row;
            });
            document.addEventListener('dragleave', (e) => {
                if (overRow && !overRow.contains(e.relatedTarget)) { overRow.style.background = ''; overRow = null; }
            });
            document.addEventListener('drop', (e) => {
                const row = e.target.closest ? e.target.closest('.admin-file-row') : null;
                if (overRow) { overRow.style.background = ''; overRow = null; }
                if (!row || !currentDetailSlug) return;
                e.preventDefault();
                const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (!file) { showToast('无法读取文件', 'error'); return; }
                if (/\.zip$/i.test(file.name)) { showToast('zip 请用部署页整体上传', 'error'); return; }
                const path = row.getAttribute('data-path');
                adminReplaceFileByDrag(currentDetailSlug, path, file);
            });
        })();

        async function adminReplaceFileByDrag(slug, path, file) {
            const reader = new FileReader();
            reader.onload = async () => {
                const content = String(reader.result).split(',')[1];
                if (!content) { showToast('读取文件失败', 'error'); return; }
                const bytes = Math.ceil((content.length * 3) / 4);
                if (bytes > 200 * 1024) { showToast('文件超过 200KB', 'error'); return; }
                try {
                    showToast('正在替换 ' + path + '...');
                    const res = await apiFetch(API_URL + '/api/proj-file/' + encodeURIComponent(slug) + '/' + path.split('/').map(encodeURIComponent).join('/'), {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('sb_token') },
                        body: JSON.stringify({ content })
                    });
                    const d = await res.json();
                    if (!res.ok) { showToast(d.error || '替换失败', 'error'); return; }
                    showToast('已替换 ' + path);
                    renderSiteDetailPage(slug);
                } catch (e) {
                    showToast('网络错误', 'error');
                }
            };
            reader.onerror = () => showToast('读取文件失败', 'error');
            reader.readAsDataURL(file);
        }

        (function initDetailRoute() {
            const params = new URLSearchParams(location.search);
            const site = params.get('site');
            if (site) {
                setTimeout(() => renderSiteDetailPage(site), 300);
            }
            window.addEventListener('popstate', () => {
                const p = new URLSearchParams(location.search);
                const s = p.get('site');
                if (s) renderSiteDetailPage(s);
                else if (currentDetailSlug) backToAdmin();
            });
        })();

        async function showSiteDetail(name) {
            document.getElementById('siteDetailModal').classList.add('active');
            document.getElementById('detailSiteName').textContent = name;
            document.getElementById('siteDetailBody').innerHTML = '加载中...';
            try {
                const res = await apiFetch(API_URL + '/api/admin/site/' + encodeURIComponent(name), {
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sb_token') }
                });
                const d = await res.json();
                if (!res.ok) { document.getElementById('siteDetailBody').innerHTML = '<p style="color:var(--color-danger-fg);">' + esc(d.error || '加载失败') + '</p>'; return; }
                const typeTag = '<span style="padding:2px 8px;border-radius:999px;font-size:11px;' + (d.type === 'md' ? 'color:#f9a825;border:1px solid rgba(249,168,37,.4);' : d.type === 'project' ? 'color:#bb86fc;border:1px solid rgba(187,134,252,.4);' : 'color:#03dac6;border:1px solid rgba(3,218,198,.4);') + '">' + esc(d.type || 'html').toUpperCase() + '</span>';
                const fmt = (n) => n == null ? '—' : (n < 1024 ? n + ' B' : (n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'));
                let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13px;margin-bottom:12px;">';
                html += '<div><span style="color:var(--color-fg-muted);">类型</span><br>' + typeTag + '</div>';
                html += '<div><span style="color:var(--color-fg-muted);">访问量</span><br>' + (d.visit_count || 0) + '</div>';
                html += '<div><span style="color:var(--color-fg-muted);">所有者</span><br>' + esc(d.owner_id || '—') + '</div>';
                html += '<div><span style="color:var(--color-fg-muted);">IP</span><br>' + esc(d.ip_address || '—') + '</div>';
                html += '<div><span style="color:var(--color-fg-muted);">创建</span><br>' + (d.created_at ? new Date(d.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—') + '</div>';
                html += '<div><span style="color:var(--color-fg-muted);">更新</span><br>' + (d.updated_at ? new Date(d.updated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—') + '</div>';
                html += '</div>';
                if (d.type === 'project' && d.files) {
                    html += '<div style="font-size:13px;font-weight:600;margin-bottom:6px;color:var(--color-fg-default);">文件列表（' + d.files.files.length + ' 个 · 共 ' + fmt(d.files.totalSize) + '）</div>';
                    html += '<div style="border:1px solid var(--color-border-muted);border-radius:6px;background:var(--color-canvas-subtle);">';
                    html += d.files.files.map(f => '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;font-size:12px;border-bottom:1px solid var(--color-border-muted);font-family:monospace;word-break:break-all;"><span>' + esc(f.name) + '</span><span style="display:flex;align-items:center;gap:6px;flex-shrink:0;"><span style="color:var(--color-fg-muted);">' + fmt(f.size) + '</span><button onclick="adminEditProjFile(\'' + name.replace(/'/g, "\\'") + '\',\'' + f.name.replace(/'/g, "\\'") + '\')" style="background:var(--color-success-subtle);border:1px solid var(--color-success-fg);color:var(--color-success-fg);border-radius:4px;font-size:11px;padding:1px 7px;cursor:pointer;">编辑</button><button onclick="adminDeleteProjFile(\'' + name.replace(/'/g, "\\'") + '\',\'' + f.name.replace(/'/g, "\\'") + '\')" style="background:var(--color-danger-subtle);border:1px solid var(--color-danger-fg);color:var(--color-danger-fg);border-radius:4px;font-size:11px;padding:1px 7px;cursor:pointer;">删除</button></span></div>').join('');
                    html += '</div>';
                } else if (d.type === 'md' && d.md !== undefined) {
                    html += '<div style="font-size:13px;font-weight:600;margin-bottom:6px;color:var(--color-fg-default);">Markdown 内容</div><pre style="background:var(--color-canvas-inset);border:1px solid var(--color-border-muted);border-radius:6px;padding:10px;font-size:12px;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-all;">' + esc(d.md.substring(0, 2000)) + (d.md.length > 2000 ? '...（内容过长，仅预览前 2000 字符）' : '') + '</pre>';
                } else if (d.html !== undefined) {
                    html += '<div style="font-size:13px;font-weight:600;margin-bottom:6px;color:var(--color-fg-default);">HTML 内容预览</div><pre style="background:var(--color-canvas-inset);border:1px solid var(--color-border-muted);border-radius:6px;padding:10px;font-size:12px;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-all;">' + esc(d.html.substring(0, 2000)) + (d.html.length > 2000 ? '...（内容过长，仅预览前 2000 字符）' : '') + '</pre>';
                }
                document.getElementById('siteDetailBody').innerHTML = html;
            } catch (e) {
                document.getElementById('siteDetailBody').innerHTML = '<p style="color:var(--color-danger-fg);">网络错误</p>';
            }
        }

        function closeSiteDetailModal() {
            document.getElementById('siteDetailModal').classList.remove('active');
        }

        // admin
        async function adminEditProjFile(slug, path) {
            const modal = document.getElementById('projFileModal');
            document.getElementById('projFileSlug').value = slug;
            document.getElementById('projFilePath').value = path;
            document.getElementById('projFileTitle').textContent = slug + '/' + path;
            document.getElementById('projFileContent').value = '加载中...';
            modal.classList.add('active');
            try {
                const res = await apiFetch(API_URL + '/api/proj-file/' + encodeURIComponent(slug) + '/' + path.split('/').map(encodeURIComponent).join('/'), {
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sb_token') }
                });
                const d = await res.json();
                if (!res.ok) { closeProjFileModal(); showToast(d.error || '读取失败', 'error'); return; }
                document.getElementById('projFileContent').value = d.content;
            } catch (e) {
                closeProjFileModal();
                showToast('网络错误', 'error');
            }
        }

        function closeProjFileModal() {
            document.getElementById('projFileModal').classList.remove('active');
        }

        async function saveProjFile() {
            const slug = document.getElementById('projFileSlug').value;
            const path = document.getElementById('projFilePath').value;
            const content = document.getElementById('projFileContent').value;
            if (content.length > 200 * 1024) { showToast('单文件超过 200KB', 'error'); return; }
            try {
                const putRes = await apiFetch(API_URL + '/api/proj-file/' + encodeURIComponent(slug) + '/' + path.split('/').map(encodeURIComponent).join('/'), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('sb_token') },
                    body: JSON.stringify({ content })
                });
                const putData = await putRes.json();
                if (!putRes.ok) { showToast(putData.error || '保存失败', 'error'); return; }
                closeProjFileModal();
                showToast('文件已保存');
                showSiteDetail(slug);
            } catch (e) {
                showToast('网络错误', 'error');
            }
        }

        async function adminDeleteProjFile(slug, path) {
            if (!confirm('确定删除文件 ' + path + ' ?此操作不可恢复。')) return;
            const delRes = await apiFetch(API_URL + '/api/proj-file/' + encodeURIComponent(slug) + '/' + path.split('/').map(encodeURIComponent).join('/'), {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sb_token') }
            });
            const delData = await delRes.json();
            if (!delRes.ok) { showToast(delData.error || '删除失败', 'error'); return; }
            showToast('文件已删除');
            showSiteDetail(slug);
        }

        async function showDelete(name) {
            pendingDeleteSite = name;
            document.getElementById('deleteSiteNameDisplay').textContent = name;
            const info = document.getElementById('deleteStorageInfo');
            info.innerHTML = '<span style="opacity:.6;">加载存储信息...</span>';
            document.getElementById('deleteModal').classList.add('active');
            try {
                const res = await apiFetch(API_URL + '/api/admin/site/' + encodeURIComponent(name), {
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sb_token') }
                });
                const d = await res.json();
                if (!res.ok) { info.innerHTML = ''; return; }
                const fmt = (n) => n == null ? '—' : (n < 1024 ? n + ' B' : (n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'));
                if (d.type === 'project' && d.files && d.files.files.length) {
                    info.innerHTML = '<div style="margin-bottom:4px;"><i class="fas fa-database"></i> 将删除 ' + d.files.files.length + ' 个文件，共 ' + fmt(d.files.totalSize) + '</div>' +
                        d.files.files.slice(0, 20).map(f => '<div style="font-family:monospace;padding:1px 0;opacity:.8;">' + esc(f.name) + ' · ' + fmt(f.size) + '</div>').join('') +
                        (d.files.files.length > 20 ? '<div style="opacity:.5;">... 等 ' + (d.files.files.length - 20) + ' 个文件</div>' : '');
                } else {
                    info.innerHTML = '<div><i class="fas fa-database"></i> 单文件站点（index.' + (d.type === 'md' ? 'md' : 'html') + '）</div>';
                }
            } catch (e) {
                info.innerHTML = '';
            }
        }
        function closeDeleteModal() {
            document.getElementById('deleteModal').classList.remove('active');
            pendingDeleteSite = null;
        }
        async function confirmDelete() {
            if (!pendingDeleteSite) return;
            const token = checkAuth();
            if (!token) return;
            try {
                const res = await apiFetch(`${API_URL}/api/admin/delete-site`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ siteName: pendingDeleteSite })
                });
                if (!res.ok) {
                    const d = await res.json();
                    throw new Error(d.error || '删除失败');
                }
                showToast('删除成功', 'success');
                closeDeleteModal();
                loadData();
            } catch (err) { showToast(err.message, 'error'); }
        }

        function showDeleteUser(userId, email, siteCount) {
            pendingDeleteUser = userId;
            document.getElementById('deleteUserEmailDisplay').textContent = email;
            document.getElementById('deleteUserSitesNote').textContent = siteCount > 0
                ? `该用户有 ${siteCount} 个网站也将被一并删除`
                : '该用户暂无网站';
            document.getElementById('deleteUserModal').classList.add('active');
        }
        function closeDeleteUserModal() {
            document.getElementById('deleteUserModal').classList.remove('active');
            pendingDeleteUser = null;
        }
        async function confirmDeleteUser() {
            if (!pendingDeleteUser) return;
            const token = checkAuth();
            if (!token) return;
            try {
                const res = await apiFetch(`${API_URL}/api/admin/delete-user`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ userId: pendingDeleteUser })
                });
                if (!res.ok) {
                    const d = await res.json();
                    throw new Error(d.error || '删除失败');
                }
                showToast('用户已删除', 'success');
                closeDeleteUserModal();
                loadData();
                loadUsers();
            } catch (err) { showToast(err.message, 'error'); }
        }

        // Escape HTML
        function esc(str) {
            if (!str) return '';
            const d = document.createElement('div');
            d.textContent = str;
            return d.innerHTML;
        }

        // System Status 
        const SERVICE_KEYS = ['login', 'register', 'create', 'my-sites', 'update', 'delete', 'serve-html', 'serve-md'];

        async function loadSystemStatus() {
            const token = checkAuth();
            if (!token) return;
            try {
                const res = await apiFetch(`${API_URL}/api/admin/system-status`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '加载失败');
                document.getElementById('maintenanceMode').checked = data.maintenance_mode || false;
                document.getElementById('maintenanceMsg').value = data.maintenance_message || '';
                const services = data.services || {};
                SERVICE_KEYS.forEach(key => {
                    const el = document.getElementById('svc-' + key);
                    if (el) el.checked = services[key] !== false;
                });
                const allOn = SERVICE_KEYS.every(key => services[key] !== false);
                document.getElementById('globalStatus').checked = allOn;
            } catch (err) {
                showToast('加载系统状态失败: ' + err.message);
            }
        }

        function toggleAllServices() {
            const globalOn = document.getElementById('globalStatus').checked;
            SERVICE_KEYS.forEach(key => {
                const el = document.getElementById('svc-' + key);
                if (el) el.checked = globalOn;
            });
            setTimeout(() => saveSystemStatus(), 0);
        }

        async function saveSystemStatus() {
            const token = checkAuth();
            if (!token) return;
            const maintenance_mode = document.getElementById('maintenanceMode').checked;
            const maintenance_message = document.getElementById('maintenanceMsg').value.trim();
            const services = {};
            let allOn = true, allOff = true;
            SERVICE_KEYS.forEach(key => {
                const el = document.getElementById('svc-' + key);
                const isOn = el ? el.checked : true;
                services[key] = isOn;
                if (isOn) allOff = false;
                else allOn = false;
            });
            const globalEl = document.getElementById('globalStatus');
            if (allOn) globalEl.checked = true;
            else if (allOff) globalEl.checked = false;
            try {
                const res = await apiFetch(`${API_URL}/api/admin/system-status`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ maintenance_mode, maintenance_message, services })
                });
                const data = await res.json();
                if (res.ok) showToast('系统状态已保存', 'success');
                else showToast(data.error || '保存失败', 'error');
            } catch (err) {
                showToast('保存失败: ' + err.message);
            }
        }


        document.getElementById('searchWrap').style.display = 'flex';
        loadData();
        loadSystemStatus();
        loadAnnouncement();

        // ===== 公告 =====
        async function loadAnnouncement() {
            try {
                const res = await apiFetch(API_URL + '/api/announcement');
                const d = await res.json();
                if (d && d.announcement) {
                    document.getElementById('currentAnnouncement').textContent = d.announcement;
                    document.getElementById('announcementContent').value = d.announcement;
                }
            } catch (e) {}
        }
        async function saveAnnouncement() {
            const token = checkAuth();
            if (!token) return;
            const content = document.getElementById('announcementContent').value.trim();
            if (!content) { showToast('公告内容不能为空', 'error'); return; }
            if (content.length > 500) { showToast('公告内容超过 500 字符', 'error'); return; }
            try {
                const res = await apiFetch(API_URL + '/api/admin/announcement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ action: 'set', content })
                });
                const d = await res.json();
                if (res.ok) { showToast('公告已发布', 'success'); loadAnnouncement(); }
                else showToast(d.error || '发布失败', 'error');
            } catch (e) {
                showToast('网络错误', 'error');
            }
        }
        async function clearAnnouncement() {
            const token = checkAuth();
            if (!token) return;
            try {
                const res = await apiFetch(API_URL + '/api/admin/announcement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ action: 'clear' })
                });
                const d = await res.json();
                if (res.ok) { showToast('公告已清除', 'success'); document.getElementById('announcementContent').value = ''; document.getElementById('currentAnnouncement').textContent = '—'; }
                else showToast(d.error || '清除失败', 'error');
            } catch (e) {
                showToast('网络错误', 'error');
            }
        }
