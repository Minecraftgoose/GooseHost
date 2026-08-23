
<p style="text-align: center;"><img src="https://host.goose.gs.cn/logo.svg" alt="GooseHost Logo" style="height:auto; width:auto;"></p>

<h1 style="text-align: center;">CLI文档</h1>

在终端里管理 GooseHost 的静态网站，不需要开浏览器。

* * *

## 安装

```bash
pip install goosehost-cli
```

安装后，在终端输入 `goosehost` 就可以用了。

升级到最新版：

```bash
pip install --upgrade goosehost-cli
```

国内镜像可能有延迟，临时从官方源安装：

```bash
pip install -i https://pypi.org/simple goosehost-cli
```

* * *

## 快速开始

### 1. 登录

```bash
goosehost login --email 你的邮箱 --password 你的密码
```

登录后凭证保存在本地，下次不用再输入。

### 2. 部署一个文件

```bash
goosehost deploy ./index.html
```

工具会自动用文件名作为站点名称，并在终端显示访问地址。

### 3. 查看所有站点

```bash
goosehost list
```

* * *

## 完整命令列表

### 账号

命令 | 说明
--- | ---
`goosehost register --email <邮箱> --password <密码> --nickname <昵称>` | 注册新账号
`goosehost login --email <邮箱> --password <密码>` | 登录并保存凭证
`goosehost reset-password --token <邮件token> --password <新密码>` | 用邮件中的 token 重置密码
`goosehost logout` | 退出登录（清除本地凭证）

### 站点管理

命令 | 说明
--- | ---
`goosehost list` | 列出你的所有站点
`goosehost create --slug <名称> --type html --file <文件>` | 从文件创建 HTML 站点
`goosehost create --slug <名称> --type md --content "<内容>"` | 从文字创建 Markdown 站点
`goosehost create --slug <名称> --type project --file <目录>` | 从目录创建多文件站点
`goosehost get --slug <名称>` | 查看站点内容（直接打印）
`goosehost get --slug <名称> --output <路径>` | 下载内容到本地文件
`goosehost update --slug <名称> --file <文件>` | 用本地文件更新
`goosehost update --slug <名称> --content "<内容>"` | 直接更新内容
`goosehost delete --slug <名称> --force` | 删除站点（需要加 `--force`）

### 快捷部署

命令 | 说明
--- | ---
`goosehost deploy ./文件.html` | 部署 HTML 文件（自动起名）
`goosehost deploy ./文件.md` | 部署 Markdown 文件（自动起名）
`goosehost deploy ./目录/` | 部署目录（自动打包为多文件站点）
`goosehost deploy ./文件.html --slug <名称>` | 部署并指定站点名称

### 其他

命令 | 说明
--- | ---
`goosehost config` | 查看当前登录状态和配置
`goosehost --help` | 查看所有命令的帮助

* * *

## 多文件站点（beta）

`project` 类型用于托管包含多个文件的网站，例如带 CSS/JS 的页面或静态前端项目。整个目录会被打包成 zip 上传，目录里的 `index.html` 作为站点入口。

### 创建

```bash
goosehost create --slug <名称> --type project --file ./my-project/
```

或用 deploy 直接部署目录（自动识别为 project 类型）：

```bash
goosehost deploy ./my-project/
```

### 查看文件列表

```bash
goosehost list-files --slug <名称>
```

列出该站点所有文件及大小。

### 下载单个文件

```bash
goosehost download --slug <名称> --path css/style.css --output ./style.css
```

不写 `--path` 时默认下载 `index.html`。

### 更新

修改本地目录后，重新部署整个目录即可。若提示名称已被占用（409），先删除再部署：

```bash
goosehost delete --slug <名称> --force
goosehost deploy ./my-project/
```

> project 为 beta 功能。`update` 命令对多文件站点的支持尚未完全验证，建议用上面的「删除后重新部署」流程来更新。

### 访问

部署成功后会输出访问地址，类型会标注为「多文件站点」。

* * *

## 文件路径怎么写

在命令中，所有 `--file` 和 `--output` 后面的路径都支持两种写法：

- **相对路径**：相对于当前终端所在的目录
  例如：`./index.html`、`backup.html`、`../my-site/index.html`
- **绝对路径**：从磁盘根目录开始的完整路径
  例如：`D:/my-site/index.html`、`C:\Users\Administrator\backup.html`

如果不确定当前终端在哪个目录，可以输入：

- Windows：`cd`
- Mac/Linux：`pwd`

* * *

## 常用操作示例

### 部署当前文件夹里的首页

```bash
goosehost deploy ./index.html
```

输出示例：

```text
部署成功！
  访问地址: https://page.goose.gs.cn/...
  网站名称: my-site
```

（具体访问地址以终端实际输出为准）

### 直接用文字创建一个 Markdown 站点

```bash
goosehost create --slug my-doc --type md --content "# 我的文档

这是内容"
```

### 把线上站点下载到本地修改

**第一步：下载到当前目录**

```bash
goosehost get --slug my-site --output backup.html
```

当前目录会多出一个 `backup.html` 文件。想保存到其他文件夹就写完整路径：

```bash
goosehost get --slug my-site --output D:/my-backup/index.html
```

**第二步：用编辑器修改 `backup.html`**

**第三步：传回去**

```bash
goosehost update --slug my-site --file backup.html
```

文件在其他路径就填完整路径：

```bash
goosehost update --slug my-site --file D:/my-backup/index.html
```

### 查看站点内容（不保存，只显示）

```bash
goosehost get --slug my-site
```

终端会直接打印出站点的全部内容。

### 删除一个站点

```bash
goosehost delete --slug my-site --force
```

* * *

## 卸载

```bash
pip uninstall goosehost-cli
```

* * *

## 常见问题

### 登录后每次都要重新登录吗？

不用。凭证保存在本地，下次打开终端会自动生效。

### 安装后输入 goosehost 提示找不到命令？

重启终端。如果还不行，检查 Python 的 Scripts 目录是否在系统 PATH 里。

### pip install goosehost-cli 安装的不是最新版？

国内镜像可能有延迟，临时从官方源安装：

```bash
pip install -i https://pypi.org/simple --upgrade goosehost-cli
```

### --output 不填会怎样？

内容会直接打印在终端，不会保存成文件。

### 为什么删除站点必须加 --force？

防止手滑误删。确认你真的要删，再加 `--force`。

### slug 有什么限制？

长度 1–64 字符，仅允许字母、数字以及 `_ - . ~` 这几个符号。

### Markdown 站点和 HTML 站点怎么区分？

创建时用 `--type md` 或 `--type html` 区分。之后查看、更新时直接写 `--slug <名称>` 即可，CLI 会自动判断站点类型，不需要加 `md/` 前缀（`md/` 前缀的旧写法仍然兼容，会自动修正）。

<footer style="text-align: center; color: #888; font-size: 14px; padding: 20px 0; border-top: 1px solid #ddd;">
  <p>© 2026 GooseHost. </p>
  <p>
    <a href="https://host.goose.gs.cn/" style="color: #02ff8e; text-decoration: none;">官网</a> &nbsp;|&nbsp;
    <a href="mailto:support@goose2.cc.cd" style="color: #02ff8e; text-decoration: none;">联系我们</a>
  </p>
</footer>