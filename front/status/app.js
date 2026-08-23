        const API_URL = 'https://page.goose.gs.cn';

        async function checkStatus() {
            const loadingBox = document.getElementById('loadingBox');
            const servicesBox = document.getElementById('servicesBox');
            const mainStatus = document.getElementById('mainStatus');
            const mainStatusText = document.getElementById('mainStatusText');
            const maintenanceBanner = document.getElementById('maintenanceBanner');
            const maintenanceMessage = document.getElementById('maintenanceMessage');
            const lastUpdate = document.getElementById('lastUpdate');

            try {
                // 只读取 admin 设定的状态，不再自检
                const statusRes = await fetch(API_URL + '/api/admin/system-status');
                const statusData = await statusRes.json();

                loadingBox.style.display = 'none';

                if (statusData.maintenance_message) {
                    maintenanceMessage.textContent = statusData.maintenance_message;
                    maintenanceBanner.style.display = 'block';
                } else {
                    maintenanceBanner.style.display = 'none';
                }

                const services = statusData.services || {};

                const serviceKeys = ['login', 'register', 'create', 'my-sites', 'update', 'delete', 'serve-html', 'serve-md'];
                const upCount = serviceKeys.filter(k => services[k] !== false).length;
                const allUp = upCount === serviceKeys.length;

                if (allUp && !statusData.maintenance_mode) {
                    mainStatus.className = 'status-badge operational';
                    mainStatusText.textContent = '运行正常';
                } else if (upCount > serviceKeys.length / 2) {
                    mainStatus.className = 'status-badge degraded';
                    mainStatusText.textContent = `部分服务维护中 (${upCount}/${serviceKeys.length})`;
                } else {
                    mainStatus.className = 'status-badge outage';
                    mainStatusText.textContent = `大部分服务维护中 (${upCount}/${serviceKeys.length})`;
                }

                const statusMap = {
                    'status-login': services.login,
                    'status-register': services.register,
                    'status-create': services.create,
                    'status-my-sites': services['my-sites'],
                    'status-update': services.update,
                    'status-delete': services.delete,
                    'status-serve-html': services['serve-html'],
                    'status-serve-md': services['serve-md'],
                };

                Object.entries(statusMap).forEach(([id, status]) => {
                    const el = document.getElementById(id);
                    if (el) {
                        if (status !== false && !statusData.maintenance_mode) {
                            el.className = 'service-status up';
                            el.innerHTML = '<i class="fas fa-check-circle"></i> 正常';
                        } else {
                            el.className = 'service-status down';
                            el.innerHTML = '<i class="fas fa-tools"></i> 维护中';
                        }
                    }
                });

                lastUpdate.textContent = new Date().toLocaleString('zh-CN');

                servicesBox.style.display = 'block';
            } catch (err) {
                loadingBox.style.display = 'none';
                servicesBox.style.display = 'block';
                mainStatusText.textContent = '状态未知';
                mainStatus.className = 'status-badge outage';
            }
        }

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

        checkStatus();

        setInterval(checkStatus, 30000);
