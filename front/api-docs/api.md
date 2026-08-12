# GooseHost API 文档

> **更新时间**: 2026-08-06
>
> **API 基础地址**: `https://page.goose.gs.cn`
>
> **覆盖功能**：HTML / Markdown / 多文件网站，账号昵称、找回密码、注销账号、公告与全站统计
>

---

## 认证


### 登录
```
POST /auth/login
Content-Type: application/json

{
  "email": "your@email.com",
  "password": "yourpassword"
}
```

**响应 200**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": "b34e5979-...",
    "email": "your@email.com",
    "nickname": "我的昵称"
  }
}
```

**响应 400**: `{ "error": "邮箱或密码格式不正确" }`

> 获取到的 `access_token` 即为后续 API 请求中的 `Authorization: Bearer <token>`。

### 注册
```
POST /api/register
Content-Type: application/json

{
  "email": "new@email.com",
  "password": "yourpassword",
  "nickname": "我的昵称"
}
```

**参数说明**
| 字段 | 必填 | 说明 |
|------|------|------|
| email | 是 | 邮箱地址，需真实邮箱（临时邮箱域名被拦截） |
| password | 是 | 密码 |
| nickname | 是 | 昵称，2-20 个字符，支持中文、字母、数字、`_` `-` 空格 |

**响应 200**: `{ "success": true, "message": "验证邮件已发送，请查收" }`
**响应 400**: `{ "error": "昵称不能为空" }`、`{ "error": "暂不支持该临时邮箱，请使用真实邮箱" }` 等

---

以后所有网站管理接口带上 Token：
```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

---

## 网站类型

GooseHost 支持三种网站类型：

| 类型 | 创建方式 | 访问路径 | 内容格式 |
|------|----------|----------|----------|
| HTML 网站 | `html` 字段 | `/s/<slug>` | 完整 HTML 代码 |
| Markdown 网站 | `md` 字段 | `/md/<slug>` | Markdown 格式 |
| 多文件网站 | `zip` 字段（base64） | `/p/<slug>` | zip 压缩包（代码/文本文件） |

---

## 创建网站

### 创建 HTML 网站
```
POST /api/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "slug": "my-site",
  "html": "<!DOCTYPE html><html><body><h1>Hello</h1></body></html>"
}
```

**响应 200**
```json
{
  "success": true,
  "name": "my-site",
  "url": "https://page.goose.gs.cn/s/my-site"
}
```

### 创建 Markdown 网站
```
POST /api/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "slug": "my-doc",
  "md": "# 标题\n\n内容"
}
```

**响应 200**
```json
{
  "success": true,
  "name": "md/my-doc",
  "url": "https://page.goose.gs.cn/md/my-doc"
}
```

> 注意：Markdown 网站会自动添加 `md/` 前缀存储，访问 URL 使用 `/md/` 路径

### 创建多文件网站（zip 压缩包）
```
POST /api/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "slug": "my-app",
  "zip": "<zip 文件的 base64 编码>"
}
```

**响应 200**
```json
{
  "success": true,
  "name": "my-app",
  "url": "https://page.goose.gs.cn/p/my-app"
}
```

**zip 包要求**
- 压缩包内只支持代码/文本文件：`html htm css js mjs cjs md markdown json txt svg xml yml yaml toml ini conf cfg csv ts tsx jsx py c cpp h java go rs sh vue svelte wasm` 等
- 需包含 `index.html` 或 `index.md` 作为入口
- 单文件 ≤ 200KB，总大小 ≤ 2MB，最多 50 个文件
- 图片、视频、音频、压缩包等二进制资源不支持（白名单拦截）

**访问**：`https://page.goose.gs.cn/p/my-app` 或 `/p/my-app/<路径>`（如 `/p/my-app/join/index.html`）

---

**slug 规则**：1-64 字符，只允许中文、英文、数字、`_` `-` `.` `~`

