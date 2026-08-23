import os
import sys
import json
import argparse
import re
import base64
import shutil
import tempfile
from pathlib import Path

import requests
from terminaltables import AsciiTable

try:
    from colorama import init, Fore, Back, Style, deinit
    init(convert=True, autoreset=True)
    HAS_COLORAMA = True
except ImportError:
    class Fore:
        RED = ''
        GREEN = ''
        YELLOW = ''
        BLUE = ''
        MAGENTA = ''
        CYAN = ''
        WHITE = ''
        BLACK = ''
        LIGHTRED_EX = ''
        LIGHTGREEN_EX = ''
        LIGHTYELLOW_EX = ''
        LIGHTBLUE_EX = ''
        LIGHTMAGENTA_EX = ''
        LIGHTCYAN_EX = ''
        LIGHTWHITE_EX = ''
        RESET = ''

    class Back:
        pass

    class Style:
        DIM = ''
        NORMAL = ''
        BRIGHT = ''
        RESET_ALL = ''

    def init(*args, **kwargs):
        pass

    def deinit():
        pass

    HAS_COLORAMA = False


class Colors:
    if HAS_COLORAMA:
        RED = Fore.RED
        GREEN = Fore.GREEN
        YELLOW = Fore.YELLOW
        BLUE = Fore.BLUE
        MAGENTA = Fore.MAGENTA
        CYAN = Fore.CYAN
        WHITE = Fore.WHITE
        LIGHT_RED = Fore.LIGHTRED_EX
        LIGHT_GREEN = Fore.LIGHTGREEN_EX
        LIGHT_YELLOW = Fore.LIGHTYELLOW_EX
        LIGHT_BLUE = Fore.LIGHTBLUE_EX
        LIGHT_MAGENTA = Fore.LIGHTMAGENTA_EX
        LIGHT_CYAN = Fore.LIGHTCYAN_EX
        LIGHT_WHITE = Fore.LIGHTWHITE_EX
        DIM = Style.DIM if hasattr(Style, 'DIM') else ''
        BOLD = Style.BRIGHT if hasattr(Style, 'BRIGHT') else ''
        RESET = Style.RESET_ALL if hasattr(Style, 'RESET_ALL') else ''
    else:
        RED = '\033[91m'
        GREEN = '\033[92m'
        YELLOW = '\033[93m'
        BLUE = '\033[94m'
        MAGENTA = '\033[95m'
        CYAN = '\033[96m'
        WHITE = '\033[97m'
        LIGHT_RED = '\033[91m'
        LIGHT_GREEN = '\033[92m'
        LIGHT_YELLOW = '\033[93m'
        LIGHT_BLUE = '\033[94m'
        LIGHT_MAGENTA = '\033[95m'
        LIGHT_CYAN = '\033[96m'
        LIGHT_WHITE = '\033[97m'
        DIM = '\033[2m'
        BOLD = '\033[1m'
        RESET = '\033[0m'


def c(text, color=None, bold=False, dim=False):
    if (not sys.stdout.isatty() or
        os.environ.get('NO_COLOR') or
        os.environ.get('ANSI_COLORS_DISABLED')):
        return text

    if not HAS_COLORAMA and (os.name == 'nt' and not os.getenv('TERM')):
        return text

    prefix = ""
    if bold:
        prefix += Colors.BOLD
    if dim:
        prefix += Colors.DIM
    if color:
        prefix += color

    if prefix:
        return f"{prefix}{text}{Colors.RESET}"
    return text


# ---------- 配置 ----------
DEFAULT_API = "https://page.goose.gs.cn"


def build_visit_url(api_base, slug, site_type):
    paths = {"html": "/s/", "md": "/md/", "project": "/p/"}
    base = api_base.rstrip("/")
    return f"{base}{paths.get(site_type, '/s/')}{slug}"
CONFIG_DIR = Path.home() / ".goosehost"
TOKEN_FILE = CONFIG_DIR / "token"
USER_FILE = CONFIG_DIR / "user"

def ensure_config_dir():
    CONFIG_DIR.mkdir(mode=0o700, exist_ok=True)


def save_token(token, user=None):
    ensure_config_dir()
    with open(TOKEN_FILE, "w") as f:
        f.write(token)
    if user:
        with open(USER_FILE, "w") as f:
            json.dump(user, f)


