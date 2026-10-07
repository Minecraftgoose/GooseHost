<p style="text-align: center;"><img src="https://host.goose.cc.cd/logo.svg" alt="GooseHost Logo" style="height:auto; width:auto;"></p>

<h1 style="text-align: center;">API文档</h1>

> **基础 URL**：`https://page.goose.cc.cd`
> **响应格式**：JSON（UTF-8）
> **认证方式**：`Authorization: Bearer <API 密钥>`（`gooseh-` 前缀）
> **最后更新** : 2026/10/6

---

## 1. 认证

GooseHost API 使用 **API 密钥** 认证。密钥长期有效、不过期、不轮换，
适用于 CLI、CI、脚本等无人值守场景。

### 1.1 获取密钥

密钥只能在网页端创建：

1. 登录 [GooseHost 控制台](https://host.goose.cc.cd/)
2. 进入 **账户** 页面
3. 在「API 密钥」卡片中点击 **新建密钥**

> 创建时明文只显示一次，关闭弹窗后无法再次查看完整内容。
> 遗失请吊销后重新创建。

### 1.2 密钥格式

```
gooseh-<33 位 base58 字符>
```

示例：`gooseh-3C4oW5TsKpQr7XvN2mHd9LzYbAFgE1uGm`（共 40 字符）

| 特性 | 说明 |
|------|------|
| 字符表 | base58，剔除 `0`、`O`、`I`、`l`，避免抄写与肉眼核对时的歧义 |
| 服务端存储 | **只存 SHA-256 摘要**，不保存明文，泄露风险可控 |
| 前缀识别 | 服务端按 `gooseh-` 前缀自动识别，与请求路径无关 |

### 1.3 使用方式

放在 `Authorization` 请求头里：

```bash
curl https://page.goose.cc.cd/api/my-sites \
  -H "Authorization: Bearer gooseh-3C4oW5TsKpQr7XvN2mHd9LzYbAFgE1uGm"
```

JavaScript 示例：

```js
const res = await fetch('https://page.goose.cc.cd/api/my-sites', {
  headers: { Authorization: 'Bearer gooseh-3C4oW5TsKpQr7XvN2mHd9LzYbAFgE1uGm' }
});
```

**跨域（CORS）**

本 API **允许任意来源跨域调用**，响应头为 `Access-Control-Allow-Origin: *`。
你可以从任何域名、本地 `localhost`、或第三方集成页面直接用浏览器调接口，
无需登记来源白名单。

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Expose-Headers: X-Copilot-Model, X-Copilot-Key, X-Copilot-Fallback, X-Copilot-Elapsed, Retry-After
```

> ⚠️ **在浏览器里用要三思**：网页中的 JS 能看到你写进去的密钥。
> 只在**你自己控制的页面**这么做；公开站点请把调用放在服务端（Node / PHP / 云函数），
> 密钥只留在服务端环境变量里。

**安全建议**

- 按密码等级保管，**不要提交进公开仓库**
- 为不同用途创建不同密钥（如「笔记本 CLI」「GitHub Actions」），便于单独吊销
- 怀疑泄露立即吊销，吊销后立即生效

---

### 1.4 校验密钥

**端点**：`GET /api/me`

用一条请求确认手上的密钥是否有效：

```bash
curl https://page.goose.cc.cd/api/me \
  -H "Authorization: Bearer gooseh-3C4oW5TsKpQr7XvN2mHd9LzYbAFgE1uGm"
```

**响应（200）**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "nickname": "大鹅",
  "authType": "api_key"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 用户 UUID |
| email | string | 注册邮箱 |
| nickname | string | 昵称，未设置时为空字符串 |
| authType | string | 凭证类型，使用密钥时恒为 `api_key` |

**错误响应**

- `401`：`{"error":"Unauthorized"}` —— 密钥无效或已被吊销

> ⚠️ **兼容性提醒**：`authType` 为后加字段。
> 若客户端做**严格 schema 校验**（如 zod `.strict()`、OpenAPI `additionalProperties: false`），
> 请显式允许该字段。后续新增字段不会移除既有字段，属向后兼容变更。

---

### 1.5 密钥列表

**端点**：`GET /api/tokens`

> ⚠️ **不能用密钥管理密钥**。管理类接口只接受网页端会话，
> 携带 `gooseh-` 密钥访问将返回 `403` —— 防止凭证泄露后被用来自我增殖。

**响应（200）**

```json
{
  "keys": [
    {
      "id": "kid_01HXYZ...",
      "name": "笔记本 CLI",
      "masked": "gooseh-3C4oW5Ts…uGmr",
      "createdAt": 1760000000000,
      "lastUsedAt": 1760001234000
    }
  ],
  "max": 20
}
```

| 字段 | 说明 |
|------|------|
| id | 密钥 ID，吊销时使用 |
| name | 创建时的备注名 |
| masked | 脱敏显示，**仅用于辨认，不能用于请求** |
| createdAt | 创建时间戳（毫秒） |
| lastUsedAt | 最近使用时间，`null` 表示从未使用 |

---

### 1.6 创建密钥

**端点**：`POST /api/tokens`

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 备注名，≤ 40 字符，留空为「未命名」 |

**成功响应（200）**

```json
{
  "success": true,
  "key": "gooseh-3C4oW5TsKpQr7XvN2mHd9LzYbAFgE1uGm",
  "token": {
    "id": "kid_01HXYZ...",
    "name": "笔记本 CLI",
    "masked": "gooseh-3C4oW5Ts…uGmr",
    "createdAt": 1760000000000
  },
  "hint": "请立即保存，此密钥仅显示一次"
}
```

> `key` 字段是**唯一一次**返回明文的机会，之后无法再次获取。

**常见错误**

- `400`：`{"error":"每个账号最多创建 20 个 API Key"}`
- `400`：`{"error":"名称不能超过 40 个字符"}`
- `403`：`{"error":"创建 API Key 需使用登录会话"}` —— 用了密钥访问
- `429`：`{"error":"请求过于频繁，请稍后重试"}`
- `503`：`{"error":"API 密钥服务未配置"}`

---

### 1.7 吊销密钥

**端点**：`DELETE /api/tokens/<key_id>`

**成功响应（200）**

```json
{ "success": true }
```

**常见错误**

- `404`：密钥不存在，或不属于当前用户（**不区分**，避免探测他人密钥）
- `403`：`{"error":"吊销 API Key 需使用登录会话"}` —— 用了密钥访问

吊销后该密钥**立即失效**，用它发起的请求将返回 `401`。

---

### 1.8 密钥的能力边界

密钥**只开放站点管理与文件操作**，其余接口一律 `403`。
采用**白名单**而非黑名单：**新增接口默认拒绝**，必须显式登记才放行。

**✅ 允许（CLI / CI 核心用途）**

| 操作 | 端点 |
|------|------|
| 校验密钥 | `GET /api/me` |
| 站点列表 | `GET /api/my-sites` |
| 创建 / 更新 / 删除站点 | `POST /api/create`、`/api/update`、`/api/delete` |
| 读取站点内容 | `GET /api/file/:slug`、`/api/site-files/:slug` |
| 多文件站点读写删 | `GET` `PUT` `DELETE /api/proj-file/:slug/:path` |
| 广场只读 | `GET /api/play/posts`、`/api/play/me`、`/api/play/feed` 等 |
| macOS 审核状态 | `GET /api/macos/status` |

**❌ 拒绝（返回 403）**

| 操作 | 端点 | 原因 |
|------|------|------|
| **AI Copilot** | `POST /api/ai/chat` | **按量计费**，开放等于把模型额度公开，本服务会变成免费 AI 中转站 |
| **AI 生图** | `POST /api/ai/image` | 同上，按量计费 |
| **AI 联网检索** | `POST /api/ai/search` | 同上，按量计费（Tavily 额度） |
| 广场发帖 / 评论 / 点赞 / 关注 | `POST /api/play/*` 写操作 | 以你名义的社交行为，且易被脚本刷 |
| 修改昵称 | `PUT /api/me` | 账号设置 |
| 注销账号 | `POST /api/delete-account` | 不可逆 |
| 管理密钥本身 | `/api/tokens` | 防止凭证自我增殖 |
| 提交 macOS 审核 | `POST /api/macos/submit` | 以你名义提交申请 |
| 管理员接口 | `/api/admin/*` | 需管理员身份，与密钥无关 |

**403 响应示例**

```json
{
  "error": "该接口不支持 API 密钥，请使用登录会话",
  "hint": "API 密钥仅用于站点管理与文件操作；AI Copilot、广场互动、账号设置需登录后操作"
}
```

> 设计原则：密钥用于**资源操作**，不用于**花钱的、以你名义的、账号级的**操作。

---

### 1.9 限制一览

| 项目 | 限制 |
|------|------|
| 每账号密钥数量 | **20** 个 |
| 有效期 | 不过期，仅手动吊销 |
| 吊销生效 | 立即（KV 删除后数秒内全网生效） |
| 管理接口限流 | 每 IP 每 60 秒 **10** 次 |
| 单密钥权限 | 单一全权限，等价于账号本身 |

---

## 2. 网站管理

所有接口需携带 API 密钥：

```
Authorization: Bearer gooseh-3C4oW5TsKpQr7XvN2mHd9LzYbAFgE1uGm
```

### 2.1 通用规则

- **Slug 规则**：长度 1~64，仅允许 `a-zA-Z0-9_-.~`（**不支持中文**）。
- **内容大小限制**：
  - HTML / Markdown 内容：≤ **500 KB**。
  - 多文件站点：单文件 ≤ **200 KB**，总解压后 ≤ **2 MB**，文件数 ≤ **50**。

---

### 2.2 创建网站

**端点**：`POST /api/create`

根据请求体字段决定类型：

#### 2.2.1 HTML 站点

```json
{
  "slug": "my-blog",
  "html": "<!DOCTYPE html>..."
}
```

**访问 URL**：`/s/<slug>`

#### 2.2.2 Markdown 站点

```json
{
  "slug": "my-docs",
  "md": "# 标题\n\n内容"
}
```

**访问 URL**：`/md/<slug>`（自动渲染为美观的 HTML 页面）

#### 2.2.3 多文件站点（Project-BETA）

```json
{
  "slug": "my-app",
  "type": "project",
  "zip": "<Base64 编码的 Zip>"
}
```

**Zip 包要求**：

- 必须包含 `index.html` 或 `index.md`。
- 允许的扩展名（白名单）：`html, htm, css, js, mjs, cjs, md, markdown, json, txt, text, svg, xml, yml, yaml, toml, ini, conf, cfg, csv, ts, tsx, jsx, py, c, cpp, cc, h, hpp, java, go, rs, sh, bash, zsh, vue, svelte, wasm`
- 禁止绝对路径、`..` 穿越、反斜杠。
- Base64 编码后长度 ≤ **3 MB**。

**访问 URL**：`/p/<slug>`（子路径自动支持，如 `/p/<slug>/sub/page.html`）

**成功响应（统一）**：

```json
{
  "success": true,
  "name": "my-blog",
  "type": "html",      // 或 "md" / "project"
  "url": "https://page.goose.cc.cd/s/my-blog"
}
```

**限流**：每 IP 每 60 秒 **2** 次，超限锁定 10 分钟。

**错误码**：

- `400`：slug 非法、文件类型不允许、Zip 损坏、大小超限等。
- `409`：slug 已被占用。
- `429`：触发限流。

---

### 2.3 获取我的站点列表

**端点**：`GET /api/my-sites`

**响应（200）**：数组，按 `updated_at` 降序。

```json
[
  {
    "id": "uuid",
    "name": "my-blog",
    "type": "html",
    "visit_count": 128,
    "created_at": "2026-08-20T10:00:00Z",
    "updated_at": "2026-08-20T10:30:00Z",
    "ip_address": "1.2.3.4"
  }
]
```

---

### 2.4 获取站点原始内容（用于编辑）

**端点**：`GET /api/file/<slug>`

- 自动识别类型，返回 `html` 或 `md` 字段。
- **限流**：每 IP 每 10 秒 **10** 次。

**响应（200）**：

- HTML 站点：`{ "html": "<!DOCTYPE html>..." }`
- Markdown 站点：`{ "md": "# 标题\n\n内容" }`

**错误**：`404`（站点不存在或无权限）

---

### 2.5 更新站点内容

**端点**：`POST /api/update`

**请求体**：

```json
{
  "slug": "my-blog",
  "html": "<h1>Updated</h1>"   // 或 "md": "## 新标题"
}
```

- 自动匹配类型，无需指定。
- 内容大小 ≤ **500 KB**。

**限流**：每 IP 每 60 秒 **10** 次。

**成功响应**：`{"success": true}`

---

### 2.6 删除站点

**端点**：`POST /api/delete`

**请求体**：`{ "slug": "my-blog" }`

**操作**：删除数据库记录及存储桶文件。

**成功响应**：`{"success": true}`

---

## 3. 多文件站点（Project）操作

以下接口仅适用于 `type = "project"` 的站点，需携带 API 密钥。

### 3.1 获取文件列表

**端点**：`GET /api/site-files/<slug>`

**响应（200）**：

```json
{
  "site": { /* 站点基本信息 */ },
  "files": [
    { "name": "index.html", "size": 12463 },
    { "name": "css/style.css", "size": 27927 }
  ]
}
```

---

### 3.2 文件级 CRUD

基础路径：`/api/proj-file/<slug>/<路径>`（路径支持多级目录，需 URL 编码）

#### 3.2.1 读取文件

`GET /api/proj-file/<slug>/<路径>`

**成功（200）**：

```json
{
  "name": "index.html",
  "content": "<html>...</html>",
  "size": 12463
}
```

#### 3.2.2 写入/替换文件

`PUT /api/proj-file/<slug>/<路径>`
**请求体**：`{ "content": "新内容" }`

- 扩展名必须在白名单内。
- 内容 ≤ 200 KB。

**成功（200）**：`{"success": true, "name": "index.html"}`

#### 3.2.3 删除文件

`DELETE /api/proj-file/<slug>/<路径>`

**成功（200）**：`{"success": true, "name": "old.js"}`

**通用错误**：

- `400`：路径无效、文件类型不允许、文件过大。
- `404`：文件不存在。
- `403`：非所有者。

---

## 4. 公开接口（无需登录）

### 4.1 获取公告

**端点**：`GET /api/announcement`

**响应（200）**：

```json
{
  "announcement": "维护通知...",
  "created_at": "2026-08-20T12:00:00Z"
}
```

无公告时 `"announcement": null`。

---

### 4.2 全站统计

**端点**：`GET /api/stats`

**响应（200）**：

```json
{
  "total_sites": 256,
  "total_visits": 10240
}
```

---

### 4.3 获取 API 基础地址

**端点**：`GET /api/config`

**响应（200）**：`{ "apiUrl": "https://page.goose.cc.cd" }`

---

## 5. 站点访问（浏览器）

| 类型 | URL 模式 | 说明 |
|------|----------|------|
| HTML | `/s/` | 直接返回 HTML，自动注入 `` 修复相对路径。 |
| Markdown | `/md/` | 渲染为带导航、复制按钮的完整页面。 |
| 多文件 | `/p/` 或 `/p//<子路径>` | 返回对应文件，入口页自动注入 ``。 |

