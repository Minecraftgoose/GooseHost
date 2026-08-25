<p align="center">
  <a href="https://host.goose.gs.cn"><img src="front/logo.svg" alt="GooseHost Logo" width="auto"></a>
</p>

<p align="center">
  <a href="https://github.com/Minecraftgoose/GooseHost/stargazers"><img src="https://img.shields.io/github/stars/Minecraftgoose/GooseHost?style=for-the-badge&color=%2302ff8e&label=Stars" alt="Stars"></a>
  <a href="https://github.com/Minecraftgoose/GooseHost/network/members"><img src="https://img.shields.io/github/forks/Minecraftgoose/GooseHost?style=for-the-badge&color=%2300cc6a&label=Forks" alt="Forks"></a>
  <a href="https://github.com/Minecraftgoose/GooseHost/issues"><img src="https://img.shields.io/github/issues/Minecraftgoose/GooseHost?style=for-the-badge&color=%23ff6b6b&label=Issues" alt="Issues"></a>
  <a href="https://host.goose.gs.cn"><img src="https://img.shields.io/badge/Live-host.goose.gs.cn-%2302ff8e?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Live"></a>
  <a href="https://github.com/Minecraftgoose/GooseHost/commits"><img src="https://img.shields.io/github/last-commit/Minecraftgoose/GooseHost?style=for-the-badge&color=%234a90d9&label=Last%20Commit" alt="Last Commit"></a>
  <a href="https://github.com/Minecraftgoose/GooseHost/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License"></a>
</p>

<p align="center">
  <a href="https://page.goose.gs.cn"><img src="https://img.shields.io/badge/API-page.goose.gs.cn-%2302ff8e?style=flat-square&logo=cloudflare&logoColor=white" alt="API"></a>
  <a href="https://host.goose.gs.cn"><img src="https://img.shields.io/badge/Status-Active-%2302ff8e?style=flat-square" alt="Status"></a>
  <a href="https://workers.cloudflare.com"><img src="https://img.shields.io/badge/Powered%20by-Cloudflare%20Workers-%23f38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers"></a>
  <a href="https://pages.cloudflare.com"><img src="https://img.shields.io/badge/Frontend-Cloudflare%20Pages-%23f38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Pages"></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/Storage-Supabase-%233ecf8e?style=flat-square&logo=supabase&logoColor=white" alt="Supabase"></a>
</p>

<p align="center">
  <b>免费静态网站托管平台 &middot; 无需服务器 &middot; 无需命令行 &middot; 一键部署到全球 CDN</b><br>
  <sub>由 <a href="https://github.com/Minecraftgoose">Minecraft_goose</a> 开发 &middot; GooseCode&reg; 旗下产品</sub>
</p>

---

### 关于GooseHost

**GooseHost** 的诞生源于--现在的部署网站都太重量级了，而大家有的时候只是为了让别人看一个HTML网页

而有些人be like ：哎，你看我做的网页`https://localhost:8080`!

<p><img src="https://tse1.explicit.bing.net/th/id/OIP.fDLRpe7hxXGkp0Gk-8cVLAHaII?r=0&rs=1&pid=ImgDetMain&o=7&rm=3" alt="GooseHost Logo" width="100"></a></p>

somebody get html belike ：我靠咋打开啊，这啥啊？

- GitHubpages：你敢来我就敢部署
- cloudflare：笑而不语
- netlify：我高兴给你墙两天
- vercel：哦，你滴邮箱有问题
- surge：你把电脑打开再给我下载个Node.js。。。

所以GooseHost 就是为了给那些拿着一个HTML着急变成URL的friends用的

> 不过最近也推出了上传zip的beta功能

### 架构
GooseHost是搭建在cloudflare和SUPABASE上的

cloudflare负责前端和worker调用

SUPABASE负责用户认证和储存（有1GB空间）（其实cloudflareR2更好）


### 项目结构

