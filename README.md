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

![](https://tse1.explicit.bing.net/th/id/OIP.fDLRpe7hxXGkp0Gk-8cVLAHaII?r=0&rs=1&pid=ImgDetMain&o=7&rm=3)

somebody get html belike ：我靠咋打开啊，这啥啊？

- GitHubpages：你敢来我就敢部署
- cloudflare：笑而不语
- netlify：我高兴给你墙两天
- vercel：哦，你滴邮箱有问题

所以GooseHost 就是为了给那些拿着一个HTML着急变成URL的friends用的

> 不过最近也推出了上传zip的beta功能

### 架构
GooseHost是搭建在cloudflare和SUPABASE上的

cloudflare负责前端和worker调用

SUPABASE负责用户认证和储存（有1GB空间）（其实cloudflareR2更好）


### 项目结构

```
GooseHost/
├── api/                          
│   ├── src/
│   │   ├── index.js             
│   │   ├── auth/                
│   │   │   ├── login.js         
│   │   │   ├── register.js      
│   │   │   ├── refresh.js       
│   │   │   └── reset.js         
│   │   ├── sites/               
│   │   │   ├── create.js        
│   │   │   ├── list.js    
│   │   │   ├── update.js   
│   │   │   ├── delete.js     
│   │   │   └── files.js         
│   │   ├── admin/
│   │   ├── macos/  
│   │   └── utils/            
│   │       ├── rate-limit.js   
│   │       └── config.js       
│   └── package.json           
│
├── front/                     
│   ├── index.html               
│   ├── login.html               
│   ├── register.html            
│   ├── reset-password.html       
│   ├── admin.html               
│   ├── dashboard-app/           
│   │   └── index.html            
│   ├── docs/                    
│   ├── api-docs/               
│   ├── changelog/            
│   ├── status/                   
│   ├── fonts/                  
│   ├── icons/                 
│   ├── logo.svg                
│   ├── manifest.json             
│   ├── sw.js                   
│   ├── moved-banner.js          
│   ├── _headers                  
│   ├── _redirects                
│   ├── robots.txt
│   └── sitemap.xml             
│
└── LICENSE                     
```

### 快速开始

请阅读[使用手册](https://host.goose.gs.cn/docs/)
> 不是这玩意啥子都会吧

### 技术栈

不写，没啥可写的

### 许可

MIT License
