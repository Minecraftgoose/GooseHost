const SQUIRCLE_CDN = 'https://esm.sh/figma-squircle@1.1.0';

let getSvgPath;
try {
    ({ getSvgPath } = await import(/* @vite-ignore */ SQUIRCLE_CDN));
} catch (e) {
    console.warn('[squircle] figma-squircle 加载失败，保持原有圆角：', e && e.message);
}
if (typeof getSvgPath === 'function') {
    const SMOOTHING = 1;                  // Figma 平滑度：1.00
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const seen = new WeakSet();

    /**
     * 各页面的「大卡片」清单（小元素不在此列）。
     * override 用于本身没有 border-radius 的面板类容器，按 [左上, 右上, 右下, 左下] 给定半径。
     */
    const RULES = [
        { path: /^\/(?:index\.html)?$/, sel: '.glass-card, .tutorial-frame' },
        {
            path: /^\/dashboard(?:\/|$)/,
            sel: '.card, .stat-card, .site-item, .dialog-card, .confirm-box, .cop-right-panel, .sidebar',
            override: { '.cop-right-panel': [14, 14, 14, 14], '.sidebar': [0, 16, 16, 0] }
        },
        { path: /^\/admin(?:\/|$)/, sel: '.section, .stat-card, .modal' },
        { path: /^\/status(?:\/|$)/, sel: '.service-card' },
        { path: /^\/playground(?:\/|$)/, sel: '.pg-card, .pg-post, .pg-detail, .pg-modal-box' },
        { path: /^\/login(?:\/|$)/, sel: '.modal-overlay .card, .notice-card' }
    ];

    const pathname = () => location.pathname.replace(/index\.html$/, '');

    function matchOverride(el, rule) {
        if (!rule.override) return null;
        for (const sel of Object.keys(rule.override)) {
            if (el.matches(sel)) return rule.override[sel];
        }
        return null;
    }

    function px(v, size) {
        v = String(v || '0').trim().split(/\s+/)[0];
        if (v.slice(-1) === '%') return (parseFloat(v) || 0) / 100 * size;
        return parseFloat(v) || 0;
    }

    const isTransparentColor = c =>
        !c || c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);

    // 四边都有可见边框 → 视为「盒状卡片」，可用 SVG 整圈描边还原边框
    function isBoxedBorder(cs) {
        const w = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'];
        const c = ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
        for (let i = 0; i < 4; i++) {
            if (!(parseFloat(cs[w[i]]) > 0)) return false;
            if (isTransparentColor(cs[c[i]])) return false;
        }
        return true;
    }

    // 读取「未经本脚本改写」的原始边框（本脚本会把 border-color 置为 transparent）
    function probeBorder(el) {
        const prev = el.style.borderColor;
        el.style.borderColor = '';
        const cs = getComputedStyle(el);
        const out = {
            boxed: isBoxedBorder(cs),
            bw: parseFloat(cs.borderTopWidth) || 0,
            color: cs.borderTopColor
        };
        el.style.borderColor = prev;
        return out;
    }

    function ensureOverlay(el) {
        const st = el.__sqr || {};
        if (st.svg) return (el.__sqr = st);
        // SVG 靠 absolute 定位贴回 border box，宿主必须是定位祖先；
        // .card / .stat-card 等多数卡片默认 static，补 relative 不影响布局。
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'sqr-border');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('fill', 'none');
        path.style.transition = 'stroke .3s';
        svg.appendChild(path);
        Object.assign(svg.style, {
            position: 'absolute', pointerEvents: 'none', zIndex: '0', top: '0', left: '0'
        });
        el.appendChild(svg);
        st.svg = svg;
        st.path = path;
        return (el.__sqr = st);
    }

    function apply(el, rule) {
        const rect = el.getBoundingClientRect();
        const w = rect.width, h = rect.height;
        if (w < 2 || h < 2) {
            // 折叠 / 隐藏（收起的侧边栏、未打开的弹窗）→ 清掉旧的裁剪路径，
            // 否则恢复显示前的那一帧会沿用旧尺寸而错位。之后由观察器重新应用。
            el.style.webkitClipPath = 'none';
            el.style.clipPath = 'none';
            return false;
        }

        const cs = getComputedStyle(el);
        const ov = matchOverride(el, rule);
        const r = ov
            ? { tl: ov[0], tr: ov[1], br: ov[2], bl: ov[3] }
            : {
                tl: px(cs.borderTopLeftRadius, w), tr: px(cs.borderTopRightRadius, w),
                br: px(cs.borderBottomRightRadius, w), bl: px(cs.borderBottomLeftRadius, w)
            };
        const max = Math.min(w, h) / 2;
        r.tl = Math.max(0, Math.min(r.tl, max));
        r.tr = Math.max(0, Math.min(r.tr, max));
        r.br = Math.max(0, Math.min(r.br, max));
        r.bl = Math.max(0, Math.min(r.bl, max));
        if (!(r.tl || r.tr || r.br || r.bl)) return false;

        const d = getSvgPath({
            width: w, height: h, cornerSmoothing: SMOOTHING,
            topLeftCornerRadius: r.tl, topRightCornerRadius: r.tr,
            bottomRightCornerRadius: r.br, bottomLeftCornerRadius: r.bl
        });
        if (!d || d.indexOf('NaN') !== -1) return false;

        el.style.webkitClipPath = `path('${d}')`;
        el.style.clipPath = `path('${d}')`;

        // 卡片自身的 1px 边框会被 squircle 裁掉（曲线在圆角区域内缩），
        // 故把边框描到一张内联 SVG 上：描边 2×borderWidth，外侧一半被裁掉，
        // 剩下的正好补回那条 1px 边框。
        //
        // 只对「四边都有可见边框」的盒状卡片做补偿：只有单边/双边边框的元素
        // （如 .cop-right-panel 仅 border-left）整圈描边会凭空多出线条，
        // 这类元素保留直边上的原始边框即可，代价只是圆角末端少一截描边，肉眼无感。
        // 注意：把 border-color 置透明后再读 computed style 就拿不回原色了，
        // 故首次探测结果缓存进 st，之后一律用缓存值。
        const st = el.__sqr || (el.__sqr = {});
        if (!st.probed) {
            Object.assign(st, probeBorder(el), { probed: true });
        }
        const bw = st.boxed ? st.bw : 0;
        const bc = st.boxed ? st.color : 'rgba(0,0,0,0)';
        if (st.svg && !(bw > 0 && !isTransparentColor(bc))) {
            st.svg.remove();
            st.svg = null;
            st.path = null;
        }
        if (bw > 0 && !isTransparentColor(bc)) {
            ensureOverlay(el);
            // 绝对定位子元素相对 padding box 定位，回退一个边框宽度即对齐 border box
            Object.assign(st.svg.style, {
                top: (-bw) + 'px', left: (-bw) + 'px', width: w + 'px', height: h + 'px'
            });
            st.svg.setAttribute('width', w);
            st.svg.setAttribute('height', h);
            st.path.setAttribute('d', d);
            st.path.setAttribute('stroke', bc);
            st.path.setAttribute('stroke-width', bw * 2);
            if (!st.bordered) {
                st.bordered = true;
                el.style.borderColor = 'transparent';
                bindHoverColor(el);
            }
        }
        return true;
    }

    // 悬停时 border-color 会变（如 .glass-card:hover），同步刷新 SVG 描边颜色
    function bindHoverColor(el) {
        let timer = null;
        const sync = () => {
            const st = el.__sqr;
            if (!st || !st.path) return;
            const c = probeBorder(el).color;
            if (c && c !== st.color) {
                st.color = c;
                st.path.setAttribute('stroke', c);
            }
        };
        el.addEventListener('mouseenter', () => { clearTimeout(timer); timer = setTimeout(sync, 320); });
        el.addEventListener('mouseleave', () => { clearTimeout(timer); timer = setTimeout(sync, 320); });
    }

    const ro = ('ResizeObserver' in window)
        ? new ResizeObserver(entries => entries.forEach(e => apply(e.target, e.target.__sqrRule)))
        : null;

    function scan() {
        const p = pathname();
        for (const rule of RULES) {
            if (!rule.path.test(p)) continue;
            for (const el of document.querySelectorAll(rule.sel)) {
                if (seen.has(el)) {
                    // 内容被 innerHTML 重写时描边 SVG 会被一起清掉，重新补画一次
                    const st = el.__sqr;
                    if (st && st.bordered && st.svg && st.svg.parentNode !== el) {
                        st.svg = null;
                        st.path = null;
                        apply(el, rule);
                    }
                    continue;
                }
                el.__sqrRule = rule;
                if (apply(el, rule)) {
                    seen.add(el);
                    if (ro) ro.observe(el);
                }
            }
        }
    }

    function boot() {
        scan();
        if ('MutationObserver' in window) {
            let t = null;
            new MutationObserver(() => {
                clearTimeout(t);
                t = setTimeout(scan, 120);      // 动态卡片（站点列表 / 弹窗 / 评论）出现后补扫
            }).observe(document.body, { childList: true, subtree: true });
        }
        window.addEventListener('load', scan);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}