```
GooseHost
├─ front
│  ├─ app.js
│  ├─ BingSiteAuth.xml
│  ├─ index.html
│  ├─ logo.svg
│  ├─ manifest.json
│  ├─ moved-banner.js
│  ├─ robots.txt
│  ├─ sitemap.xml
│  ├─ style.css
│  ├─ sw.js
│  ├─ _headers
│  ├─ _redirects
│  ├─ status
│  │  ├─ app.js
│  │  ├─ index.html
│  │  └─ style.css
│  ├─ reset-password
│  │  ├─ app.js
│  │  ├─ index.html
│  │  └─ style.css
│  ├─ register
│  │  ├─ app.js
│  │  ├─ index.html
│  │  └─ style.css
│  ├─ login
│  │  ├─ app.js
│  │  ├─ index.html
│  │  └─ style.css
│  ├─ icons
│  │  ├─ favicon.ico
│  │  ├─ icon-1024x1024.png
│  │  ├─ icon-128x128.png
│  │  ├─ icon-16x16.png
│  │  ├─ icon-180x180.png
│  │  ├─ icon-192x192.png
│  │  ├─ icon-256x256.png
│  │  ├─ icon-32x32.png
│  │  ├─ icon-48x48.png
│  │  ├─ icon-512x512.png
│  │  ├─ icon-64x64.png
│  │  └─ social-avatar-500x500.png
│  ├─ fonts
│  │  └─ DingTalk JinBuTi.ttf
│  ├─ docs
│  │  ├─ guide.md
│  │  ├─ index.html
│  │  └─ terms.md
│  ├─ dashboard
│  │  ├─ app.js
│  │  ├─ index.html
│  │  └─ style.css
│  ├─ changelog
│  │  ├─ changelog.md
│  │  └─ index.html
│  ├─ api-docs
│  │  ├─ api.md
│  │  └─ index.html
│  └─ admin
│     ├─ app.js
│     ├─ index.html
│     └─ style.css
└─ api
   ├─ .gitignore
   ├─ debug.js
   ├─ index.js
   ├─ macos.js
   ├─ moved-worker.js
   ├─ package-lock.json
   ├─ package.json
   ├─ wrangler.toml
   ├─ utils
   │  ├─ cors.js
   │  ├─ email-map.js
   │  ├─ index.js
   │  ├─ jwt.js
   │  ├─ rate-limit.js
   │  ├─ response.js
   │  ├─ site-url.js
   │  └─ supabase.js
   ├─ sites
   │  ├─ create.js
   │  ├─ delete.js
   │  ├─ file.js
   │  ├─ files.js
   │  ├─ index.js
   │  ├─ my-sites.js
   │  ├─ project-file.js
   │  ├─ project.js
   │  ├─ serve.js
   │  └─ update.js
   ├─ jobs
   │  ├─ cleanup.js
   │  └─ index.js
   ├─ auth
   │  ├─ blocked-emails.js
   │  ├─ delete-account.js
   │  ├─ forgot-password.js
   │  ├─ index.js
   │  ├─ login.js
   │  ├─ me.js
   │  ├─ refresh.js
   │  ├─ register.js
   │  ├─ reset-password.js
   │  └─ signup.js
   └─ admin
      ├─ announcement.js
      ├─ delete-user.js
      ├─ index.js
      ├─ public-stats.js
      ├─ site-detail.js
      ├─ sites.js
      ├─ stats.js
      ├─ sync-emails.js
      ├─ system-status.js
      └─ users.js                 
```

### 快速开始

请阅读[使用手册](https://host.goose.gs.cn/docs/)
> 不是这玩意啥子都会吧

### 自托管GooseHost

请阅读[维基文档](https://github.com/Minecraftgoose/GooseHost/wiki/GooseHost-%E8%87%AA%E6%89%98%E7%AE%A1%E6%96%87%E6%A1%A3)

### 文档页
- [API文档](https://host.goose.gs.cn/api-docs/)
- [更新日志](https://host.goose.gs.cn/changelog/)
- [用户协议](https://host.goose.gs.cn/docs/?doc=terms)
  > 是的有用户协议
- [CLI文档](https://page.goose.gs.cn/md/cli/)

### 许可

MIT License
