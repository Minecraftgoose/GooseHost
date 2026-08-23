        const API_URL_FALLBACK = 'https://page.goose.gs.cn';
        let API_URL = API_URL_FALLBACK;
        fetch(API_URL_FALLBACK + '/api/config').then(r => r.json()).then(d => {
            if (d && d.apiUrl) { window.API_URL = d.apiUrl; API_URL = d.apiUrl; }
        }).catch(() => {});

        let token = localStorage.getItem('sb_token');
        let user = JSON.parse(localStorage.getItem('sb_user') || 'null');

        (function preloadWallpaper() {
            const bgLayer = document.getElementById('bgLayer');
            const timestamp = new Date().getTime();
            const wallpaperUrl = `https://api.fuchenboke.cn/api/fengjing.php?t=${timestamp}`;
            const img = new Image();
            img.onload = function() {
                bgLayer.style.backgroundImage = `url('${wallpaperUrl}')`;
                bgLayer.classList.add('loaded');
            };
            img.onerror = function() {
                bgLayer.classList.add('loaded');
            };
            img.src = wallpaperUrl;
        })();

        if (!token || !user) {
            location.href = '/login/';
        }

        document.getElementById('account-email').textContent = user?.email || '';
        document.getElementById('account-nickname').textContent =
            (user?.raw_user_meta_data && user.raw_user_meta_data.nickname) || '未设置';
        refreshNickname();

        loadPreferences();

        function loadPreferences() {
            const prefs = JSON.parse(localStorage.getItem('preferences') || '{}');
            document.getElementById('toggle-welcome').checked = (prefs.showWelcome !== false);
        }

        function savePreferences() {
            const prefs = {
                showWelcome: document.getElementById('toggle-welcome').checked
            };
            localStorage.setItem('preferences', JSON.stringify(prefs));
            showToast('设置已保存');
        }

        function clearLocalData() {
            (async () => {
                const confirmed = await showConfirm('清除数据', '确定要清除所有本地数据吗?');
                if (!confirmed) return;
                const keys = ['preferences'];
                keys.forEach(k => localStorage.removeItem(k));
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('activities_')) {
                        localStorage.removeItem(key);
                    }
                }
                showToast('本地数据已清除');
            })();
        }

        const ROUTES = {
            overview: '/dashboard',
            deploy: '/dashboard/deploy',
            sites: '/dashboard/mysite',
            preferences: '/dashboard/settings',
            account: '/dashboard/account'
        };

        function navigateTo(page) {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            const navItem = document.querySelector(`[data-page="${page}"]`);
            if (navItem) navItem.classList.add('active');

            const url = ROUTES[page] || '/dashboard';
            if (location.pathname !== url) history.pushState({ page }, '', url);

            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${page}`).classList.add('active');

            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            document.getElementById('sidebar').scrollTop = 0;

            closeSidebar();

            if (page === 'sites') loadSites();
            if (page === 'deploy') updateEditorVisibility();

            runPageTypewriter(page);

            if (page === 'deploy') {
                document.querySelectorAll('#page-deploy .page-header, #page-deploy .card').forEach(el => {
                    el.style.animation = 'none';
                    void el.offsetWidth; 
                    el.style.animation = '';
                });
            }
        }

        function parseRoute() {
            const raw = location.pathname.replace(/\/+$/, '');
            if (raw === '/dashboard' || raw.endsWith('/dashboard.html')) return navigateTo('overview');
            const m = raw.match(/^\/dashboard\/(deploy|mysite|settings|account|preferences|overview)(?:\/(.+))?$/);
            if (m) {
                const seg = m[1];
                const slug = m[2] ? decodeURIComponent(m[2]) : null;
                if (seg === 'mysite' && slug) {
                    showSiteDetail(slug);
                    return;
                }
                const map = { deploy: 'deploy', mysite: 'sites', settings: 'preferences', preferences: 'preferences', account: 'account', overview: 'overview' };
                return navigateTo(map[seg]);
            }
            return navigateTo('overview');
        }

        window.addEventListener('popstate', parseRoute);

        (function loadAnnouncement() {
            try {
                fetch(API_URL + '/api/announcement').then(r => r.json()).then(d => {
                    if (d && d.announcement) {
                        var bar = document.getElementById('announcementBanner');
                        var textEl = document.getElementById('announcementText');
                        var scrollEl = document.getElementById('announcementScroll');
                        var trackEl = document.getElementById('announcementTrack');
                        if (!bar || !textEl || !scrollEl || !trackEl) return;
                        textEl.textContent = d.announcement;
                        bar.style.display = 'flex';
                        if (textEl.scrollWidth > scrollEl.clientWidth + 4) {
                            var clone = textEl.cloneNode(true);
                            trackEl.appendChild(clone);
                            trackEl.classList.add('scrolling');
                            var duration = Math.max(8, Math.round(textEl.scrollWidth / 40));
                            trackEl.style.setProperty('--ann-duration', duration + 's');
                        }
                    }
                }).catch(() => {});
            } catch (e) {}
        })();
        document.addEventListener('DOMContentLoaded', parseRoute);
        if (document.readyState !== 'loading') parseRoute();

        function closeSidebarOnMobile(event) {
            if (window.innerWidth <= 768) {
                const target = event.target;
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.contains(target)) {
                    return;
                }
                closeSidebar();
            }
        }

        function closeSidebar() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.remove('open');
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('collapsed');
            }
        }

        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            if (sidebar.classList.contains('open')) {
                closeSidebar();
            } else {
                sidebar.classList.add('open');
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('collapsed');
                }
            }
        }

        function toggleSidebarDesktop() {
            const sidebar = document.getElementById('sidebar');
            const menuToggle = document.getElementById('menuToggle');
            const content = document.querySelector('.content');

            if (sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                content.classList.remove('sidebar-collapsed');
                menuToggle.innerHTML = '<i class="fas fa-outdent"></i>';
            } else {
                sidebar.classList.add('collapsed');
                content.classList.add('sidebar-collapsed');
                menuToggle.innerHTML = '<i class="fas fa-indent"></i>';
            }
        }

        function toggleSidebarMobile() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.remove('collapsed');
            sidebar.classList.toggle('open');
        }

        function showToast(msg, type = 'success') {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.className = `toast ${type} show`;
            setTimeout(() => t.classList.remove('show'), 3000);
        }

        function logout() {
            localStorage.removeItem('sb_token');
            localStorage.removeItem('sb_user');
            location.href = '/login/';
        }

        function confirmDeleteAccount() {
            document.getElementById('deleteAccountDialog').classList.add('active');
        }
        function closeDeleteModal() {
            document.getElementById('deleteAccountDialog').classList.remove('active');
            document.getElementById('deleteMsg').className = 'msg';
        }
        async function deleteAccount() {
            const btn = document.getElementById('deleteConfirmBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 注销中...';
            try {
                const res = await apiFetch(API_URL + '/api/delete-account', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    localStorage.removeItem('sb_token');
                    localStorage.removeItem('sb_user');
                    location.href = '/login/';
                } else {
                    const data = await res.json().catch(() => ({}));
                    const el = document.getElementById('deleteMsg');
                    el.textContent = data.error || '注销失败';
                    el.className = 'msg error';
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-user-slash"></i> 我确定，注销';
                }
            } catch {
                const el = document.getElementById('deleteMsg');
                el.textContent = '网络错误，请重试';
                el.className = 'msg error';
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-user-slash"></i> 我确定，注销';
            }
        }

        async function refreshNickname() {
            try {
                const res = await apiFetch(API_URL + '/api/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const nick = data.nickname || '未设置';
                    document.getElementById('account-nickname').textContent = nick;
                    if (user) {
                        user.raw_user_meta_data = user.raw_user_meta_data || {};
                        user.raw_user_meta_data.nickname = data.nickname || '';
                        localStorage.setItem('sb_user', JSON.stringify(user));
                    }
                }
            } catch {  }
        }

        async function editNickname() {
            const current = document.getElementById('account-nickname').textContent;
            const val = prompt('修改昵称（2-20 个字符，支持中英文、数字、下划线、空格和连字符）',
                current === '未设置' ? '' : current);
            if (val === null) return;
            const nickname = val.trim();
            if (!nickname) { showToast('昵称不能为空', 'error'); return; }
            if (nickname.length < 2 || nickname.length > 20) { showToast('昵称长度需为 2-20 个字符', 'error'); return; }
            if (!/^[一-龥a-zA-Z0-9_ \-]+$/.test(nickname)) { showToast('昵称含非法字符', 'error'); return; }

            try {
                const res = await apiFetch(API_URL + '/api/me', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ nickname })
                });
                const data = await res.json();
                if (res.ok) {
                    document.getElementById('account-nickname').textContent = data.nickname;
                    if (user) {
                        user.raw_user_meta_data = user.raw_user_meta_data || {};
                        user.raw_user_meta_data.nickname = data.nickname;
                        localStorage.setItem('sb_user', JSON.stringify(user));
                    }
                    showToast('昵称已更新');
                } else {
                    showToast(data.error || '更新失败', 'error');
                }
            } catch {
                showToast('网络错误', 'error');
            }
        }

        const fileInput = document.getElementById('fileInput');

        const mdFileInput = document.getElementById('mdFileInput');

        function handleFile(file, target) {
            if (!file) return;
            const isMd = target === 'md';
            const extRegex = isMd ? /\.(md|markdown)$/i : /\.(html?|htm)$/i;
            const errorMsg = isMd ? '请上传 Markdown 文件' : '请上传 HTML 文件';
            if (!file.name.match(extRegex)) {
                showToast(errorMsg, 'error');
                return;
            }
            if (file.size > 500 * 1024) {
                showToast('文件超过 500KB 限制', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                if (isMd) {
                    document.getElementById('deploy-md').value = content;
                } else {
                    document.getElementById('deploy-html').value = content;
                }
                showToast('已载入: ' + file.name);
            };
            reader.readAsText(file);
        }

        fileInput.addEventListener('change', (e) => handleFile(e.target.files[0], 'html'));
        mdFileInput.addEventListener('change', (e) => handleFile(e.target.files[0], 'md'));

        const projInput = document.getElementById('projInput');
        const projDropZone = document.getElementById('projDropZone');
        window.projFiles = [];

        function setProjFiles(fileList) {
            window.projFiles = Array.from(fileList || []).filter(f => f.size > 0);
            const names = window.projFiles.map(f => f.webkitRelativePath || f.name);
            const label = document.getElementById('projFileName');
            if (window.projFiles.length) {
                label.textContent = names.length > 3 ? names.slice(0, 3).join(', ') + ' 等 ' + names.length + ' 个文件' : names.join(', ');
                projDropZone.classList.add('has-file');
            } else {
                label.textContent = '';
                projDropZone.classList.remove('has-file');
            }
        }

        projInput.addEventListener('change', (e) => setProjFiles(e.target.files));

        projDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            projDropZone.classList.add('dragover');
        });
        projDropZone.addEventListener('dragleave', () => {
            projDropZone.classList.remove('dragover');
        });
        projDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            projDropZone.classList.remove('dragover');
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files.length) {
                setProjFiles(files);
            } else {
                showToast('拖入的文件无法读取', 'error');
            }
        });

        function blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        document.addEventListener('dragover', (e) => {
            const t = e.target.closest ? e.target.closest('.drop-target') : null;
            if (t && t.offsetParent !== null) {
                e.preventDefault();
                t.classList.add('dragover');
            }
        });
        document.addEventListener('dragleave', (e) => {
            const t = e.target.closest ? e.target.closest('.drop-target') : null;
            if (t && !t.contains(e.relatedTarget)) t.classList.remove('dragover');
        });
        document.addEventListener('drop', (e) => {
            const t = e.target.closest ? e.target.closest('.drop-target') : null;
            if (!t) return;
            e.preventDefault();
            t.classList.remove('dragover');
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!file) { showToast('无法读取拖入的文件', 'error'); return; }
            if (t.querySelector('#deploy-html')) handleFile(file, 'html');
            else if (t.querySelector('#deploy-md')) handleFile(file, 'md');
            else if (t.querySelector('#editHtml')) handleEditFile(file, 'html');
            else if (t.querySelector('#editMd')) handleEditFile(file, 'md');
        });

        const editFileInput = document.getElementById('editFileInput');
        const editMdFileInput = document.getElementById('editMdFileInput');

        function handleEditFile(file, target) {
            if (!file) return;
            const isMd = target === 'md';
            const extRegex = isMd ? /\.(md|markdown)$/i : /\.(html?|htm)$/i;
            const errorMsg = isMd ? '请上传 Markdown 文件' : '请上传 HTML 文件';
            if (!file.name.match(extRegex)) {
                showToast(errorMsg, 'error');
                return;
            }
            if (file.size > 500 * 1024) {
                showToast('文件超过 500KB 限制', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                if (isMd) {
                    document.getElementById('editMd').value = content;
                } else {
                    document.getElementById('editHtml').value = content;
                }
                showToast('已载入: ' + file.name);
            };
            reader.readAsText(file);
        }

        editFileInput.addEventListener('change', (e) => handleEditFile(e.target.files[0], 'html'));
        editMdFileInput.addEventListener('change', (e) => handleEditFile(e.target.files[0], 'md'));

        function selectSiteType(type) {
            document.querySelectorAll('.type-option').forEach(el => el.classList.remove('selected'));
            document.querySelector(`.type-option input[value="${type}"]`).closest('.type-option').classList.add('selected');

            const htmlGroup = document.getElementById('html-input-group');
            const mdGroup = document.getElementById('md-input-group');
            const projGroup = document.getElementById('project-input-group');

            htmlGroup.style.display = 'none';
            mdGroup.style.display = 'none';
            projGroup.style.display = 'none';
            htmlGroup.classList.remove('input-group-pop');
            mdGroup.classList.remove('input-group-pop');
            projGroup.classList.remove('input-group-pop');

            let show = htmlGroup;
            if (type === 'md') show = mdGroup;
            else if (type === 'project') show = projGroup;
            show.style.display = 'block';
            void show.offsetWidth;
            show.classList.add('input-group-pop');

            const step3 = document.getElementById('ds-3');
            if (step3 && typeof deployStep !== 'undefined' && deployStep === 3) step3.classList.add('active');
        }

        let deployStep = 1;

        function goDeployStep(next) {
            if (next < 1 || next > 3) return;

            if (next > deployStep && deployStep === 1) {
                const slug = document.getElementById('deploy-slug').value.trim();
                if (!slug) { showToast('请输入网站名称', 'error'); return; }
                if (!/^[\u4e00-\u9fa5a-zA-Z0-9_\-.~]{1,64}$/.test(slug)) { showToast('名称格式不正确', 'error'); return; }
            }

            const cur = document.getElementById('deploy-panel-' + deployStep);
            const nxt = document.getElementById('deploy-panel-' + next);
            if (!cur || !nxt) return;

            if (cur !== nxt) {
                cur.classList.add('leaving');
                setTimeout(() => { cur.classList.remove('active', 'leaving'); }, 260);
                nxt.classList.add('active');
            }
            deployStep = next;
            updateDeployNav();

            if (next === 3) {
                setTimeout(() => {
                    try {
                    } catch (e) {}
                }, 300);
            }
        }

        function updateDeployNav() {
            const prev = document.getElementById('deployPrevBtn');
            const actionBtn = document.getElementById('deployBtn');
            if (prev) prev.style.visibility = deployStep === 1 ? 'hidden' : 'visible';
            if (actionBtn) {
                if (deployStep === 3) {
                    actionBtn.innerHTML = '<i class="fas fa-rocket"></i> 部署网站';
                    actionBtn.setAttribute('onclick', 'createSite()');
                } else {
                    actionBtn.innerHTML = '下一步 <i class="fas fa-arrow-right"></i>';
                    actionBtn.setAttribute('onclick', 'goDeployStep(deployStep + 1)');
                }
            }
            for (let i = 1; i <= 3; i++) {
                const s = document.getElementById('ds-' + i);
                if (s) s.classList.toggle('active', i <= deployStep);
            }
        }
        updateDeployNav();

        async function submitToMacos(slug) {
            try {
                const name = document.getElementById('macosName') ? document.getElementById('macosName').value.trim() : '';
                const icon = document.getElementById('macosIcon') ? document.getElementById('macosIcon').value.trim() : '';
                const desc = document.getElementById('macosDesc') ? document.getElementById('macosDesc').value.trim() : '';
                const category = document.getElementById('macosCategory') ? document.getElementById('macosCategory').value : '';
                if (!name) { showToast('请填写 macOS 软件名称', 'error'); return; }
                if (!icon) { showToast('请填写 macOS 图标 URL', 'error'); return; }
                if (!/^https?:\/\//.test(icon)) { showToast('图标 URL 必须以 http:// 或 https:// 开头', 'error'); return; }
                if (!desc) { showToast('请填写 macOS 一句话描述', 'error'); return; }
                const res = await apiFetch(API_URL + '/api/macos/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug, name, icon_url: icon, description: desc, category })
                });
                const data = await res.json();
                if (res.ok && (data.ok || data.already_submitted)) {
                    showToast(data.already_submitted ? '该网站已提交过 macOS 审核' : '已提交 macOS 审核');
                } else {
                    showToast(data.error || 'macOS 提交失败', 'error');
                }
            } catch (e) {
                showToast('macOS 提交失败（可在详情页重试）', 'error');
            }
        }

        async function createSite() {
            const slug = document.getElementById('deploy-slug').value.trim();
            const siteType = document.querySelector('input[name="siteType"]:checked').value;
            const btn = document.getElementById('deployBtn');
            let html, md, zipB64;

            if (siteType === 'md') {
                md = document.getElementById('deploy-md').value;
                if (!md) { showToast('请输入 Markdown 内容', 'error'); return; }
            } else if (siteType === 'project') {
                if (!window.projFiles || !window.projFiles.length) { showToast('请选择要上传的文件', 'error'); return; }
            } else {
                html = document.getElementById('deploy-html').value;
                if (!html) { showToast('请输入 HTML 代码', 'error'); return; }
            }

            if (!slug) { showToast('请输入网站名称', 'error'); return; }
            if (!/^[\u4e00-\u9fa5a-zA-Z0-9_\-.~]{1,64}$/.test(slug)) {
                showToast('名称格式不正确', 'error'); return;
            }

            if (siteType === 'project') {
                const f = window.projFiles[0];
                if (!f || !/\.zip$/i.test(f.name)) { showToast('请选择 .zip 压缩包', 'error'); return; }
                try {
                    zipB64 = await blobToBase64(f);
                } catch (err) {
                    showToast('读取 zip 失败: ' + (err.message || '未知错误'), 'error'); return;
                }
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="infinity-btn"></span> 部署中...';

            if (!document.getElementById('infinityBtnStyle')) {
                const style = document.createElement('style');
                style.id = 'infinityBtnStyle';
                style.textContent = `
                    .infinity-btn {
                        display: inline-block;
                        width: 16px;
                        height: 16px;
                        background: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 50,50 C 50,20 80,20 100,50 C 120,80 150,80 150,50 C 150,20 120,20 100,50 C 80,80 50,80 50,50 Z' fill='none' stroke='%23001a0d' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat;
                        animation: infinity-btn-draw 1s ease-in-out infinite;
                    }
                    @keyframes infinity-btn-draw {
                        0% { opacity: 1; }
                        50% { opacity: 0.5; }
                        100% { opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            try {
                const body = { slug };
                if (siteType === 'md') {
                    body.md = md;
                } else if (siteType === 'project') {
                    body.type = 'project';
                    body.zip = zipB64;
                } else {
                    body.html = html;
                }
                const res = await apiFetch(API_URL + '/api/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(body)
                });
                let data;
                try { data = await res.json(); } catch { data = {}; }
                if (res.ok && data.success) {
                    document.getElementById('deploy-slug').value = '';
                    if (siteType === 'md') {
                        document.getElementById('deploy-md').value = '';
                    } else if (siteType === 'project') {
                        window.projFiles = [];
                        projFileName.textContent = '';
                        projDropZone.classList.remove('has-file');
                        projInput.value = '';
                    } else {
                        document.getElementById('deploy-html').value = '';
                    }
                    showToast('部署成功!');
                    if (document.getElementById('macosSubmit') && document.getElementById('macosSubmit').checked) {
                        submitToMacos(slug);
                    }
                    navigateTo('sites');
                } else {
                    showToast(data.error || '部署失败', 'error');
                }
            } catch (e) {
                showToast(e.message === '请求超时' ? '请求超时，请重试' : '网络错误', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-rocket"></i> 部署网站';
            }
        }
        let refreshPromise = null;

        function jwtExpiry(token) {
            try {
                const parts = token.split('.');
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
                    return true;
                }
                localStorage.removeItem('sb_refresh_token');
                return false;
            } catch {
                return false;
            }
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
                    location.href = '/login/';
                    throw new Error('Unauthorized');
                }
                return res;
            } catch (e) {
                clearTimeout(timeout);
                if (e.name === 'AbortError') throw new Error('请求超时');
                throw e;
            }
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;');
        }

        async function loadSites() {
            window.allSites = [];
            const list = document.getElementById('siteList');
            list.innerHTML = '<svg class="infinity-svg" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><path class="infinity-path" d="M 50,50 C 50,20 80,20 100,50 C 120,80 150,80 150,50 C 150,20 120,20 100,50 C 80,80 50,80 50,50 Z" /></svg>';

            try {
                const res = await apiFetch(API_URL + '/api/my-sites', { headers: { 'Authorization': `Bearer ${token}` } });
                let sites;
                try { sites = await res.json(); } catch { sites = []; }

                sites.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

                document.getElementById('stat-sites').textContent = sites.length;
                document.getElementById('stat-visits').textContent = sites.reduce((sum, s) => sum + (Number(s.visit_count) || 0), 0).toLocaleString();
                if (sites.length > 0) {
                    const latest = new Date(sites[0].updated_at);
                    document.getElementById('stat-latest').textContent = formatTime(latest);
                } else {
                    document.getElementById('stat-latest').textContent = '-';
                }

                if (sites.length === 0) {
                    list.innerHTML = '<div class="empty"><i class="fas fa-globe"></i><p>还没有网站,创建一个吧!</p></div>';
                    return;
                }

                list.innerHTML = `<div class="card"><div class="site-list">` +
                    sites.map((site, i) => {
                        const siteType = site.type === 'md' ? 'md' : (site.type === 'project' ? 'project' : 'html');
                        const visitUrl = siteType === 'md'
                            ? `${API_URL}/md/${encodeURIComponent(site.name)}`
                            : siteType === 'project'
                            ? `${API_URL}/p/${encodeURIComponent(site.name)}`
                            : `${API_URL}/s/${encodeURIComponent(site.name)}`;
                        return `
                        <div class="site-item splash-action" data-slug="${escapeHtml(site.name)}" onclick="showSiteDetail('${site.name.replace(/'/g, "\\'")}')" style="animation-delay: ${(window.__splashDone ? 0 : 2.5) + i * 0.08}s">
                            <div class="site-info">
                                <div class="site-name">${escapeHtml(site.name)}</div>
                                <div class="site-meta">
                                    <span class="type-tag ${siteType}">${siteType.toUpperCase()}</span>
                                    <span><i class="fas fa-eye"></i> ${site.visit_count || 0}</span>
                                    <span><i class="fas fa-calendar"></i> ${formatDate(site.created_at)}</span>
                                    <span><i class="fas fa-clock"></i> ${formatTime(new Date(site.updated_at))}</span>
                                </div>
                            </div>
                        </div>
                    `}).join('') + '</div></div>';

                window.allSites = sites || [];
            } catch (e) {
                window.allSites = [];
                list.innerHTML = '<div class="empty"><i class="fas fa-exclamation-triangle"></i><p>加载失败</p></div>';
            }
        }

        async function showSiteDetail(slug) {
            history.pushState({ page: 'detail', slug }, '', `/dashboard/mysite/${encodeURIComponent(slug)}`);
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            const navSites = document.querySelector('[data-page="sites"]');
            if (navSites) navSites.classList.add('active');
            document.querySelectorAll('.page').forEach(pp => pp.classList.remove('active'));
            document.getElementById('page-detail').classList.add('active');
            window.scrollTo(0, 0);
            closeSidebar();
            document.getElementById('detailPageTitle').textContent = slug;
            document.getElementById('pageDetailBody').innerHTML = '<div class="loading"><svg class="infinity-svg" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><path class="infinity-path" d="M 50,50 C 50,20 80,20 100,50 C 120,80 150,80 150,50 C 150,20 120,20 100,50 C 80,80 50,80 50,50 Z" /></svg></div>';

            const token = localStorage.getItem('sb_token');
            if (!token) { showToast('请先登录', 'error'); return; }
            try {
                const res = await apiFetch(API_URL + '/api/site-files/' + encodeURIComponent(slug), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) { showToast(data.error || '获取详情失败', 'error'); return; }

                const s = data.site;
                const siteType = s.type === 'md' ? 'md' : (s.type === 'project' ? 'project' : 'html');
                const visitUrl = siteType === 'md'
                    ? `${API_URL}/md/${encodeURIComponent(s.name)}`
                    : siteType === 'project'
                    ? `${API_URL}/p/${encodeURIComponent(s.name)}`
                    : `${API_URL}/s/${encodeURIComponent(s.name)}`;

                const fmtSize = (n) => n == null || n === 0
                    ? ''
                    : (n < 1024 ? n + ' B' : (n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'));

                const fileIcon = (name) => {
                    const ext = name.split('.').pop().toLowerCase();
                    if (ext === 'md' || ext === 'markdown') return 'fa-file-lines';
                    if (ext === 'svg') return 'fa-file-image';
                    if (['html', 'htm', 'css', 'js', 'mjs', 'cjs', 'json', 'ts', 'jsx', 'tsx', 'vue', 'xml'].includes(ext)) return 'fa-file-code';
                    return 'fa-file';
                };

                document.getElementById('pageDetailBody').innerHTML = `
                    <div class="detail-head">
                        <div class="detail-name">${escapeHtml(s.name)} <span class="type-tag ${siteType}">${siteType.toUpperCase()}</span></div>
                        <div class="detail-actions">
                            <a href="${visitUrl}" target="_blank" class="btn btn-primary"><i class="fas fa-external-link-alt"></i> 访问</a>
                            ${siteType !== 'project' ? `<button class="btn" onclick="editSite('${s.name.replace(/'/g, "\\'")}','${s.type}');return false;"><i class="fas fa-edit"></i> 编辑</button>` : ''}
                            <button class="btn btn-danger" onclick="confirmDelete('${s.name.replace(/'/g, "\\'")}');return false;"><i class="fas fa-trash"></i> 删除</button>
                        </div>
                    </div>
                    <div class="detail-meta">
                        <span><i class="fas fa-eye"></i> 访问量：${s.visit_count || 0}</span>
                        <span><i class="fas fa-calendar"></i> 创建：${formatDate(s.created_at)}</span>
                        <span><i class="fas fa-clock"></i> 更新：${formatTime(new Date(s.updated_at))}</span>
                        <span id="macosStatusCell" style="display:none;"><i class="fab fa-apple"></i> macOS 审核：<span id="macosStatusText">查询中...</span></span>
                    </div>
                    <div class="detail-files-title">文件列表（${data.files.length}）</div>
                    <div class="detail-files">
                        ${data.files.map(f => `<div class="detail-file${siteType === 'project' ? ' proj-file-row' : ''}" data-path="${escapeHtml(f.name)}">
                            <i class="fas ${fileIcon(f.name)}"></i>
                            <span>${escapeHtml(f.name)}</span>
                            <span class="file-size">${fmtSize(f.size)}</span>
                            ${siteType === 'project' ? `<span class="drag-hint"><i class="fas fa-upload"></i> 拖放替换</span>
                            <span class="file-actions">
                                <button onclick="editProjectFile('${s.name.replace(/'/g, "\\'")}','${f.name.replace(/'/g, "\\'")}')"><i class="fas fa-edit"></i> 编辑</button>
                                <button onclick="deleteProjectFile('${s.name.replace(/'/g, "\\'")}','${f.name.replace(/'/g, "\\'")}')" class="del"><i class="fas fa-trash"></i> 删除</button>
                            </span>` : ''}
                        </div>`).join('')}
                    </div>`;
                loadMacosStatus(s.name);
            } catch (e) {
                document.getElementById('pageDetailBody').innerHTML = '<div class="empty"><i class="fas fa-exclamation-triangle"></i><p>加载失败</p></div>';
                showToast('网络错误', 'error');
            }
        }

        async function loadMacosStatus(slug) {
            const cell = document.getElementById('macosStatusCell');
            if (!cell) return;
            try {
                const res = await apiFetch(API_URL + '/api/macos/status?slug=' + encodeURIComponent(slug));
                const data = await res.json();
                if (!res.ok) return;
                if (!data.submitted) return;
                cell.style.display = '';
                const txt = document.getElementById('macosStatusText');
                if (data.status === 'approved') {
                    txt.innerHTML = '<span style="color:#02ff8e;">已上架</span>';
                } else if (data.status === 'rejected') {
                    txt.innerHTML = '<span style="color:#ff5252;">已拒绝' + (data.remark ? '：' + escapeHtml(data.remark) : '') + '</span>';
                } else {
                    txt.innerHTML = '<span style="color:#f9a825;">待审核</span>';
                }
            } catch (e) { /* 静默 */ }
        }

        (function initProjFileDrag() {
            let curSlug = null;
            let overRow = null;

            document.addEventListener('dragover', (e) => {
                const row = e.target.closest ? e.target.closest('.proj-file-row') : null;
                const inDetail = !!document.querySelector('.detail-files');
                if (!row || !inDetail) {
                    if (overRow) { overRow.classList.remove('drag-over'); overRow = null; }
                    return;
                }
                e.preventDefault();
                if (overRow && overRow !== row) overRow.classList.remove('drag-over');
                row.classList.add('drag-over');
                overRow = row;
            });

            document.addEventListener('dragleave', (e) => {
                if (overRow && !overRow.contains(e.relatedTarget)) {
                    overRow.classList.remove('drag-over');
                    overRow = null;
                }
            });

            document.addEventListener('drop', (e) => {
                const row = e.target.closest ? e.target.closest('.proj-file-row') : null;
                if (overRow) { overRow.classList.remove('drag-over'); overRow = null; }
                if (!row) return;
                e.preventDefault();
                const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (!file) { showToast('无法读取拖入的文件', 'error'); return; }
                // zip 走部署页整体重传；普通文件拖到行上 = 替换该文件
                if (/^\.zip$/i.test(file.name)) { showToast('zip 请到部署页重新上传', 'error'); return; }
                const path = row.getAttribute('data-path');
                const slugEl = document.querySelector('#page-detail .detail-name');
                const m = location.pathname.match(/\/dashboard\/mysite\/(.+)/);
                if (!m) { showToast('无法识别站点', 'error'); return; }
                curSlug = decodeURIComponent(m[1]);
                if (!path) { showToast('无法识别目标文件', 'error'); return; }
                replaceProjectFileByDrag(curSlug, path, file);
            });
        })();

        async function replaceProjectFileByDrag(slug, path, file) {
            const reader = new FileReader();
            reader.onload = async () => {
                const content = String(reader.result).split(',')[1];
                if (!content) { showToast('读取文件失败', 'error'); return; }
                const bytes = Math.ceil((content.length * 3) / 4);
                if (bytes > 200 * 1024) { showToast('文件超过 200KB', 'error'); return; }
                const token = localStorage.getItem('sb_token');
                if (!token) { showToast('请先登录', 'error'); return; }
                try {
                    showToast('正在替换 ' + path + '...');
                    const res = await apiFetch(API_URL + '/api/proj-file/' + encodeURIComponent(slug) + '/' + path.split('/').map(encodeURIComponent).join('/'), {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ content })
                    });
                    const data = await res.json();
                    if (!res.ok) { showToast(data.error || '替换失败', 'error'); return; }
                    showToast('已替换 ' + path);
                    showSiteDetail(slug);
                } catch (e) {
                    showToast('网络错误', 'error');
                }
            };
            reader.onerror = () => showToast('读取文件失败', 'error');
            reader.readAsDataURL(file);
        }

        async function editProjectFile(slug, filePath) {
            const token = localStorage.getItem('sb_token');
            if (!token) { showToast('请先登录', 'error'); return; }
            const modal = document.getElementById('projFileModal');
            document.getElementById('projFileSlug').value = slug;
            document.getElementById('projFilePath').value = filePath;
            document.getElementById('projFileTitle').textContent = filePath;
            document.getElementById('projFileContent').value = '加载中...';
            document.getElementById('projFileSaveBtn').disabled = true;
            modal.classList.add('active');
            try {
                const res = await apiFetch(API_URL + '/api/proj-file/' + encodeURIComponent(slug) + '/' + filePath.split('/').map(encodeURIComponent).join('/'), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) { closeProjFileModal(); showToast(data.error || '读取文件失败', 'error'); return; }
                document.getElementById('projFileContent').value = data.content;
                document.getElementById('projFileSaveBtn').disabled = false;
                const ta = document.getElementById('projFileContent');
                ta.focus();
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
            const filePath = document.getElementById('projFilePath').value;
            const content = document.getElementById('projFileContent').value;
            const token = localStorage.getItem('sb_token');
            if (!token) { showToast('请先登录', 'error'); return; }
            if (content.length > 200 * 1024) { showToast('单文件超过 200KB', 'error'); return; }
            const btn = document.getElementById('projFileSaveBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="infinity-btn"></span> 保存中...';
            try {
                const putRes = await apiFetch(API_URL + '/api/proj-file/' + encodeURIComponent(slug) + '/' + filePath.split('/').map(encodeURIComponent).join('/'), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ content })
                });
                const putData = await putRes.json();
                if (!putRes.ok) { showToast(putData.error || '保存失败', 'error'); return; }
                closeProjFileModal();
                showToast('文件已保存');
                showSiteDetail(slug);
            } catch (e) {
                showToast('网络错误', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> 保存文件';
            }
        }

        async function deleteProjectFile(slug, filePath) {
            const confirmed = await showConfirm('删除文件', `确定删除「${filePath}」吗?此操作不可恢复。`);
            if (!confirmed) return;
            const token = localStorage.getItem('sb_token');
            if (!token) { showToast('请先登录', 'error'); return; }
            try {
                const res = await apiFetch(API_URL + '/api/proj-file/' + encodeURIComponent(slug) + '/' + filePath.split('/').map(encodeURIComponent).join('/'), {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) { showToast(data.error || '删除失败', 'error'); return; }
                showToast('文件已删除');
                showSiteDetail(slug);
            } catch (e) {
                showToast('网络错误', 'error');
            }
        }

        function editSite(slug, siteType) {
            siteType = siteType || (slug.startsWith('md/') ? 'md' : 'html');
            if (siteType === 'project') {
                showToast('多文件网站暂不支持在线编辑，删除后重新上传即可', 'error');
                return;
            }
            document.getElementById('editSlug').value = slug;
            document.getElementById('editType').value = siteType;

            const badge = document.getElementById('edit-type-badge');
            badge.textContent = siteType.toUpperCase();
            badge.className = 'type-tag ' + siteType;

            if (siteType === 'md') {
                document.getElementById('html-editor-panel').style.display = 'none';
                document.getElementById('md-editor-panel').style.display = 'block';
            } else {
                document.getElementById('html-editor-panel').style.display = 'block';
                document.getElementById('md-editor-panel').style.display = 'none';
            }

            document.getElementById('editModal').classList.add('active');

            if (siteType === 'md') {
                showEditMdLoading();
                document.getElementById('editMd').value = '';
                document.getElementById('editMd').style.display = 'block';
                fetchSiteContent(slug);
            } else {
                document.getElementById('editHtml').value = '';
                document.getElementById('editHtml').style.position = 'relative';
                if (!document.getElementById('editLoading')) {
                    const loading = document.createElement('div');
                    loading.id = 'editLoading';
                    loading.innerHTML = '<svg class="infinity-svg" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><path class="infinity-path" d="M 50,50 C 50,20 80,20 100,50 C 120,80 150,80 150,50 C 150,20 120,20 100,50 C 80,80 50,80 50,50 Z" /></svg>';
                    loading.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);border-radius:6px;';
                    document.getElementById('editHtml').parentElement.appendChild(loading);
                } else {
                    document.getElementById('editLoading').style.display = 'flex';
                }
                document.getElementById('editHtml').style.display = 'block';
                fetchSiteContent(slug);
            }
        }

        function showEditMdLoading() {
            const panel = document.getElementById('md-editor-panel');
            if (!panel) return;
            panel.style.position = 'relative';
            let loading = document.getElementById('edit-md-loading');
            if (!loading) {
                loading = document.createElement('div');
                loading.id = 'edit-md-loading';
                loading.innerHTML = '<svg class="infinity-svg" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><path class="infinity-path" d="M 50,50 C 50,20 80,20 100,50 C 120,80 150,80 150,50 C 150,20 120,20 100,50 C 80,80 50,80 50,50 Z" /></svg>';
                loading.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);border-radius:6px;z-index:5;';
                panel.appendChild(loading);
            } else {
                loading.style.display = 'flex';
            }
        }

        function hideEditMdLoading() {
            const loading = document.getElementById('edit-md-loading');
            if (loading) loading.style.display = 'none';
        }

        async function fetchSiteContent(slug) {
            const siteType = document.getElementById('editType').value;
            try {
                const res = await apiFetch(API_URL + '/api/file/' + slug, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();

                if (siteType === 'md') {
                    const md = res.ok ? (data.md || data.html || '') : '加载失败';
                    document.getElementById('editMd').value = md;
                    hideEditMdLoading();
                } else {
                    const html = res.ok ? (data.html || '') : '加载失败';
                    document.getElementById('editHtml').value = html;
                    const editLoading = document.getElementById('editLoading');
                    if (editLoading) editLoading.style.display = 'none';
                }
            } catch {
                if (siteType === 'md') {
                    const content = '加载失败';
                    document.getElementById('editMd').value = content;
                    hideEditMdLoading();
                } else {
                    const content = '加载失败';
                    document.getElementById('editHtml').value = content;
                    const editLoading = document.getElementById('editLoading');
                    if (editLoading) editLoading.style.display = 'none';
                }
            }
        }

        function closeModal() {
            document.getElementById('editModal').classList.remove('active');
            const editMd = document.getElementById('editMd');
            if (editMd) editMd.value = '';
            hideEditMdLoading();
        }

        async function updateSite() {
            const slug = document.getElementById('editSlug').value;
            const siteType = document.getElementById('editType').value;
            let html, md;

            if (siteType === 'md') {
                md = document.getElementById('editMd').value;
            } else {
                html = document.getElementById('editHtml').value;
            }

            try {
                const body = { slug };
                if (md !== undefined) body.md = md;
                if (html !== undefined) body.html = html;
                const res = await apiFetch(API_URL + '/api/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(body)
                });
                let data;
                try { data = await res.json(); } catch { data = {}; }
                if (res.ok && data.success) {
                    showToast('保存成功!');
                    closeModal();
                    const item = document.querySelector(`.site-item[data-slug="${slug}"]`);
                    if (item) {
                        item.style.transition = 'background 0.3s';
                        item.style.background = 'rgba(2, 255, 142, 0.15)';
                        setTimeout(() => {
                            item.style.background = '';
                        }, 600);
                    }
                } else {
                    showToast(data.error || '保存失败', 'error');
                }
            } catch (e) {
                showToast(e.message === '请求超时' ? '请求超时，请重试' : '网络错误', 'error');
            }
        }

        let _confirmResolve = null;

        function showConfirm(title, message) {
            return new Promise(resolve => {
                _confirmResolve = resolve;
                document.getElementById('confirmTitle').textContent = title;
                document.getElementById('confirmMessage').textContent = message;
                document.getElementById('confirmOverlay').classList.add('active');
            });
        }

        function closeConfirm() {
            document.getElementById('confirmOverlay').classList.remove('active');
            if (_confirmResolve) _confirmResolve(false);
            _confirmResolve = null;
        }

        function doConfirm() {
            document.getElementById('confirmOverlay').classList.remove('active');
            if (_confirmResolve) _confirmResolve(true);
            _confirmResolve = null;
        }

        async function confirmDelete(slug) {
            const confirmed = await showConfirm(
                '删除网站',
                `确定删除「${slug}」吗?此操作不可恢复。`
            );
            if (!confirmed) return;

            const item = document.querySelector(`.site-item[data-slug="${slug}"]`);
            if (item) {
                item.style.transition = 'opacity 0.3s, transform 0.3s';
                item.style.opacity = '0';
                item.style.transform = 'translateX(-20px)';
            }

            try {
                const res = await apiFetch(API_URL + '/api/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ slug })
                });
                let data;
                try { data = await res.json(); } catch { data = {}; }
                if (res.ok && data.success) {
                    showToast('删除成功');
                    if (item) {
                        setTimeout(() => item.remove(), 300);
                    } else {
                        loadSites();
                    }
                    if (window.allSites) {
                        window.allSites = window.allSites.filter(s => s.name !== slug);
                        document.getElementById('stat-sites').textContent = window.allSites.length;
                        if (window.allSites.length > 0) {
                            window.allSites.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
                            document.getElementById('stat-latest').textContent = formatTime(new Date(window.allSites[0].updated_at));
                        } else {
                            document.getElementById('stat-latest').textContent = '-';
                        }
                    }
                } else {
                    showToast(data.error || '删除失败', 'error');
                    if (item) {
                        item.style.opacity = '1';
                        item.style.transform = '';
                    }
                }
            } catch (e) {
                showToast(e.message === '请求超时' ? '请求超时，请重试' : '网络错误', 'error');
                if (item) {
                    item.style.opacity = '1';
                    item.style.transform = '';
                }
            }
        }

        function formatDate(d) {
            return new Date(d).toLocaleDateString('zh-CN');
        }

        function formatTime(d) {
            if (typeof d === 'string') d = new Date(d);
            const diff = new Date().getTime() - d.getTime();
            if (diff < 60000) return '刚刚';
            if (diff < 3600000) return Math.floor(diff/60000) + '分钟前';
            if (diff < 86400000) return Math.floor(diff/3600000) + '小时前';
            return d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
        }

        function createRipple(event) {
            const button = event.currentTarget;
            const rect = button.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = event.clientX - rect.left - size / 2;
            const y = event.clientY - rect.top - size / 2;

            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';

            button.appendChild(ripple);
            ripple.addEventListener('animationend', () => ripple.remove());
        }

        document.addEventListener('click', function(e) {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                const btn = e.target.tagName === 'BUTTON' ? e.target : e.target.closest('button');
                if (!btn.classList.contains('no-ripple')) {
                    createRipple({ currentTarget: btn });
                }
            }
            if (e.target.classList.contains('nav-item') || e.target.closest('.nav-item')) {
                const nav = e.target.classList.contains('nav-item') ? e.target : e.target.closest('.nav-item');
                if (!nav.classList.contains('no-ripple')) {
                    createRipple({ currentTarget: nav });
                }
            }
        });

        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                const projFileModal = document.getElementById('projFileModal');
                if (projFileModal && projFileModal.classList.contains('active')) {
                    closeProjFileModal();
                    return;
                }
                const editModal = document.getElementById('editModal');
                if (!editModal || !editModal.classList.contains('active')) return;
                const active = document.activeElement;
                const inEdit = active && (
                    editModal.contains(active)
                );
                if (inEdit) updateSite();
            }
        });

        // ===== 打字机 =====
        function typeWriter(el, text, speed = 55) {
            return new Promise(resolve => {
                el.textContent = '';
                el.classList.add('typing');
                let i = 0;
                const timer = setInterval(() => {
                    el.textContent = text.slice(0, i + 1);
                    i++;
                    if (i >= text.length) {
                        clearInterval(timer);
                        el.classList.remove('typing');
                        resolve();
                    }
                }, speed);
            });
        }
        function welcomeTypewriter(el, nick) {
            return new Promise(resolve => {
                el.textContent = '';
                el.classList.add('typing');
                const parts = nick
                    ? [{ t: 'Hi！', cls: '' }, { t: nick, cls: 'accent' }, { t: '，欢迎回来。', cls: '' }]
                    : [{ t: 'Hi！欢迎回来。', cls: '' }];
                let pi = 0, ci = 0;
                let currentSpan = document.createElement('span');
                el.appendChild(currentSpan);
                function step() {
                    if (pi >= parts.length) {
                        el.classList.remove('typing');
                        resolve();
                        return;
                    }
                    const part = parts[pi];
                    if (ci === 0 && part.cls) currentSpan.className = part.cls;
                    if (ci < part.t.length) {
                        currentSpan.textContent += part.t.charAt(ci++);
                        setTimeout(step, 55);
                    } else {
                        pi++;
                        ci = 0;
                        if (pi < parts.length) {
                            currentSpan = document.createElement('span');
                            el.appendChild(currentSpan);
                        }
                        step();
                    }
                }
                step();
            });
        }
        function getTwTargets(pageId) {
            const page = document.getElementById('page-' + pageId);
            if (!page) return [];
            return Array.from(page.querySelectorAll('.tw-target'));
        }
        function runPageTypewriter(pageId) {
            const targets = getTwTargets(pageId);
            if (!targets.length) return;
            let chain = Promise.resolve();
            targets.forEach(el => {
                const text = el.getAttribute('data-tw') || el.textContent;
                chain = chain.then(() => typeWriter(el, text, 55));
            });
        }

        setTimeout(() => {
            const splash = document.getElementById('splashScreen');
            if (splash) splash.remove();
            document.body.classList.remove('splash-active');

            const welcome = document.getElementById('welcomeScreen');
            const welcomeText = document.getElementById('welcomeText');
            let showWelcome = true;
            try {
                const p = JSON.parse(localStorage.getItem('preferences') || '{}');
                showWelcome = p.showWelcome !== false;
            } catch (e) {}

            if (welcome && welcomeText && showWelcome) {
                getTwTargets('overview').forEach(el => { el.textContent = ''; });

                const nickEl = document.getElementById('account-nickname');
                const nick = (nickEl && nickEl.textContent && nickEl.textContent !== '未设置') ? nickEl.textContent : '';

                welcome.classList.add('show');
                welcomeTypewriter(welcomeText, nick).then(() => {
                    setTimeout(() => {
                        welcome.classList.remove('show');
                        welcome.classList.add('hide');
                        setTimeout(() => {
                            welcome.remove();
                            runPageTypewriter('overview');
                        }, 700);
                    }, 1900);
                });
            } else {
                if (welcome) welcome.remove();
                runPageTypewriter('overview');
            }
            window.__splashDone = true;
        }, 3300);

        loadSites();

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(function() {});
        }