**访问计数**：仅对 `/s/<slug>`、`/md/<slug>`、`/p/<slug>/index.html`（或 `index.md`）递增 `visit_count`，静态资源不计。

---

## 6. 错误码与限流速查

### HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 400 | 参数错误（字段缺失、格式非法、文件超限等） |
| 401 | API 密钥无效或已被吊销 |
| 403 | 无权限（非所有者，或该接口不接受 API 密钥） |
| 404 | 资源不存在 |
| 409 | Slug 已被占用 |
| 429 | 触发限流（响应体含 `retryAfter` 秒数） |
| 500 | 服务器内部错误 |

### 限流明细

| 接口 | 限制 |
|------|------|
| `/api/register` | 每 IP 每小时 5 次（锁定 1 小时） |
| `/api/create` | 每 IP 每 60 秒 2 次（锁定 10 分钟） |
| `/api/update` | 每 IP 每 60 秒 10 次 |
| `/api/me` (PUT) | 每 IP 每 60 秒 20 次 |
| `/api/forgot-password` | IP 每小时 5 次 + 邮箱每小时 3 次 |
| `/api/reset-password` | 每 IP 每小时 10 次 |
| `/api/delete-account` | 每 IP 每小时 3 次 |
| `/api/tokens` | 每 IP 每 60 秒 10 次 |
| `/api/file` (GET) | 每 IP 每 10 秒 10 次 |
| 其他 GET 接口 | 每 IP 每 60 秒 100 次 |

