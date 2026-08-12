// GooseHost 旧域名搬家提示 Worker
// 部署到 page.goose.cc.cd，任意路径都返回搬家提示页

const NEW_HOST = 'page.goose.gs.cn';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const dest = 'https://' + NEW_HOST + url.pathname + url.search + url.hash;

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GooseHost 已搬家</title>
<meta http-equiv="refresh" content="5;url=${dest}">
<link rel="icon" type="image/x-icon" href="https://host.goose.gs.cn/icons/favicon.ico">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #0a0f0d;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.card {
  max-width: 460px;
  width: 90%;
  background: rgba(20, 35, 25, 0.92);
  border: 1px solid rgba(2, 255, 142, 0.15);
  border-radius: 12px;
  padding: 40px 32px;
  text-align: center;
  box-shadow: 0 8px 30px rgba(2, 255, 142, 0.15);
}
.badge {
  display: inline-block;
  background: rgba(2, 255, 142, 0.15);
  color: #02ff8e;
  border: 1px solid rgba(2, 255, 142, 0.3);
  font-size: 13px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 999px;
  margin-bottom: 20px;
}
h1 { font-size: 26px; font-weight: 700; margin-bottom: 10px; }
p.desc { color: rgba(255, 255, 255, 0.55); font-size: 14px; line-height: 1.7; margin-bottom: 24px; }
.new-addr {
  display: inline-block;
  background: linear-gradient(135deg, #02ff8e, #00cc6a);
  color: #001a0d;
  font-weight: 600;
  font-size: 16px;
  text-decoration: none;
  padding: 13px 30px;
  border-radius: 8px;
  margin-bottom: 14px;
  word-break: break-all;
}
.tip { color: rgba(255, 255, 255, 0.3); font-size: 12px; }
.tip a { color: rgba(2, 255, 142, 0.6); text-decoration: none; }
@media (max-width: 480px) {
  .card { padding: 28px 20px; }
  h1 { font-size: 22px; }
  .new-addr { font-size: 14px; padding: 11px 22px; }
}
</style>
</head>
<body>
<div class="card">
  <div class="badge">站点已迁移</div>
  <h1>GooseHost 已搬家</h1>
  <p class="desc">该页面已迁移至新地址，5 秒后自动跳转，或点击下方按钮立即前往。</p>
  <a class="new-addr" href="${dest}">前往 ${NEW_HOST}</a>
  <p class="tip">如果跳转失败，请手动打开 <a href="${dest}">${NEW_HOST}</a></p>
</div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }
};
