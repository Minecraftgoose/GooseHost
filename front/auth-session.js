/* =====================================================================
 * GooseHost 会话与鉴权（全站共享）
 * =====================================================================
 *
 * 为什么要抽成共享模块
 * --------------------
 * 下面这套「刷新 access_token」的逻辑原本在 dashboard/app.js 和
 * admin/app.js 里各有一份几乎逐字相同的副本。一旦有 bug，两边同时中招，
 * 修的时候又极易只改一边。这里收敛成一份，两个页面都引用它。
 *
 * 修复的问题
 * ----------
 * Supabase（GoTrue）默认开启 **Refresh Token Rotation**：
 * refresh_token 是一次性的，换新之后旧的立刻作废，
 * 仅对「同一个 rt 在约 10 秒内被重复使用」给一点宽容（reuse interval）。
 *
 * 旧实现里每个请求各自判断「token 快过期了」就各自去 refresh，
 * 于是：
 *   - 同一页面并发发多个请求 → 并发多次 refresh
 *   - 开两个标签页 → 两个页面各自 refresh
 * 只要间隔超过那 10 秒宽限，除第一个之外全部拿到
 * 400 invalid_grant，旧代码随即执行
 *      localStorage.removeItem('sb_refresh_token')
 * 把凭证删掉 —— 会话从此不可恢复，表现就是「用着用着突然掉线」，
 * 而且时好时坏（取决于是否赌中那 10 秒）。
 *
 * 本模块的三层防护
 * ----------------
 *   1. 页面内 single-flight：并发调用共享同一个 Promise，只发一次网络请求。
 *   2. 跨标签页协调：localStorage 锁 + BroadcastChannel，
 *      让多个标签页排队而不是互相作废。
 *   3. 失败分类：网络抖动 / 限流 **不清空凭证**（可重试）；
 *      只有确认 refresh_token 真的失效才登出。
 *
 * 用法
 * ----
 *   GHAuth.setApiUrl(API_URL);        // 可选，默认 https://page.goose.cc.cd
 *   await GHAuth.apiFetch(url, opts); // 替代裸 fetch，自动带令牌与续期
 *   GHAuth.logout('/login/');         // 清理 + 广播 + 跳转
 * ===================================================================== */