def load_token():
    if TOKEN_FILE.exists():
        with open(TOKEN_FILE) as f:
            return f.read().strip()
    return None


def load_user():
    if USER_FILE.exists():
        with open(USER_FILE) as f:
            return json.load(f)
    return None


def clear_auth():
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()
    if USER_FILE.exists():
        USER_FILE.unlink()


def get_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def api_request(method, url, token=None, json_data=None, timeout=30):
    headers = {}
    if token:
        headers.update(get_headers(token))
    else:
        headers["Content-Type"] = "application/json"

    try:
        if method.upper() == "GET":
            resp = requests.get(url, headers=headers, timeout=timeout)
        elif method.upper() == "POST":
            resp = requests.post(url, headers=headers, json=json_data, timeout=timeout)
        else:
            raise ValueError("Unsupported method")

        if resp.status_code == 401:
            clear_auth()
            print(c("[FAIL] 登录已过期，请重新执行 login", Colors.RED))
            sys.exit(1)
        return resp
    except requests.exceptions.Timeout:
        print(c("[FAIL] 请求超时，请检查网络连接", Colors.RED))
        sys.exit(1)
    except Exception as e:
        print(c(f"[FAIL] 请求错误: {e}", Colors.RED))
        sys.exit(1)


def require_token():
    token = load_token()
    if not token:
        print(c("[FAIL] 未登录，请先执行 login", Colors.RED))
        sys.exit(1)
    return token


def get_site_type(api, token, slug):
    resp = api_request("GET", f"{api}/api/my-sites", token=token)
    if resp.status_code != 200:
        return None
    sites = resp.json()
    for s in sites:
        if s.get("name") == slug:
            return s.get("type")
    return None


def print_table(headers, rows):
    if not rows:
        return
    
    table_data = [headers] + rows
    table = AsciiTable(table_data)
    print(table.table)


def print_help():
    print("")
    print(c("GooseHost CLI", Colors.BOLD + Colors.CYAN))
    print(c("快速托管网站", Colors.DIM))
    print("")
    print(c("  " + "-" * 50, Colors.DIM))
    print("使用本产品前，请阅读:")
    print(c("https://host.goose.gs.cn/docs/", Colors.BLUE))
    print("")
    print("开始你的第一步:")
    print(c("goosehost login --email 你的邮箱 --password 你的密码", Colors.YELLOW))
    print("")
    print(c("  " + "-" * 50, Colors.DIM))
    print("查看全部命令:")
    print(c("goosehost --help", Colors.DIM))
    print("更详细命令解答:")
    print(c("https://page.goose.gs.cn/md/cli/", Colors.DIM))
    print("官网:")
    print(c("https://host.goose.gs.cn/", Colors.DIM))
    print("GooseCode:")
    print(c("https://goosecode.surge.sh/", Colors.DIM))
    print("")


def print_error(msg):
    print(c(f"[FAIL] {msg}", Colors.RED))


def print_success(msg):
    print(c(f"[OK] {msg}", Colors.GREEN))


def print_info(msg):
    print(c(msg, Colors.CYAN))


def print_warning(msg):
    print(c(msg, Colors.YELLOW))


# ---------- 子命令 ----------
def cmd_register(args):
    print_info("正在注册新账号...")
    try:
        resp = api_request("POST", f"{args.api}/api/register", json_data={
            "email": args.email,
            "password": args.password,
            "nickname": args.nickname
        })
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                print_success("注册成功！验证邮件已发送，请查收。")
            else:
                print_error(f"注册失败: {data.get('message', resp.text)}")
        else:
            try:
                err = resp.json()
                print_error(f"注册失败: {err.get('error', err.get('message', resp.text))}")
            except:
                print_error(f"注册失败: {resp.text}")
    except Exception as e:
        print_error(f"注册异常: {e}")
        sys.exit(1)


