        const API_URL_FALLBACK = 'https://page.goose.gs.cn';
        let API_URL = API_URL_FALLBACK;

        fetch(API_URL_FALLBACK + '/api/config')
            .then(r => r.json())
            .then(d => {
                if (d && d.apiUrl) { 
                    window.API_URL = d.apiUrl;
                    API_URL = d.apiUrl; 
                }
            })
            .catch(() => {});

        function setBingWallpaper() {
            const bgLayer = document.getElementById('bgLayer');
            const wallpaperUrl = `https://api.fuchenboke.cn/api/fengjing.php?t=${Date.now()}`;
            const img = new Image();
            img.onload = () => {
                bgLayer.style.backgroundImage = `url('${wallpaperUrl}')`;
                bgLayer.classList.add('loaded');
            };
            img.onerror = () => bgLayer.classList.add('loaded');
            img.src = wallpaperUrl;
        }
        setBingWallpaper();

        if (localStorage.getItem('sb_token')) {
            location.href = '/dashboard';
        }

        (function() {
            var hash = window.location.hash;
            if (hash) {
                var params = new URLSearchParams(hash.slice(1));
                var token = params.get('access_token');
                var refresh = params.get('refresh_token');
                var type = params.get('type');
                if (token && type === 'signup') {
                    history.replaceState(null, '', window.location.pathname);
                    showMsg('邮箱已验证成功！', 'success');
                    localStorage.setItem('sb_token', token);
                    if (refresh) localStorage.setItem('sb_refresh_token', refresh);
                    fetch((window.API_URL || API_URL) + '/api/me', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    })
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        if (d && d.email) {
                            localStorage.setItem('sb_user', JSON.stringify({
                                email: d.email,
                                raw_user_meta_data: { nickname: d.nickname || '' }
                            }));
                        }
                    })
                    .catch(function () {})
                    .finally(function () {
                        setTimeout(function() { location.href = '/dashboard'; }, 1500);
                    });
                }
            }
        })();

        function showMsg(msg, type) {
            const el = document.getElementById('msg');
            el.textContent = msg;
            el.className = 'msg ' + type;
        }

        async function login() {
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const btn = document.getElementById('loginBtn');

            if (!email || !password) {
                showMsg('请填写邮箱和密码', 'error');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中...';

            try {
                const res = await fetch(API_URL + '/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error_description || data.msg || '登录失败');
                }

                localStorage.setItem('sb_token', data.access_token);
                localStorage.setItem('sb_user', JSON.stringify(data.user));
                if (data.refresh_token) localStorage.setItem('sb_refresh_token', data.refresh_token);

                showMsg('登录成功！', 'success');
                setTimeout(() => location.href = '/dashboard', 600);
            } catch (err) {
                showMsg(err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> 登录';
            }
        }

        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
        function showForgot() {
            document.getElementById('forgotModal').style.display = 'flex';
            document.getElementById('forgotEmail').focus();
        }
        function hideForgot() {
            document.getElementById('forgotModal').style.display = 'none';
            document.getElementById('forgotMsg').className = 'msg';
        }
        function showForgotMsg(msg, type) {
            const el = document.getElementById('forgotMsg');
            el.textContent = msg;
            el.className = 'msg ' + type;
        }
        async function submitForgot() {
            const email = document.getElementById('forgotEmail').value.trim();
            const btn = document.getElementById('forgotBtn');
            if (!email) { showForgotMsg('请输入邮箱', 'error'); return; }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 发送中...';
            try {
                const res = await fetch(API_URL + '/api/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '发送失败');
                showForgotMsg(data.message || '重置邮件已发送，请查收', 'success');
                btn.innerHTML = '<i class="fas fa-check"></i> 已发送';
                setTimeout(hideForgot, 2600);
            } catch (err) {
                showForgotMsg(err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> 发送重置邮件';
            }
        }