(function (global) {
    'use strict';

    var DEFAULT_API = 'https://page.goose.cc.cd';

    // 令牌剩余有效期低于此值时提前续期（5 分钟）
    var REFRESH_SKEW = 5 * 60 * 1000;
    // 单次 refresh 的网络超时
    var REFRESH_TIMEOUT = 15000;
    // 网络类失败的最大尝试次数（指数退避）
    var MAX_ATTEMPTS = 3;
    // 失败冷却：短时间内不重复冲击 refresh 接口（负缓存）,
    // 避免「提前刷新失败」+「401 后再刷新」两条路径各重试一轮造成放大
    var FAILURE_COOLDOWN = 5000;
    // 跨标签页锁：键名与存活时间（持有者崩溃时允许被抢占）
    var LOCK_KEY = 'gh_refresh_lock';
    var LOCK_TTL = 20000;
    // 等待其他标签页刷新完成的超时
    var WAIT_OTHER = 9000;

    var CHANNEL = 'gh-auth';
    var bc = null;
    try {
        if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(CHANNEL);
    } catch (e) { bc = null; }

    var apiUrl = DEFAULT_API;
    function setApiUrl(u) { if (u) apiUrl = String(u); }
    function resolveApi() {
        var u = global.API_URL || apiUrl || DEFAULT_API;
        return String(u).replace(/\/+$/, '');
    }

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    /* ---------------------------------------------------------------
     * 令牌解析
     * --------------------------------------------------------------- */

    function jwtExpiry(token) {
        try {
            var parts = String(token).split('.');
            if (parts.length !== 3) return null;
            var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            var pad = '='.repeat((4 - (b64.length % 4)) % 4);
            var binary = atob(b64 + pad);
            var payload = JSON.parse(
                new TextDecoder().decode(new Uint8Array([].map.call(binary, function (c) { return c.charCodeAt(0); })))
            );
            return payload.exp ? payload.exp * 1000 : null;
        } catch (e) { return null; }
    }

    function currentToken() {
        try { return localStorage.getItem('sb_token'); } catch (e) { return null; }
    }

    /** 令牌是否还足够「新鲜」（余量 > 60 秒），够新鲜就不必刷新 */
    function isTokenFresh() {
        var t = currentToken();
        var exp = t ? jwtExpiry(t) : null;
        return !!(t && exp && (exp - Date.now() > 60 * 1000));
    }

    /* ---------------------------------------------------------------
     * 跨标签页协调
     * --------------------------------------------------------------- */

    /**
     * 抢占刷新锁。
     * localStorage 没有原子 CAS，这里用「写入后立即读回比对 nonce」近似实现：
     * 读回来的仍是自己写入的值，才算抢到。
     * @returns {string|null} 抢到返回 nonce，否则 null
     */
    function acquireLock() {
        try {
            var existing = localStorage.getItem(LOCK_KEY);
            if (existing) {
                var held = JSON.parse(existing);
                // 别人持有且未过期（TTL 内）→ 让给对方
                if (held && held.at && (Date.now() - held.at) < LOCK_TTL) return null;
            }
            var nonce = Math.random().toString(36).slice(2) + '-' + Date.now();
            localStorage.setItem(LOCK_KEY, JSON.stringify({ nonce: nonce, at: Date.now() }));
            var back = localStorage.getItem(LOCK_KEY);
            if (!back) return null;
            var parsed = JSON.parse(back);
            return (parsed && parsed.nonce === nonce) ? nonce : null;
        } catch (e) { return null; }
    }

    function releaseLock(nonce) {
        if (!nonce) return;
        try {
            var cur = localStorage.getItem(LOCK_KEY);
            if (!cur) return;
            var l = JSON.parse(cur);
            if (l && l.nonce === nonce) localStorage.removeItem(LOCK_KEY);
        } catch (e) { /* 清理失败无妨，锁有 TTL 会自动过期 */ }
    }

    function publish(type) {
        try { if (bc) bc.postMessage({ type: type, ts: Date.now() }); } catch (e) {}
    }

    /**
     * 等待「别的标签页」完成刷新。
     * 通过 BroadcastChannel 通知或 storage 事件感知，二者任一命中即结束。
     */
    function waitForOtherRefresh() {
        return new Promise(function (resolve) {
            var done = false;
            function finish(ok) {
                if (done) return;
                done = true;
                cleanup();
                resolve(ok);
            }
            var timer = setTimeout(function () { finish(false); }, WAIT_OTHER);

            function onMsg(e) {
                if (e && e.data && e.data.type === 'refreshed') finish(true);
            }
            function onStorage(e) {
                // 其他标签页写入了新令牌
                if (e && e.key === 'sb_token' && e.newValue) finish(true);
            }
            function cleanup() {
                clearTimeout(timer);
                if (bc) { try { bc.removeEventListener('message', onMsg); } catch (e) {} }
                global.removeEventListener('storage', onStorage);
            }

            if (bc) { try { bc.addEventListener('message', onMsg); } catch (e) {} }
            global.addEventListener('storage', onStorage);

            // 有可能在我们挂监听之前对方就已经刷好了
            if (isTokenFresh()) finish(true);
        });
    }

    /* ---------------------------------------------------------------
     * 单次刷新
     * --------------------------------------------------------------- */

    /**
     * 发起一次 refresh，并对结果做分类。
     * @returns {{ok:boolean, fatal:boolean}}
     *   ok=true           刷新成功
     *   ok=false,fatal=true  凭证确认失效（refresh_token 作废/被吊销）→ 必须登出
     *   ok=false,fatal=false 网络抖动 / 限流 / 服务端错误 → 不清空凭证，可重试
     */
    async function refreshOnce() {
        var rt;
        try { rt = localStorage.getItem('sb_refresh_token'); } catch (e) { rt = null; }
        if (!rt) return { ok: false, fatal: true };

        var res, data;
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, REFRESH_TIMEOUT);
        try {
            res = await fetch(resolveApi() + '/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: rt }),
                signal: controller.signal
            });
            data = await res.json().catch(function () { return {}; });
        } catch (e) {
            // 网络错误 / 超时 / JSON 解析失败：一律视为可重试
            return { ok: false, fatal: false };
        } finally {
            clearTimeout(timer);
        }

        if (res.ok && data && data.access_token) {
            try {
                localStorage.setItem('sb_token', data.access_token);
                if (data.refresh_token) localStorage.setItem('sb_refresh_token', data.refresh_token);
                if (data.user) localStorage.setItem('sb_user', JSON.stringify(data.user));
            } catch (e) {}
            publish('refreshed');
            return { ok: true, fatal: false };
        }

        var status = res.status;
        var msg = String((data && (data.error || data.error_description || data.msg)) || '').toLowerCase();

        // 4xx（除 429）: refresh_token 已作废 → 真正的失效
        if (status === 429) return { ok: false, fatal: false };          // 限流，稍后重试
        if (status >= 500) return { ok: false, fatal: false };           // 服务端故障，可重试
        if (status === 400 || status === 401 || status === 403) {
            // Supabase 典型返回：invalid_grant / refresh_token_not_found
            return { ok: false, fatal: true };
        }
        // 其余异常状态（如 422）：视消息内容判断，拿不准就当可重试
        if (msg.indexOf('invalid_grant') >= 0 || msg.indexOf('refresh_token_not_found') >= 0) {
            return { ok: false, fatal: true };
        }
        return { ok: false, fatal: false };
    }

    /* ---------------------------------------------------------------
     * 对外的续期入口（带 single-flight 与跨页协调）
     * --------------------------------------------------------------- */

    var inflight = null;
    var lastFailure = { at: 0, result: null };

    /**
     * 确保令牌有效。
     * @param {boolean} force  true = 强制刷新（用于收到 401 之后）
     * @returns {{ok:boolean, fatal:boolean}}
     */
    function ensureFresh(force) {
        if (!force && isTokenFresh()) return Promise.resolve({ ok: true, fatal: false });
        if (inflight) return inflight;   // ← 页面内 single-flight：并发调用合流

        // 刚失败过：直接复用上次结果，避免同一轮里反复冲击 refresh 接口
        if (lastFailure.result && (Date.now() - lastFailure.at) < FAILURE_COOLDOWN) {
            return Promise.resolve(lastFailure.result);
        }

        inflight = (async function () {
            var nonce = null;
            try {
                nonce = acquireLock();
                if (!nonce) {
                    // 别的标签页正在刷新：等它的结果，不要自己也去刷新
                    var otherOk = await waitForOtherRefresh();
                    if (otherOk && isTokenFresh()) return { ok: true, fatal: false };
                    nonce = acquireLock();          // 对方可能已超时/崩了，再抢一次
                    if (!nonce) return { ok: false, fatal: false };
                }

                var last = { ok: false, fatal: false };
                for (var i = 0; i < MAX_ATTEMPTS; i++) {
                    last = await refreshOnce();
                    if (last.ok) {
                        lastFailure = { at: 0, result: null };   // 成功则清空负缓存
                        return { ok: true, fatal: false };
                    }
                    if (last.fatal) break;                       // 凭证作废，重试无意义
                    if (i < MAX_ATTEMPTS - 1) await sleep(400 * (i + 1));  // 退避
                }
                lastFailure = { at: Date.now(), result: last };
                return last;
            } finally {
                releaseLock(nonce);
                inflight = null;
            }
        })();

        return inflight;
    }

    /* ---------------------------------------------------------------
     * 会话清理 / 登出
     * --------------------------------------------------------------- */

    function clearSession() {
        lastFailure = { at: 0, result: null };
        try {
            localStorage.removeItem('sb_token');
            localStorage.removeItem('sb_user');
            localStorage.removeItem('sb_refresh_token');
            localStorage.removeItem(LOCK_KEY);
        } catch (e) {}
        publish('logout');
    }

    /**
     * 登出并跳转。
     * @param {string} [redirect] 跳转地址，留空则不跳转（仅清理）
     */
    function logout(redirect) {
        clearSession();
        if (redirect) {
            try { location.href = redirect; } catch (e) {}
        }
    }

    // 其他标签页登出时，本页同步清理，避免出现「一个页掉了、另一个页还以为登录着」
    function onMsg(e) {
        if (e && e.data && e.data.type === 'logout' && !global.__ghLoggingOut) {
            global.__ghLoggingOut = true;
            clearSession();
            try { location.href = '/login/'; } catch (err) {}
        }
    }
    if (bc) { try { bc.addEventListener('message', onMsg); } catch (e) {} }

    /* ---------------------------------------------------------------
     * apiFetch：替代裸 fetch
     * --------------------------------------------------------------- */

    /**
     * 带鉴权的 fetch，自动续期与 401 重试。
     * 401 之后只有在「凭证确认失效」时才清空并跳转登录；
     * 网络问题导致的失败会抛错交给上层提示，不会误踢用户。
     */
    async function apiFetch(url, options) {
        options = options || {};

        // 临近过期就提前续期
        var t = currentToken();
        var exp = t ? jwtExpiry(t) : null;
        if (t && exp && (exp - Date.now() < REFRESH_SKEW)) {
            var pre = await ensureFresh(false);
            // 已确认凭证作废：直接登出，不必再发一次注定 401 的业务请求
            if (!pre.ok && pre.fatal) {
                logout('/login/');
                throw new Error('Unauthorized');
            }
        }

        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 15000);
        try {
            var res = await fetchWithAuth(url, options, controller.signal);

            if (res.status === 401) {
                var r = await ensureFresh(true);
                if (r.ok) {
                    // 换新令牌后重试一次
                    var c2 = new AbortController();
                    var t2 = setTimeout(function () { c2.abort(); }, 15000);
                    try {
                        res = await fetchWithAuth(url, options, c2.signal);
                    } finally {
                        clearTimeout(t2);
                    }
                } else if (r.fatal) {
                    // 确认失效：清凭证并跳登录
                    logout('/login/');
                    throw new Error('Unauthorized');
                }
                // r.fatal=false 属网络问题，继续往下走，由 401 分支统一处理
            }

            if (res.status === 401) {
                // 到这里说明刷新没成功但不是确认失效（网络/限流），
                // 不清凭证，交给上层提示「网络异常，请重试」
                var err = new Error('Unauthorized');
                err.transient = true;
                throw err;
            }
            return res;
        } catch (e) {
            if (e && e.name === 'AbortError') throw new Error('请求超时');
            throw e;
        } finally {
            clearTimeout(timer);
        }
    }

    function fetchWithAuth(url, options, signal) {
        var hdr = new Headers(options.headers || {});
        var latest = currentToken();
        if (latest) hdr.set('Authorization', 'Bearer ' + latest);
        return fetch(url, Object.assign({}, options, { headers: hdr, signal: signal }));
    }

    global.GHAuth = {
        setApiUrl: setApiUrl,
        jwtExpiry: jwtExpiry,
        isTokenFresh: isTokenFresh,
        ensureFresh: ensureFresh,
        refreshSession: ensureFresh,   // 兼容旧调用名
        apiFetch: apiFetch,
        clearSession: clearSession,
        logout: logout
    };
})(window);