def cmd_login(args):
    print_info("正在登录...")
    try:
        resp = api_request("POST", f"{args.api}/auth/login", json_data={
            "email": args.email,
            "password": args.password
        })
        if resp.status_code != 200:
            try:
                err = resp.json()
                print_error(f"登录失败: {err.get('error', err.get('message', resp.text))}")
            except:
                print_error(f"登录失败: {resp.text}")
            sys.exit(1)

        data = resp.json()
        token = data.get("access_token")
        user = data.get("user")
        if not token:
            print_error("登录响应缺少 token")
            sys.exit(1)
        save_token(token, user)
        print_success(f"登录成功！欢迎回来，{user.get('email', args.email)}")
    except Exception as e:
        print_error(f"登录异常: {e}")
        sys.exit(1)


def cmd_reset_password(args):
    print_info("正在重置密码...")
    try:
        resp = api_request("POST", f"{args.api}/api/reset-password", json_data={
            "token": args.token,
            "password": args.password
        })
        if resp.status_code == 200:
            print_success("密码重置成功！请使用新密码登录。")
        else:
            try:
                err = resp.json()
                print_error(f"重置失败: {err.get('error', err.get('message', resp.text))}")
            except:
                print_error(f"重置失败: {resp.text}")
    except Exception as e:
        print_error(f"重置异常: {e}")
        sys.exit(1)


def cmd_list(args):
    token = require_token()
    resp = api_request("GET", f"{args.api}/api/my-sites", token=token)
    if resp.status_code != 200:
        print_error(f"获取列表失败: {resp.text}")
        sys.exit(1)

    sites = resp.json()
    if not sites:
        print_warning("还没有创建任何网站，试试 goosehost create")
        return

    headers = ["名称", "类型", "访问量"]
    rows = []
    for s in sites:
        name = s.get("name", "")
        site_type = s.get("type", "html")
        visit_count = str(s.get("visit_count", 0))
        rows.append([name, site_type, visit_count])

    print_table(headers, rows)


def cmd_list_files(args):
    token = require_token()
    slug = args.slug
    resp = api_request("GET", f"{args.api}/api/site-files/{slug}", token=token)
    if resp.status_code != 200:
        print_error(f"获取文件列表失败: {resp.text}")
        sys.exit(1)

    data = resp.json()
    files = data.get("files", [])

    if not files:
        print_warning(f"站点 {slug} 没有文件")
        return

    print_info(f"站点 {slug} 的文件列表 (共 {len(files)} 个文件):")
    print("")

    headers = ["文件名", "大小"]
    rows = []
    for f in files:
        name = f.get("name", "")
        size = f.get("size", 0)
        if size < 1024:
            size_str = f"{size} B"
        elif size < 1024 * 1024:
            size_str = f"{size / 1024:.1f} KB"
        else:
            size_str = f"{size / (1024 * 1024):.1f} MB"
        rows.append([name, size_str])

    print_table(headers, rows)


def cmd_download(args):
    token = require_token()
    slug = args.slug
    path = args.path or "index.html"

    print_info(f"正在下载 {slug}/{path} ...")
    resp = api_request("GET", f"{args.api}/api/proj-file/{slug}/{path}", token=token)

    if resp.status_code != 200:
        print_error(f"下载失败: {resp.text}")
        sys.exit(1)

    data = resp.json()
    content = data.get("content", "")
    name = data.get("name", "index.html")

    if args.output:
        output_path = Path(args.output)
    else:
        output_path = Path(name)

    output_path.write_text(content, encoding="utf-8")
    print_success(f"文件已保存到 {output_path}")