**内容限制**：
- HTML 内容：最大 500KB
- Markdown 内容：最大 500KB
- 多文件 zip：单文件 ≤200KB，总 ≤2MB，最多 50 个文件

**响应码**
| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 参数错误（如 slug 包含非法字符、zip 解压失败、文件类型不允许） |
| 401 | 未登录或 Token 无效 |
| 409 | 名称已被占用 |
| 429 | 限流（创建：每 IP 每 60 秒 2 次） |

---

### 获取我的网站列表
```
GET /api/my-sites
Authorization: Bearer <token>
```

**响应 200**
```json
[
  {
    "id": "51b380e5-d298-4d7a-9099-8f7712e3a49f",
    "name": "my-site",
    "type": "html",
    "visit_count": 128,
    "created_at": "2026-06-19T01:45:41.860125Z",
    "updated_at": "2026-06-19T02:00:00.000000Z",
    "ip_address": "12.34.56.78"
  },
  {
    "id": "...",
    "name": "my-doc",
    "type": "md",
    "visit_count": 56,
    "created_at": "...",
    "updated_at": "..."
  },
  {
    "id": "...",
    "name": "my-app",
    "type": "project",
    "visit_count": 89,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

---

### 多文件网站：获取文件列表
```
GET /api/site-files/<slug>
Authorization: Bearer <token>
```

**响应 200**
```json
{
  "site": {
    "name": "my-app",
    "type": "project",
    "owner_id": "de90a631-...",
    "visit_count": 89
  },
  "files": [
    { "name": "index.html", "size": 12463 },
    { "name": "join/index.html", "size": 36191 },
    { "name": "style.css", "size": 27927 }
  ]
}
```

### 多文件网站：文件级操作
文件路径需 URL 编码，支持多级目录（如 `join/index.html`）。

```
# 读取文件内容
GET /api/proj-file/<slug>/<路径>

# 写入/替换文件（body: { "content": "文件内容" }）
PUT /api/proj-file/<slug>/<路径>

# 删除文件
DELETE /api/proj-file/<slug>/<路径>
```

**PUT 响应 200**: `{ "success": true }`
**GET 响应 200**: `{ "name": "index.html", "content": "<内容>", "size": 12463 }`
**错误**：400 路径无效/类型不允许/超过 200KB，404 文件不存在，403 无权操作

---

### 获取网站内容
```
GET /api/file/<slug>
Authorization: Bearer <token>

# HTML 网站
GET /api/file/my-site

# Markdown 网站（slug 为 md/ 开头的完整名称）
GET /api/file/md/my-doc
```

**响应 200**
```json
// HTML 网站
{
  "html": "<!DOCTYPE html>..."
}

// Markdown 网站
{
  "md": "# 标题\n\n内容"
}
```

**响应 404**: 站点不存在或无权访问

---

### 更新网站内容
```
POST /api/update
Authorization: Bearer <token>
Content-Type: application/json

# 更新 HTML 网站
{
  "slug": "my-site",
  "html": "<!DOCTYPE html><html><body><h1>Updated!</h1></body></html>"
}

# 更新 Markdown 网站（slug 为 md/ 开头的完整名称）
{
  "slug": "md/my-doc",
  "md": "# 新标题\n\n新内容"
}
```

**响应 200**: `{ "success": true }`

---

### 删除网站
```
POST /api/delete
Authorization: Bearer <token>
Content-Type: application/json

# 删除 HTML 网站
{ "slug": "my-site" }

# 删除 Markdown 网站（slug 为 md/ 开头的完整名称）
{ "slug": "md/my-doc" }
```

**响应 200**: `{ "success": true }`

---

## 账号

### 获取当前用户信息
```
GET /api/me
Authorization: Bearer <token>
```

**响应 200**
```json
{
  "id": "b34e5979-...",
  "email": "your@email.com",
  "nickname": "我的昵称"
}
```

### 修改昵称
```
PUT /api/me
Authorization: Bearer <token>
Content-Type: application/json

