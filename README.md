# GooseHost

GooseHost 是一个免费静态网站托管平台。上传 HTML 或 Markdown，一键部署到全球 CDN，获得一个可直接访问的链接。无需服务器，无需命令行。

> 线上地址：[host.goose.cc.cd](https://host.goose.cc.cd)

---

## 目录

- [项目结构](#项目结构)
- [api/ 后端说明](#api-后端说明)
- [front/ 前端说明](#front-前端说明)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [许可](#许可)

---

## 项目结构

```
goosehost/
├── api/          # 后端 Worker — API 接口 + 站点托管
└── front/        # 前端页面 — 控制台 + 文档
```

---

## api/ 后端说明

后端是一个 Cloudflare Worker，同时承担 API 接口和站点托管两个角色。通过 esbuild 打包为单文件部署。

### 目录结构

```
api/
├── index.js              # Worker 入口，路由分发
├── debug.js              # 调试接口
├── package.json          # npm 依赖配置
├── package-lock.json     # 依赖锁文件
│
├── sites/                # 站点管理
│   ├── index.js          #   sites 路由入口
│   ├── create.js         #   创建站点（HTML/MD）
│   ├── serve.js          #   公开访问 /s/xxx /md/xxx
│   ├── update.js         #   更新站点内容
│   ├── delete.js         #   删除站点
│   ├── my-sites.js       #   获取用户站点列表
│   └── file.js           #   获取站点源文件
│
├── auth/                 # 用户认证
│   ├── index.js          #   auth 路由入口
│   ├── login.js          #   登录
│   ├── signup.js         #   注册
│   ├── register.js       #   注册辅助
│   └── blocked-emails.js #   封禁邮箱列表
│
├── admin/                # 管理面板接口
│   ├── index.js          #   admin 路由入口
│   ├── stats.js          #   平台统计数据
│   ├── users.js          #   用户列表与管理
│   ├── sites.js          #   站点列表与管理
│   ├── site-detail.js    #   单个站点详情
│   ├── sync-emails.js    #   外部邮箱同步
│   ├── system-status.js  #   系统运行状态
│   └── delete-user.js    #   删除用户
│
├── jobs/                 # 定时任务
│   ├── index.js          #   jobs 路由入口
│   └── cleanup.js        #   每 30 分钟清理孤儿用户
│
└── utils/                # 工具函数
    ├── index.js          #   utils 路由入口
    ├── supabase.js       #   Supabase 客户端封装
    ├── jwt.js            #   JWT 签发与校验
    ├── response.js       #   统一 JSON 响应格式
    ├── cors.js           #   CORS 跨域头配置
    ├── rate-limit.js     #   请求频率限制
    ├── site-url.js       #   站点公开 URL 生成
    └── email-map.js      #   邮箱地址映射
```

### 路由表

#### 站点管理

**创建站点**

```
POST /api/create
Content-Type: application/json

请求：
{
  "name": "my-site",        // 站点名称
  "html": "<h1>Hello</h1>", // HTML 内容（html 和 md 二选一）
  "md": "# Hello"            // Markdown 内容
}

响应：
{
  "success": true,
  "name": "my-site",
  "url": "https://page.goose.cc.cd/s/my-site"
}
```

**获取站点列表**

```
GET /api/my-sites
Authorization: Bearer <token>

响应：
{
  "success": true,
  "sites": [
    {
      "name": "my-site",
      "created_at": "2026-07-22T...",
      "updated_at": "2026-07-22T..."
    }
  ]
}
```

**更新站点**

```
POST /api/update
Content-Type: application/json
Authorization: Bearer <token>

请求：
{
  "slug": "my-site",
  "html": "<h1>Updated</h1>",
  "md": "# Updated"
}

响应：
{ "success": true }
```

**删除站点**

```
POST /api/delete
Content-Type: application/json
Authorization: Bearer <token>

请求：
{ "slug": "my-site" }

响应：
{ "success": true }
```

**访问站点**

```
GET /s/<slug>        # HTML 站点
GET /md/<slug>       # Markdown 站点

响应：text/html
```

#### 用户认证

**注册**

```
POST /auth/signup
Content-Type: application/json

请求：
{
  "email": "user@example.com",
  "password": "your-password"
}

响应：
{
  "success": true,
  "token": "eyJhbGciOiJ..."
}
```

**登录**

```
POST /auth/login
Content-Type: application/json

请求：
{
  "email": "user@example.com",
  "password": "your-password"
}

响应：
{
  "success": true,
  "token": "eyJhbGciOiJ..."
}
```

#### 管理接口

```
GET  /api/admin/stats          # 平台统计数据
GET  /api/admin/users          # 用户列表
GET  /api/admin/sites          # 站点列表
GET  /api/admin/system-status  # 系统运行状态
GET  /api/admin/site-detail?slug=<slug>  # 站点详情
POST /api/admin/sync-emails    # 同步邮箱
POST /api/admin/delete-user    # 删除用户（需确认）
```

---

## front/ 前端说明

前端为纯静态页面，直接部署到 Cloudflare Pages，无需构建步骤。

### 页面列表

```
front/
├── index.html            # 首页 — 产品介绍 + FAQ
├── dashboard.html        # 控制台 — 站点管理
├── admin.html            # 管理面板 — 平台管理
├── login.html            # 登录页
├── register.html         # 注册页
├── status.html           # 系统状态页
│
├── api-docs/             # API 文档
│   ├── index.html
│   └── api.md
│
├── docs/                 # 用户协议与隐私政策
│   ├── index.html
│   └── terms.md
│
├── changelog/            # 更新日志
│   ├── index.html
│   └── changelog.md
│
├── icons/                # 多尺寸图标（16x16 到 1024x1024）
├── fonts/                # 钉钉进步体字体
├── logo.svg              # 品牌 Logo
├── manifest.json         # PWA 清单
├── robots.txt            # 搜索引擎爬虫规则
├── sitemap.xml           # 站点地图
└── sw.js                 # Service Worker
```

---

## 功能特性

### 站点部署

- **HTML 站点**：上传完整 HTML 代码，直接部署，访问 `/s/:slug`。支持 CSS、JavaScript 等静态资源。
- **Markdown 站点**：写入 Markdown 内容，自动渲染为 GitHub 风格文档页，访问 `/md/:slug`。支持代码块、表格、图片、引用等标准 Markdown 语法。
- **编辑与删除**：支持随时修改内容或删除已部署的站点。
- **自动 HTTPS**：所有站点自动配置免费 SSL 证书，全链路加密。
- **全球 CDN**：基于 Cloudflare 全球网络加速，多节点缓存，访问速度更快。

### 用户系统

- 邮箱注册与登录
- 登录状态管理，支持会话保持
- JWT 令牌鉴权，保障 API 请求安全
- 管理面板支持用户搜索与操作

### 管理面板

- 平台统计数据：查看总站点数、总用户数
- 用户管理：搜索、查看、操作用户
- 站点管理：查看全平台站点列表与详情
- 系统运行状态监控：检查各服务运行情况
- 邮箱同步：从外部身份源同步用户邮箱

### 存储架构

站点文件存储在 Supabase Storage 中，分为两个存储桶：

- **sites 桶**：HTML 站点文件，按 `sites/<owner_id>/<slug>/index.html` 组织
- **md 桶**：Markdown 站点文件，按 `md/public/<slug>/index.md` 组织

Markdown 站点在请求时由服务端渲染为 HTML，HTML 站点直接返回原文件。

### 定时任务

- 每 30 分钟运行一次孤儿用户清理任务
- 自动检测并清理无关联站点的异常用户

### 其他

- **系统状态页面**：实时查看服务运行情况
- **命令行 CLI 工具**：GooseHost CLI，支持命令行创建/管理站点
- **OpenClaw 适配版**：支持 `/goosehost` 命令部署
- **更新日志**：记录每次版本变化，方便追踪功能更新

---

## 技术栈

| 层 | 技术 |
|---|------|
| 运行时 | Cloudflare Workers |
| 前端托管 | Cloudflare Pages |
| 数据库 | Supabase (PostgreSQL) |
| 对象存储 | Supabase Storage |
| 鉴权 | 自管 JWT |
| 构建 | esbuild |
| Markdown 渲染 | marked |
| 图标 | Font Awesome |
| 字体 | 钉钉进步体 |

## 架构说明

```
用户浏览器
    │
    ▼
Cloudflare CDN（全球加速）
    │
    ├── host.goose.cc.cd ──── Cloudflare Pages ──── 静态前端页面
    │
    └── page.goose.cc.cd ──── Cloudflare Workers ──── API + 站点托管
                                    │
                                    ├── Supabase（PostgreSQL）── 站点元数据、用户数据
                                    │
                                    └── Supabase Storage ────── HTML / Markdown 文件
```

用户访问流程：

1. 用户打开 `host.goose.cc.cd`，Cloudflare Pages 返回前端页面
2. 用户在前端创建站点，前端调用 `page.goose.cc.cd/api/create`
3. Worker 接收请求，将站点信息写入 Supabase 数据库
4. Worker 将站点文件上传到 Supabase Storage
5. Worker 返回站点访问地址 `page.goose.cc.cd/s/<slug>`
6. 访客访问该地址，Worker 从 Storage 拉取文件返回
7. Markdown 站点在返回前由 Worker 现场渲染为 HTML

## 项目背景

---

## 快速开始

### 后端本地开发

```bash
cd api
npm install
```

项目使用 esbuild 打包，入口文件为 `index.js`，打包输出 `worker.js`。

**打包：**
```bash
npx esbuild index.js --bundle --format=esm --outfile=worker.js
```

**部署到 Cloudflare Workers：**
```bash
npx wrangler deploy --name your-worker-name --compatibility-date 2026-07-22 worker.js
```

### 环境变量

在 Cloudflare Workers 后台配置以下环境变量：

| 变量名 | 说明 |
|--------|------|
| SUPABASE_URL | Supabase 项目 URL |
| SUPABASE_ANON_KEY | Supabase 匿名密钥 |
| SUPABASE_SERVICE_ROLE_KEY | Supabase 服务角色密钥 |
| JWT_SECRET | JWT 签名密钥 |
| API_URL | API 基础地址 |

### 前端部署

`front/` 目录为纯静态页面，直接上传到 Cloudflare Pages 即可，无需构建步骤。

### 目录规范

```
api/
├── sites/       # 站点相关逻辑
├── auth/        # 用户认证逻辑
├── admin/       # 管理面板逻辑
├── jobs/        # 定时任务
└── utils/       # 公共工具函数
```

每个功能目录包含一个 `index.js` 作为路由入口，路由到对应的处理文件。处理文件导出一个 async 函数，接收 `(request, env, ...args)` 参数。

```
front/
├── *.html       # 页面文件
├── api-docs/    # API 文档
├── docs/        # 用户协议
└── changelog/   # 更新日志
```

前端页面通过 JavaScript 中的 `API_URL` 常量指向后端地址，所有 API 调用使用 `fetch`。

---

## 作者

- 抖音：**Minecraft_goose**
