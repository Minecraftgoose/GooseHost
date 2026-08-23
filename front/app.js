    (function() {
        var hash = window.location.hash;
        if (hash && hash.indexOf('access_token=') !== -1) {
            if (hash.indexOf('type=recovery') !== -1) {
                window.location.replace('/reset-password/' + hash);
            } else {
                window.location.replace('/login/' + hash);
            }
        }
    })();
    // ----- 壁纸 -----
    (function setBingWallpaper() {
        const bgLayer = document.getElementById('bgLayer');
        const timestamp = new Date().getTime();
        const wallpaperUrl = 'https://api.fuchenboke.cn/api/fengjing.php?t=' + timestamp;
        const img = new Image();
        img.onload = function() {
            bgLayer.style.backgroundImage = 'url(\'' + wallpaperUrl + '\')';
            bgLayer.classList.add('loaded');
        };
        img.onerror = function() {
            bgLayer.classList.add('loaded');
        };
        img.src = wallpaperUrl;
    })();

    // ----- FAQ 折叠展开 -----
    (function initFaq() {
        const items = document.querySelectorAll('.faq-item');

        items.forEach(function(item) {
            const question = item.querySelector('.faq-question');

            function toggle() {
                const isActive = item.classList.contains('active');

                items.forEach(function(other) {
                    if (other !== item && other.classList.contains('active')) {
                        other.classList.remove('active');
                        other.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
                    }
                });

                if (isActive) {
                    item.classList.remove('active');
                    question.setAttribute('aria-expanded', 'false');
                } else {
                    item.classList.add('active');
                    question.setAttribute('aria-expanded', 'true');
                }
            }

            question.addEventListener('click', function(e) {
                e.stopPropagation();
                toggle();
            });

            question.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                }
            });
        });
    })();

    // ----- 开屏动画移除 -----
    (function() {
        var splash = document.getElementById('splashScreen');
        if (!splash) return;
        function removeSplash() {
            setTimeout(function() {
                if (splash.parentNode) splash.parentNode.removeChild(splash);
            }, 500);
        }
        if (document.readyState === 'complete') {
            removeSplash();
        } else {
            window.addEventListener('load', removeSplash);
        }
    })();


    // ----- 入场-----
    (function initReveal() {
        var els = document.querySelectorAll('.reveal');
        if (!els.length) return;
        function revealIn(el) {
            if (el.classList.contains('in')) return;
            if (document.getElementById('splashScreen')) {
                setTimeout(function() { el.classList.add('in'); }, 1500);
            } else {
                el.classList.add('in');
            }
        }
        if (!('IntersectionObserver' in window)) {
            els.forEach(function(el) { el.classList.add('in'); });
            return;
        }
        var io = new IntersectionObserver(function(entries) {
            entries.forEach(function(e) {
                if (e.isIntersecting) {
                    revealIn(e.target);
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0 });
        els.forEach(function(el) { io.observe(el); });

        var pending = Array.prototype.slice.call(els);
        var timer = null;
        function scanViewport() {
            pending = pending.filter(function(el) {
                if (el.classList.contains('in')) return false;
                var r = el.getBoundingClientRect();
                if (r.top < window.innerHeight && r.bottom > 0) {
                    revealIn(el);
                    return false;
                }
                return true;
            });
        }
        window.addEventListener('scroll', function() {
            clearTimeout(timer);
            timer = setTimeout(scanViewport, 120);
        }, { passive: true });
    })();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function() {});
    }

    // ----- 全站统计 -----
    (function() {
        var els = {
            sites: document.getElementById('statSites'),
            visits: document.getElementById('statVisits')
        };
        if (!els.sites || !els.visits) return;
        fetch('https://page.goose.gs.cn/api/stats', { mode: 'cors' })
            .then(function(r) { return r.json(); })
            .then(function(d) {
                var num = function(n) {
                    if (n == null) return '-';
                    return Number(n).toLocaleString('zh-CN');
                };
                els.sites.textContent = num(d.total_sites);
                els.visits.textContent = num(d.total_visits);
            })
            .catch(function() {});
    })();