{ "nickname": "新昵称" }
```

**响应 200**: `{ "success": true }`
**限制**：昵称 2-20 字符，支持中文、字母、数字、`_` `-` 空格

### 忘记密码（发送重置邮件）
```
POST /api/forgot-password
Content-Type: application/json

{ "email": "your@email.com" }
```

**响应 200**: `{ "success": true, "message": "重置邮件已发送，请查收" }`
**防刷**：每 IP 每小时 5 次，每邮箱每小时 3 次

### 重置密码
```
POST /api/reset-password
Content-Type: application/json

{
  "email": "your@email.com",
  "token": "<邮件中的重置 token>",
  "new_password": "newpassword123"
}
```

**响应 200**: `{ "success": true }`

### 注销账号
```
POST /api/delete-account
Authorization: Bearer <token>
```

**响应 200**: `{ "success": true, "message": "账号已注销" }`
**注意**：永久删除账号及全部站点，不可恢复。每 IP 每小时最多 3 次。

---

## 公开接口

以下接口无需登录。

### 获取公告
```
GET /api/announcement
```

**响应 200**
```json
{
  "announcement": "服务器将于周末维护",
  "created_at": "2026-08-01T12:00:00Z"
}
```
无公告时返回 `{ "announcement": null }`

### 全站统计
```
GET /api/stats
```

**响应 200**
```json
{
  "total_sites": 69,
  "total_visits": 1280
}
```

### 获取 API 地址配置
```
GET /api/config
```

**响应 200**: `{ "apiUrl": "https://page.goose.gs.cn" }`
> 前端可动态获取 API 地址，避免硬编码。

---

## 访问网站

### HTML 网站
```
https://page.goose.gs.cn/s/my-site
```

### Markdown 网站
```
https://page.goose.gs.cn/md/my-doc
```

Markdown 网站会自动渲染为带有标题导航的 HTML 页面。

---

## 错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未登录或 Token 无效 |
| 403 | 无权操作（无权修改/删除他人网站） |
| 404 | 站点不存在 |
| 409 | 站点名称已被占用 |
| 429 | 请求过于频繁（见下方限流说明） |
| 5xx | 服务器内部错误 |

**限流档位**

| 接口 | 限制 |
|------|------|
| 创建网站 `/api/create` | 每 IP 每 60 秒 2 次，超限锁定 10 分钟 |
| 注册 `/api/register` | 每 IP 每小时 5 次，超限锁定 1 小时 |
| 登录 `/auth/login` | 每 IP 每 60 秒 20 次 |
| 更新 `/api/update` | 每 IP 每 60 秒 10 次 |
| 修改昵称 `/api/me` (PUT) | 每 IP 每 60 秒 20 次 |
| 忘记密码 `/api/forgot-password` | 每 IP 每小时 5 次 + 每邮箱每小时 3 次 |
| 重置密码 `/api/reset-password` | 每 IP 每小时 10 次 |
| 注销 `/api/delete-account` | 每 IP 每小时 3 次 |
| 其他普通接口 | 每 IP 每 60 秒 100 次 |

---

## 调用示例

### JavaScript
```javascript
const API_URL = 'https://page.goose.gs.cn';

// 登录
const authRes = await fetch(API_URL + '/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'you@email.com', password: '***' })
});
const { access_token: token } = await authRes.json();
localStorage.setItem('sb_token', token);

// 注册
const regRes = await fetch(API_URL + '/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'you@email.com', password: '***' })
});
const regData = await regRes.json();

// 创建 HTML 网站
const res = await fetch(API_URL + '/api/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ slug: 'my-site', html: '<h1>Hello</h1>' })
});
const data = await res.json();
console.log(data.url); // https://page.goose.gs.cn/s/my-site

// 创建 Markdown 网站
const mdRes = await fetch(API_URL + '/api/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ slug: 'my-doc', md: '# 标题\n\n内容' })
});
const mdData = await mdRes.json();
console.log(mdData.url); // https://page.goose.gs.cn/md/my-doc

