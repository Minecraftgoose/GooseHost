# GooseHost API 文档

> **更新时间**: 2026-07-02
>
> **API 基础地址**: `https://page.goose.cc.cd`
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
    "email": "your@email.com"
  }
}
```

**响应 400**: `{ "error": "邮箱或密码格式不正确" }`

> 获取到的 `access_token` 即为后续 API 请求中的 `Authorization: Bearer <token>`。

### 注册
```
POST /auth/signup
Content-Type: application/json

{
  "email": "new@email.com",
  "password": "yourpassword"
}
```

**响应 200**: `{ "success": true, "message": "验证邮件已发送，请查收" }`
**响应 400**: `{ "error": "暂不支持该临时邮箱，请使用真实邮箱" }` 或其他校验错误

---

以后所有网站管理接口带上 Token：
```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

---

## 网站类型

GooseHost 支持两种网站类型：

| 类型 | 创建方式 | 访问路径 | 内容格式 |
|------|----------|----------|----------|
| HTML 网站 | `html` 字段 | `/s/<slug>` | 完整 HTML 代码 |
| Markdown 网站 | `md` 字段 | `/md/<slug>` | Markdown 格式 |

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
  "url": "https://page.goose.cc.cd/s/my-site"
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
  "url": "https://page.goose.cc.cd/md/my-doc"
}
```

> 注意：Markdown 网站会自动添加 `md/` 前缀存储，访问 URL 使用 `/md/` 路径

**slug 规则**：1-64 字符，只允许中文、英文、数字、`_` `-` `.` `~`

**内容限制**：
- HTML 内容：最大 500KB
- Markdown 内容：最大 500KB

**响应码**
| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 参数错误（如 slug 包含非法字符） |
| 401 | 未登录或 Token 无效 |
| 409 | 名称已被占用 |
| 429 | 限流（30次/分钟/IP） |

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
    "created_at": "2026-06-19T01:45:41.860125Z",
    "updated_at": "2026-06-19T02:00:00.000000Z",
    "ip_address": "12.34.56.78"
  },
  {
    "id": "...",
    "name": "md/my-doc",
    "created_at": "...",
    "updated_at": "..."
  }
]
```

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

## 访问网站

### HTML 网站
```
https://page.goose.cc.cd/s/my-site
```

### Markdown 网站
```
https://page.goose.cc.cd/md/my-doc
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
| 429 | 请求过于频繁（限流：30次/分钟/IP） |
| 5xx | 服务器内部错误 |

---

## 调用示例

### JavaScript
```javascript
const API_URL = 'https://page.goose.cc.cd';

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
console.log(data.url); // https://page.goose.cc.cd/s/my-site

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
console.log(mdData.url); // https://page.goose.cc.cd/md/my-doc

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

API_URL = 'https://page.goose.cc.cd'
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
  https://page.goose.cc.cd/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@email.com","password":"***"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 注册
curl -X POST https://page.goose.cc.cd/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@email.com","password":"***"}'

# 创建 HTML 网站
curl -X POST https://page.goose.cc.cd/api/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"my-site","html":"<h1>Hello</h1>"}'

# 创建 Markdown 网站
curl -X POST https://page.goose.cc.cd/api/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"my-doc","md":"# 标题\n\n内容"}'

# 获取网站列表
curl https://page.goose.cc.cd/api/my-sites \
  -H "Authorization: Bearer $TOKEN"

# 获取网站内容
curl https://page.goose.cc.cd/api/file/my-site \
  -H "Authorization: Bearer $TOKEN"
curl https://page.goose.cc.cd/api/file/md/my-doc \
  -H "Authorization: Bearer $TOKEN"

# 更新 HTML 网站
curl -X POST https://page.goose.cc.cd/api/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"my-site","html":"<h1>Updated!</h1>"}'

# 更新 Markdown 网站
curl -X POST https://page.goose.cc.cd/api/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"md/my-doc","md":"# 新标题\n\n新内容"}'

# 删除网站
curl -X POST https://page.goose.cc.cd/api/delete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"my-site"}'
curl -X POST https://page.goose.cc.cd/api/delete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"slug":"md/my-doc"}'
```
