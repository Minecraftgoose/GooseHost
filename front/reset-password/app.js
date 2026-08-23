        const API_URL_FALLBACK = 'https://page.goose.gs.cn';
        let API_URL = API_URL_FALLBACK;

        fetch(API_URL_FALLBACK + '/api/config')
            .then(r => r.json())
            .then(d => { if (d && d.apiUrl) API_URL = d.apiUrl; })
            .catch(() => {});

        function getToken() {
            const params = new URLSearchParams(location.hash.slice(1));
            return params.get('access_token');
        }
        function showMsg(msg, type) {
            const el = document.getElementById('msg');
            el.textContent = msg;
            el.className = 'msg ' + type;
        }

        window.addEventListener('load', () => {
            if (!getToken()) {
                showMsg('重置链接无效或已过期，请重新申请', 'error');
                document.getElementById('submitBtn').disabled = true;
            }
        });

        async function submitReset() {
            const token = getToken();
            const password = document.getElementById('password').value;
            const confirm = document.getElementById('confirm').value;
            const btn = document.getElementById('submitBtn');

            if (!token) { showMsg('重置链接无效，请重新申请', 'error'); return; }
            if (password.length < 6) { showMsg('密码至少 6 位', 'error'); return; }
            if (password !== confirm) { showMsg('两次密码不一致', 'error'); return; }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提交中...';
            try {
                const res = await fetch(API_URL + '/api/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '重置失败');
                document.getElementById('formBox').style.display = 'none';
                document.getElementById('doneBox').style.display = 'block';
                setTimeout(() => location.href = '../login/', 2200);
            } catch (err) {
                showMsg(err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> 重置密码';
            }
        }
