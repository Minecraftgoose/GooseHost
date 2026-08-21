<p style="text-align: center;"><img src="https://host.goose.gs.cn/logo.svg" alt="GooseHost Logo" style="height:auto; width:auto;"></p>

<h1 style="text-align: center;">API文档</h1>

> **基础 URL**：`https://page.goose.gs.cn`
> **响应格式**：JSON（UTF-8）
> **认证方式**：Bearer Token
> **最后更新** : 2026/8/20

---

## 1. 认证与账号

### 1.1 用户登录

**端点**：`POST /auth/login`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 注册邮箱 |
| password | string | 是 | 密码 |

**限流**：每 IP 每 60 秒 **20** 次。

**成功响应（200）**：

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "def...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "nickname": "大鹅"
  }
}
```

**错误示例**：

- `400`：`{"error":"邮箱或密码格式不正确"}`
- `429`：`{"error":"请求过于频繁，请在 X 秒后重试","retryAfter":X}`

---

### 1.2 刷新 Token

**端点**：`POST /auth/refresh`

**请求体**：

| 字段 | 类型 | 必填 |
|------|------|------|
| refresh_token | string | 是 |

**响应**：同登录成功响应，返回新的 `access_token` 和 `refresh_token`。

---

### 1.3 用户注册

**端点**：`POST /api/register`

**请求体**：

| 字段 | 类型 | 校验规则 |
|------|------|----------|
| email | string | 符合邮箱格式；禁止临时邮箱（黑名单含数百个域名，如 `mailinator.com`、`10minutemail.com` 等） |
| password | string | 至少 6 个字符 |
| nickname | string | 长度 2~20；仅允许中英文、数字、空格、`_`、`-`（正则：`/^[一-龥a-zA-Z0-9_ \-]+$/`） |

**限流**：

- 每 IP 每小时 **5** 次（`reg_ip`），超限锁定 1 小时。
- 全局创建类限流：每 IP 每 60 秒 **2** 次，超限锁定 10 分钟。

**成功响应（200）**：

```json
{
  "success": true,
  "message": "验证邮件已发送，请查收"
}
```

**常见错误**：

- `{"error":"昵称不能为空"}`
- `{"error":"昵称长度需为 2-20 个字符"}`
- `{"error":"暂不支持该临时邮箱，请使用真实邮箱"}`
- `{"error":"邮箱格式不正确"}`

---

### 1.4 获取当前用户信息

**端点**：`GET /api/me`（需登录）

**响应（200）**：

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "nickname": "大鹅"
}
```

---

### 1.5 修改昵称

**端点**：`PUT /api/me`（需登录）

**请求体**：`{ "nickname": "新昵称" }`
**校验**：同注册。

**限流**：每 IP 每 60 秒 **20** 次。

**成功响应**：`{"success": true, "nickname": "新昵称"}`

---

### 1.6 忘记密码（发送重置邮件）

**端点**：`POST /api/forgot-password`（**无需登录**）

**请求体**：`{ "email": "user@example.com" }`

**限流**：

- 每 IP 每小时 **5** 次。
- 每邮箱每小时 **3** 次。

**成功响应（200）**（无论邮箱是否存在）：

```json
{
  "success": true,
  "message": "如果该邮箱已注册，重置链接已发送，请查收垃圾邮件"
}
```

---

### 1.7 重置密码

**端点**：`POST /api/reset-password`（**无需登录**）

**请求体**：

| 字段 | 类型 | 说明 |
|------|------|------|
| token | string | 邮件链接中的 `access_token` 参数（JWT） |
| password | string | 新密码，至少 6 位 |

**限流**：每 IP 每小时 **10** 次。

**成功响应**：`{"success": true}`

**失败响应**：`{"error":"重置失败，链接可能已过期"}`（400）

---

### 1.8 注销账号

**端点**：`POST /api/delete-account`（需登录）

**操作**：永久删除该用户及其所有站点（含存储文件），不可逆。

**限流**：每 IP 每小时 **3** 次。

**成功响应**：`{"success": true}`

---

## 2. 网站管理（需登录）

所有接口需携带 `Authorization: Bearer <access_token>`。

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
  "url": "https://page.goose.gs.cn/s/my-blog"
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

以下接口仅适用于 `type = "project"` 的站点，需要登录。

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

**响应（200）**：`{ "apiUrl": "https://page.goose.gs.cn" }`

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
| 401 | 未登录或 Token 无效 |
| 403 | 无权限（非所有者） |
| 404 | 资源不存在 |
| 409 | Slug 已被占用 |
| 429 | 触发限流（响应体含 `retryAfter` 秒数） |
| 500 | 服务器内部错误 |

### 限流明细

| 接口 | 限制 |
|------|------|
| `/api/register` | 每 IP 每小时 5 次（锁定 1 小时） |
| `/api/create` | 每 IP 每 60 秒 2 次（锁定 10 分钟） |
| `/auth/login` | 每 IP 每 60 秒 20 次 |
| `/auth/refresh` | 每 IP 每 60 秒 100 次 |
| `/api/update` | 每 IP 每 60 秒 10 次 |
| `/api/me` (PUT) | 每 IP 每 60 秒 20 次 |
| `/api/forgot-password` | IP 每小时 5 次 + 邮箱每小时 3 次 |
| `/api/reset-password` | 每 IP 每小时 10 次 |
| `/api/delete-account` | 每 IP 每小时 3 次 |
| `/api/file` (GET) | 每 IP 每 10 秒 10 次 |
| 其他 GET 接口 | 每 IP 每 60 秒 100 次 |

---

## 7. 补充说明

- **时区**：所有时间戳为 UTC（ISO 8601）。
- **Slug 唯一性**：三种站点类型共享同一命名空间。


<footer style="text-align: center; color: #888; font-size: 14px; padding: 20px 0; border-top: 1px solid #ddd;">
  <p>© 2026 GooseHost. </p>
  <p>
    <a href="https://host.goose.gs.cn/" style="color: #02ff8e; text-decoration: none;">官网</a> &nbsp;|&nbsp;
    <a href="mailto:support@mail.goose.gs.cn" style="color: #02ff8e; text-decoration: none;">联系我们</a>
  </p>
</footer>
