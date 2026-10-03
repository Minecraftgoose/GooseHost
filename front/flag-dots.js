/* 国旗点阵 —— 复用 .bg-layer 的 8px 点位，在屏幕中央拼出五星红旗 */
(function () {
    var canvas = document.getElementById('flagDots');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* ---- 与 CSS 点阵严格对齐 ---- */
    var STEP  = 8;        // 必须等于 .bg-layer 的 background-size
    var CX    = STEP / 2; // 点圆心在格子内的偏移
    var CY    = STEP / 2;
    var DOT_R = STEP * 0.18;

    var RED    = 'rgba(226, 42, 34, 0.95)';
    var YELLOW = 'rgba(255, 222, 74, 1)';
    var TAU    = 6.283185307179586;
    var K      = 0.3819660112501051;  // 五角星 内半径/外半径

    /* ---- 五角星多边形 ---- */
    function star(cx, cy, R, rot) {
        var pts = [];
        for (var i = 0; i < 10; i++) {
            var rad = (i % 2) ? R * K : R;
            var a = rot - Math.PI / 2 + i * Math.PI / 5;
            pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
        }
        return pts;
    }

    /* ---- 射线法：点在多边形内？ ---- */
    function inPoly(px, py, poly) {
        var hit = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var xi = poly[i][0], yi = poly[i][1];
            var xj = poly[j][0], yj = poly[j][1];
            if (((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) hit = !hit;
        }
        return hit;
    }

    /* ---- 标准 30×20 网格上的星位 ---- */
    var BIG = { x: 5, y: 5, r: 3 };
    var SMALL = [
        { x: 10, y: 2 }, { x: 12, y: 4 },
        { x: 12, y: 7 }, { x: 10, y: 9 }
    ];

    var bigStar = star(BIG.x, BIG.y, BIG.r, 0);
    var smallStars = SMALL.map(function (s) {
        var rot = Math.atan2(BIG.y - s.y, BIG.x - s.x) + Math.PI / 2;
        return star(s.x, s.y, 1, rot);
    });

    function isStarDot(fx, fy) {
        var dx = fx - BIG.x, dy = fy - BIG.y;
        if (dx * dx + dy * dy <= 9.5 && inPoly(fx, fy, bigStar)) return true;
        for (var i = 0; i < 4; i++) {
            var s = SMALL[i];
            dx = fx - s.x; dy = fy - s.y;
            if (dx * dx + dy * dy <= 1.35 && inPoly(fx, fy, smallStars[i])) return true;
        }
        return false;
    }

    /* ---- 收集旗面内的点 ---- */
    var pts = [];            // [x, y, isYellow, ...]
    var lastW = 0, lastH = 0;

    function build(cw, ch) {
        pts.length = 0;

        // 旗帜 3:2，居中，不超出视口
        var u  = Math.min(cw * 0.86 / 30, ch * 0.72 / 20);
        var W  = 30 * u;
        var H  = 20 * u;
        var ox = (cw - W) / 2;
        var oy = (ch - H) / 2;

        var maxJ = Math.ceil(ch / STEP);
        var maxI = Math.ceil(cw / STEP);

        for (var j = 0; j <= maxJ; j++) {
            var y = j * STEP + CY;
            if (y < oy) continue;
            if (y > oy + H) break;
            for (var i = 0; i <= maxI; i++) {
                var x = i * STEP + CX;
                if (x < ox) continue;
                if (x > ox + W) break;
                var fx = (x - ox) / u;
                var fy = (y - oy) / u;
                pts.push(x, y, isStarDot(fx, fy) ? 1 : 0);
            }
        }

        lastW = cw;
        lastH = ch;
    }

    function draw() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var cw = window.innerWidth;
        var ch = window.innerHeight;

        if (cw !== lastW || ch !== lastH) {
            canvas.width  = Math.round(cw * dpr);
            canvas.height = Math.round(ch * dpr);
            canvas.style.width  = cw + 'px';
            canvas.style.height = ch + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            build(cw, ch);
        }

        ctx.clearRect(0, 0, cw, ch);

        // 红底
        ctx.fillStyle = RED;
        ctx.beginPath();
        for (var i = 0; i < pts.length; i += 3) {
            if (pts[i + 2] === 1) continue;
            ctx.moveTo(pts[i] + DOT_R, pts[i + 1]);
            ctx.arc(pts[i], pts[i + 1], DOT_R, 0, TAU);
        }
        ctx.fill();

        // 黄星
        ctx.fillStyle = YELLOW;
        ctx.beginPath();
        for (var j = 0; j < pts.length; j += 3) {
            if (pts[j + 2] === 0) continue;
            ctx.moveTo(pts[j] + DOT_R, pts[j + 1]);
            ctx.arc(pts[j], pts[j + 1], DOT_R, 0, TAU);
        }
        ctx.fill();
    }

    /* ---- resize 节流 ---- */
    var timer = null;
    window.addEventListener('resize', function () {
        clearTimeout(timer);
        timer = setTimeout(draw, 120);
    });
    window.addEventListener('orientationchange', function () {
        clearTimeout(timer);
        timer = setTimeout(draw, 200);
    });

    draw();

    /* ---- 出场时机：等开屏结束 + 背景点阵淡入后，再显示国旗 ---- */
    (function show() {
        var hasSplash = !!document.getElementById('splashScreen');
        var done = false;
        function on() {
            if (done) return;
            done = true;
            canvas.classList.add('on');
        }

        // 背景层是否就绪（有的页面 bg-layer 默认 opacity:1，不走 .loaded）
        function bgReady() {
            var bg = document.getElementById('bgLayer');
            if (!bg) return true;
            if (bg.classList.contains('loaded')) return true;
            try { return window.getComputedStyle(bg).opacity !== '0'; } catch (e) { return true; }
        }

        if (!hasSplash && bgReady()) {
            requestAnimationFrame(on);
        } else {
            var t0 = Date.now();
            (function wait() {
                var splashGone = !document.getElementById('splashScreen');
                if ((splashGone && bgReady()) || Date.now() - t0 > 2500) {
                    setTimeout(on, 150);
                    return;
                }
                setTimeout(wait, 150);
            })();
        }
    })();

    /* ---- 用户偏好减少动效时，直接显示 ---- */
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        canvas.classList.add('on');
    }
})();