def cmd_create(args):
    token = require_token()

    if args.type == "project":
        if not args.file or not Path(args.file).is_dir():
            print_error("project 类型需要指定一个目录 (--file)")
            sys.exit(1)

        dir_path = Path(args.file)
        slug = args.slug

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            zip_path = tmp.name

        print_info(f"正在打包目录 {dir_path} ...")
        shutil.make_archive(zip_path.replace('.zip', ''), 'zip', dir_path)

        with open(zip_path, "rb") as f:
            zip_b64 = base64.b64encode(f.read()).decode()

        Path(zip_path).unlink()

        print_info("正在上传压缩包...")
        payload = {
            "slug": slug,
            "type": "project",
            "zip": zip_b64
        }
    else:
        content = ""
        if args.file:
            try:
                with open(args.file, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception as e:
                print_error(f"读取文件失败: {e}")
                sys.exit(1)
        elif args.content:
            content = args.content
        else:
            print_error("必须指定 --file 或 --content")
            sys.exit(1)

        if not content:
            print_error("内容为空")
            sys.exit(1)

        payload = {"slug": args.slug}
        if args.type == "md":
            payload["md"] = content
        else:
            payload["html"] = content

    resp = api_request("POST", f"{args.api}/api/create", token=token, json_data=payload)

    if resp.status_code == 409:
        print_error("创建失败: 该站点名称已被占用")
        sys.exit(1)

    if resp.status_code != 200:
        try:
            err = resp.json()
            print_error(f"创建失败: {err.get('error', err.get('message', resp.text))}")
        except:
            print_error(f"创建失败: {resp.text}")
        sys.exit(1)

    data = resp.json()
    if data.get("success"):
        site_type = "md" if args.type == "md" else "html"
        print_success("创建成功！")
        print(c("访问地址:", Colors.CYAN))
        print(f"  {c(build_visit_url(args.api, args.slug, site_type), Colors.CYAN)}")
        print(c("网站名称:", Colors.CYAN))
        print(f"  {c(data.get('name'), Colors.YELLOW)}")
    else:
        print_error(f"创建失败: {data}")


def cmd_get(args):
    token = require_token()
    slug = args.slug

    if slug.startswith("md/"):
        slug = slug[3:]
        print_warning(f"检测到 md/ 前缀，自动修正为: {slug}")

    resp = api_request("GET", f"{args.api}/api/file/{slug}", token=token)
    if resp.status_code != 200:
        print_error(f"获取失败: {resp.text}")
        sys.exit(1)

    data = resp.json()
    content = data.get("html") or data.get("md") or ""

    if args.output:
        try:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(content)
            print_success(f"已保存到 {args.output}")
        except Exception as e:
            print_error(f"保存文件失败: {e}")
            sys.exit(1)
    else:
        print_info(f"站点 {slug} 的内容:")
        print("")
        print(content)


def cmd_update(args):
    token = require_token()
    slug = args.slug

    if slug.startswith("md/"):
        slug = slug[3:]
        print_warning(f"检测到 md/ 前缀，自动修正为: {slug}")

    content = ""
    if args.file:
        try:
            with open(args.file, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            print_error(f"读取文件失败: {e}")
            sys.exit(1)
    elif args.content:
        content = args.content
    else:
        print_error("必须指定 --file 或 --content")
        sys.exit(1)

    if not content:
        print_error("内容为空")
        sys.exit(1)

    site_type = get_site_type(args.api, token, slug)
    payload = {"slug": slug}
    if site_type == "md":
        payload["md"] = content
    else:
        payload["html"] = content

    resp = api_request("POST", f"{args.api}/api/update", token=token, json_data=payload)
    if resp.status_code != 200:
        try:
            err = resp.json()
            print_error(f"更新失败: {err.get('error', err.get('message', resp.text))}")
        except:
            print_error(f"更新失败: {resp.text}")
        sys.exit(1)

    data = resp.json()
    if data.get("success"):
        print_success("更新成功！")
    else:
        print_error(f"更新失败: {data}")


def cmd_delete(args):
    token = require_token()
    slug = args.slug

    if slug.startswith("md/"):
        slug = slug[3:]
        print_warning(f"检测到 md/ 前缀，自动修正为: {slug}")

    if not args.force:
        print_warning(f"确定要删除站点 {slug} 吗？此操作不可恢复！")
        confirm = input("输入 yes 确认: ")
        if confirm.lower() != "yes":
            print_warning("操作已取消")
            return

    resp = api_request("POST", f"{args.api}/api/delete", token=token, json_data={"slug": slug})
    if resp.status_code != 200:
        try:
            err = resp.json()
            print_error(f"删除失败: {err.get('error', err.get('message', resp.text))}")
        except:
            print_error(f"删除失败: {resp.text}")
        sys.exit(1)

    data = resp.json()
    if data.get("success"):
        print_success("删除成功！")
    else:
        print_error(f"删除失败: {data}")


def cmd_config(args):
    token = load_token()
    user = load_user()
    print("")
    print(c("GooseHost 配置信息", Colors.BOLD + Colors.CYAN))
    print("API 地址:")
    print(f"  {c(args.api or DEFAULT_API, Colors.YELLOW)}")
    print("登录状态:")
    if token:
        print(f"  {c('已登录', Colors.GREEN)}")
    else:
        print(f"  {c('未登录', Colors.RED)}")
    if user:
        print("当前用户:")
        print(f"  {c(user.get('email', ''), Colors.YELLOW)}")
        print("用户昵称:")
        print(f"  {c(user.get('nickname', '未设置'), Colors.YELLOW)}")
    if token:
        print("Token:")
        print(f"  {c(token[:10] + '...', Colors.DIM)}")
    print("")


def cmd_logout(args):
    print_warning("确定要退出登录吗？(y/N)")
    confirm = input().strip().lower()
    if confirm in ("y", "yes"):
        clear_auth()
        print_success("已退出登录")


def cmd_deploy(args):
    token = require_token()
    target = Path(args.path)

    if not target.exists():
        print_error(f"路径 '{args.path}' 不存在")
        sys.exit(1)

    if target.is_file():
        ext = target.suffix.lower()
        if ext in ('.html', '.htm'):
            site_type = 'html'
        elif ext in ('.md', '.markdown'):
            site_type = 'md'
        else:
            print_error("仅支持 .html、.md 文件或目录")
            sys.exit(1)

        try:
            with open(target, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print_error(f"读取文件失败: {e}")
            sys.exit(1)

        if not content:
            print_error("文件内容为空")
            sys.exit(1)

        slug = args.slug
        if not slug:
            slug = re.sub(r'[^a-zA-Z0-9_\-.~]', '-', target.stem)
            if not slug:
                slug = 'my-site'
            print_warning(f"未指定 --slug，自动生成: {slug}")

        payload = {"slug": slug}
        if site_type == "md":
            payload["md"] = content
        else:
            payload["html"] = content

        print_info(f"正在部署 {target.name} ...")
        resp = api_request("POST", f"{args.api}/api/create", token=token, json_data=payload)

        if resp.status_code == 409:
            print_error(f"部署失败: 站点名称 '{slug}' 已被占用")
            sys.exit(1)

        if resp.status_code != 200:
            try:
                err = resp.json()
                print_error(f"部署失败: {err.get('error', err.get('message', resp.text))}")
            except:
                print_error(f"部署失败: {resp.text}")
            sys.exit(1)

        data = resp.json()
        if data.get("success"):
            print_success("部署成功！")
            print(c("访问地址:", Colors.CYAN))
            print(f"  {c(build_visit_url(args.api, slug, site_type), Colors.CYAN)}")
            print(c("网站名称:", Colors.CYAN))
            print(f"  {c(slug, Colors.YELLOW)}")
        else:
            print_error(f"部署失败: {data}")

    elif target.is_dir():
        slug = args.slug
        if not slug:
            slug = re.sub(r'[^a-zA-Z0-9_\-.~]', '-', target.name)
            if not slug:
                slug = 'my-app'
            print_warning(f"未指定 --slug，自动生成: {slug}")

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            zip_path = tmp.name

        print_info(f"正在打包目录 {target.name} ...")
        shutil.make_archive(zip_path.replace('.zip', ''), 'zip', target)

        with open(zip_path, "rb") as f:
            zip_b64 = base64.b64encode(f.read()).decode()

        Path(zip_path).unlink()

        print_info("正在上传压缩包...")
        payload = {
            "slug": slug,
            "type": "project",
            "zip": zip_b64
        }

        resp = api_request("POST", f"{args.api}/api/create", token=token, json_data=payload)

        if resp.status_code == 409:
            print_error(f"部署失败: 站点名称 '{slug}' 已被占用")
            sys.exit(1)

        if resp.status_code != 200:
            try:
                err = resp.json()
                print_error(f"部署失败: {err.get('error', err.get('message', resp.text))}")
            except:
                print_error(f"部署失败: {resp.text}")
            sys.exit(1)

        data = resp.json()
        if data.get("success"):
            print_success("部署成功！")
            print(c("访问地址:", Colors.CYAN))
            print(f"  {c(build_visit_url(args.api, slug, 'project'), Colors.CYAN)}")
            print(c("网站名称:", Colors.CYAN))
            print(f"  {c(slug, Colors.YELLOW)}")
            print(c("类型:", Colors.CYAN))
            print(f"  {c('多文件站点 (beta)', Colors.YELLOW)}")
        else:
            print_error(f"部署失败: {data}")
    else:
        print_error(f"路径 '{args.path}' 不是有效的文件或目录")
        sys.exit(1)


# ---------- 主入口 ----------
def main():
    if len(sys.argv) == 1:
        print_help()
        sys.exit(0)

    parser = argparse.ArgumentParser(
        description="GooseHost-CLI",
        epilog="更详细命令请访问 https://page.goose.gs.cn/md/cli/"
    )
    parser.add_argument("--api", default=DEFAULT_API, help="API 基础地址")
    subparsers = parser.add_subparsers(dest="command", required=True, help="子命令")

    p_register = subparsers.add_parser("register", help="注册新账号")
    p_register.add_argument("--email", required=True, help="邮箱")
    p_register.add_argument("--password", required=True, help="密码")
    p_register.add_argument("--nickname", required=True, help="昵称 (2-20 字符，支持中英文、数字、空格、_、-)")

    p_login = subparsers.add_parser("login", help="登录并保存凭证")
    p_login.add_argument("--email", required=True, help="邮箱")
    p_login.add_argument("--password", required=True, help="密码")

    p_reset = subparsers.add_parser("reset-password", help="使用邮件中的 token 重置密码")
    p_reset.add_argument("--token", required=True, help="邮件中的 access_token")
    p_reset.add_argument("--password", required=True, help="新密码")

    p_list = subparsers.add_parser("list", help="列出我的网站")

    p_list_files = subparsers.add_parser("list-files", help="列出多文件站点的文件")
    p_list_files.add_argument("--slug", required=True, help="站点名称")

    p_download = subparsers.add_parser("download", help="下载多文件站点中的文件")
    p_download.add_argument("--slug", required=True, help="站点名称")
    p_download.add_argument("--path", help="文件路径 (默认: index.html)")
    p_download.add_argument("--output", "-o", help="保存到指定文件")

    p_create = subparsers.add_parser("create", help="创建网站")
    p_create.add_argument("--slug", required=True, help="网站名称 (1-64 字符，仅允许 a-zA-Z0-9_-.~)")
    p_create.add_argument("--type", choices=["html", "md", "project"], default="html", help="网站类型")
    p_create.add_argument("--file", help="从文件读取内容 (html/md) 或指定目录 (project)")
    p_create.add_argument("--content", help="直接指定内容 (html/md)")

    p_get = subparsers.add_parser("get", help="获取网站内容")
    p_get.add_argument("--slug", required=True, help="网站名称")
    p_get.add_argument("--output", "-o", help="保存到文件")

    p_update = subparsers.add_parser("update", help="更新网站内容")
    p_update.add_argument("--slug", required=True, help="网站名称")
    p_update.add_argument("--file", help="从文件读取内容")
    p_update.add_argument("--content", help="直接指定内容")

    p_delete = subparsers.add_parser("delete", help="删除网站")
    p_delete.add_argument("--slug", required=True, help="网站名称")
    p_delete.add_argument("--force", action="store_true", help="强制删除，无需确认")

    p_config = subparsers.add_parser("config", help="查看本地配置和登录状态")

    p_logout = subparsers.add_parser("logout", help="清除本地凭证")

    p_deploy = subparsers.add_parser("deploy", help="部署本地文件或目录到 GooseHost")
    p_deploy.add_argument("path", help="要部署的本地文件 (.html/.md) 或目录 (自动打包为 project)")
    p_deploy.add_argument("--slug", help="自定义网站名称，不指定则自动从文件名生成")

    args = parser.parse_args()

    if args.command == "register":
        cmd_register(args)
    elif args.command == "login":
        cmd_login(args)
    elif args.command == "reset-password":
        cmd_reset_password(args)
    elif args.command == "list":
        cmd_list(args)
    elif args.command == "list-files":
        cmd_list_files(args)
    elif args.command == "download":
        cmd_download(args)
    elif args.command == "create":
        cmd_create(args)
    elif args.command == "get":
        cmd_get(args)
    elif args.command == "update":
        cmd_update(args)
    elif args.command == "delete":
        cmd_delete(args)
    elif args.command == "config":
        cmd_config(args)
    elif args.command == "logout":
        cmd_logout(args)
    elif args.command == "deploy":
        cmd_deploy(args)


if __name__ == "__main__":
    main()