---

## 7. 补充说明

- **时区**：所有时间戳为 UTC（ISO 8601）。
- **Slug 唯一性**：三种站点类型共享同一命名空间。
- **认证**：所有需授权的接口统一使用 `gooseh-` API 密钥，
  见 [第 1 章](#1-认证)。
- **密钥权限**：单一全权限，等价于账号本身，请按密码等级保管；
  能力边界见 [1.8 密钥的能力边界](#18-密钥的能力边界)。
- **跨域**：允许任意来源，浏览器可直接调用，见 [1.3 使用方式](#13-使用方式)。


## 附录 A：账号管理

注册、修改昵称、重置密码、注销账号等账号类操作 **在网页端完成**，
不提供 API 接口，也不接受 API 密钥调用。

| 操作 | 位置 |
|------|------|
| 注册账号 | [GooseHost 注册页](https://host.goose.cc.cd/register/index.html) |
| 修改昵称 / 创建密钥 / 注销账号 | 控制台 → 账户页 |
| 忘记密码 | 登录页 → 忘记密码，通过邮件重置 |

注册校验规则（供参考）：

| 字段 | 规则 |
|------|------|
| email | 符合邮箱格式；禁止临时邮箱（黑名单含数百个域名，如 `mailinator.com`、`10minutemail.com`） |
| password | 至少 6 个字符 |
| nickname | 长度 2~20；仅允许中英文、数字、空格、`_`、`-` |

---

<footer style="text-align: center; color: #888; font-size: 14px; padding: 20px 0; border-top: 1px solid #ddd;">
  <p>© 2026 GooseHost. </p>
  <p>
    <a href="https://host.goose.cc.cd/" style="color: #02ff8e; text-decoration: none;">官网</a> &nbsp;|&nbsp;
    <a href="mailto:support@mail.goose.cc.cd" style="color: #02ff8e; text-decoration: none;">联系我们</a>
  </p>
</footer>