// 获取网站列表
const sites = await fetch(API_URL + '/api/my-sites', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

// 获取网站内容
const content = await fetch(API_URL + '/api/file/my-site', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

// 更新 HTML 网站
await fetch(API_URL + '/api/update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ slug: 'my-site', html: '<h1>Updated!</h1>' })
});

// 更新 Markdown 网站
await fetch(API_URL + '/api/update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ slug: 'md/my-doc', md: '# 新标题\n\n新内容' })
});

// 删除网站
await fetch(API_URL + '/api/delete', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ slug: 'my-site' })
});
```

### Python
```python
import requests

API_URL = 'https://page.goose.gs.cn'
HEADERS_JSON = {'Content-Type': 'application/json'}

# 登录
r = requests.post(f'{API_URL}/auth/login',
    json={'email': 'you@email.com', 'password': '***'})
token = r.json()['access_token']
HEADERS_API = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

# 注册
r = requests.post(f'{API_URL}/auth/signup',
    json={'email': 'you@email.com', 'password': '***'})
print(r.json())

# 创建 HTML 网站
r = requests.post(f'{API_URL}/api/create', json={
    'slug': 'my-site',
    'html': '<h1>Hello</h1>'
}, headers=HEADERS_API)
print(r.json())

# 创建 Markdown 网站
r = requests.post(f'{API_URL}/api/create', json={
    'slug': 'my-doc',
    'md': '# 标题\n\n内容'
}, headers=HEADERS_API)
print(r.json())

# 获取网站列表
r = requests.get(f'{API_URL}/api/my-sites', headers=HEADERS_API)

# 获取网站内容
r = requests.get(f'{API_URL}/api/file/my-site', headers=HEADERS_API)
r = requests.get(f'{API_URL}/api/file/md/my-doc', headers=HEADERS_API)

# 更新网站
requests.post(f'{API_URL}/api/update', json={
    'slug': 'my-site',
    'html': '<h1>Updated!</h1>'
}, headers=HEADERS_API)
requests.post(f'{API_URL}/api/update', json={
    'slug': 'md/my-doc',
    'md': '# 新标题\n\n新内容'
}, headers=HEADERS_API)

# 删除网站
requests.post(f'{API_URL}/api/delete', json={
    'slug': 'my-site'
}, headers=HEADERS_API)
requests.post(f'{API_URL}/api/delete', json={
    'slug': 'md/my-doc'
}, headers=HEADERS_API)
```

### curl
```bash
# 登录获取 token
TOKEN=$(curl -s -X POST \
  https://page.goose.gs.cn/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@email.com","password":"***"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 注册
curl -X POST https://page.goose.gs.cn/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@email.com","password":"***"}'

# 创建 HTML 网站
curl -X POST https://page.goose.gs.cn/api/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"my-site","html":"<h1>Hello</h1>"}'

# 创建 Markdown 网站
curl -X POST https://page.goose.gs.cn/api/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"my-doc","md":"# 标题\n\n内容"}'

# 获取网站列表
curl https://page.goose.gs.cn/api/my-sites \
  -H "Authorization: Bearer $TOKEN"

# 获取网站内容
curl https://page.goose.gs.cn/api/file/my-site \
  -H "Authorization: Bearer $TOKEN"
curl https://page.goose.gs.cn/api/file/md/my-doc \
  -H "Authorization: Bearer $TOKEN"

# 更新 HTML 网站
curl -X POST https://page.goose.gs.cn/api/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"my-site","html":"<h1>Updated!</h1>"}'

# 更新 Markdown 网站
curl -X POST https://page.goose.gs.cn/api/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"md/my-doc","md":"# 新标题\n\n新内容"}'

# 删除网站
curl -X POST https://page.goose.gs.cn/api/delete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"my-site"}'
curl -X POST https://page.goose.gs.cn/api/delete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"md/my-doc"}'
```
