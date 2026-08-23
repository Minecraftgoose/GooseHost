        const API_URL = 'https://page.goose.gs.cn';

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

        function showMsg(msg, type = 'error') {
            const el = document.getElementById('msg');
            el.textContent = msg;
            el.className = 'msg ' + type;
        }

        const BLOCKED_EMAIL_DOMAINS = [
            'text.com', 'tempmail.com', 'guerrillamail.com', 'mailinator.com',
            'throwaway.email', 'temp-mail.org', 'fakeinbox.com', 'trashmail.com',
            'mailnesia.com', 'tempr.email', 'dispostable.com', 'maildrop.cc',
            'getnada.com', 'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com',
            'pokemail.net', 'spam4.me', 'grr.la', 'mailcatch.com',
            '10minutemail.com', '10minutemail.net', '20minutemail.com',
            'mailforspam.com', 'incognitomail.com', 'incognitomail.net',
            'tempail.com', 'tempmailaddress.com', 'fakemailgenerator.com',
            'emailondeck.com', 'mintemail.com', 'getairmail.com',
        ];

        function validateEmail(email) {
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不正确';
            const domain = email.split('@')[1].toLowerCase();
            if (BLOCKED_EMAIL_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) {
                return '暂不支持该邮箱域名，请使用真实邮箱';
            }
            return null;
        }

        async function register(e) {
            e.preventDefault();
            const nickname = document.getElementById('nickname').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const btn = document.getElementById('registerBtn');

            if (!nickname) { showMsg('请填写昵称', 'error'); return; }
            if (nickname.length < 2 || nickname.length > 20) { showMsg('昵称长度需为 2-20 个字符', 'error'); return; }
            if (!/^[一-龥a-zA-Z0-9_ \-]+$/.test(nickname)) { showMsg('昵称仅支持中英文、数字、下划线、空格和连字符', 'error'); return; }
            const emailError = validateEmail(email);
            if (emailError) { showMsg(emailError, 'error'); return; }
            if (password !== confirmPassword) { showMsg('两次密码不一致', 'error'); return; }
            if (password.length < 6) { showMsg('密码至少 6 位', 'error'); return; }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 注册中...';

            try {
                const res = await fetch(API_URL + '/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, nickname })
                });
                const data = await res.json();
                if (res.ok) {
                    showMsg('注册成功！请查收验证邮件', 'success');
                    setTimeout(() => location.href = '../login/', 2000);
                } else {
                    showMsg(data.msg || '注册失败', 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-user-plus"></i> 注册';
                }
            } catch (e) {
                showMsg('网络错误', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-user-plus"></i> 注册';
            }
        }
