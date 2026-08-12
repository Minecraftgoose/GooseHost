// GooseHost 假 PWA Service Worker
// 仅用于触发「添加到主屏幕」安装提示，不缓存任何数据

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// 拦截请求，捕获网络错误，避免控制台报错
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // 返回一个简单错误响应，不抛出异常
      return new Response('Network error, please try again later.', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    })
  );
});