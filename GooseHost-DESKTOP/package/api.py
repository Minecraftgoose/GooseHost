# ============================================================
# api.py — 网络请求、Token 持久化、后台线程
# ============================================================
import requests
import json
import threading
from pathlib import Path

API_URL = None          # 由 gui 启动时注入
TOKEN  = None           # {"v": token_str}  可变容器
USER   = None           # {"v": user_dict}
SITES  = None           # list

_CONFIG_DIR = Path.home() / ".goosehost"
_TOKEN_FILE = _CONFIG_DIR / "token"
_USER_FILE  = _CONFIG_DIR / "user"


def api_request(method, endpoint, data=None):
    url = API_URL + endpoint
    headers = {"Content-Type": "application/json"}
    t = TOKEN["v"]
    if t:
        headers["Authorization"] = f"Bearer {t}"
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, timeout=10)
        else:
            resp = requests.post(url, headers=headers, json=data, timeout=10)
        return resp.json() if resp.text else {}, resp.status_code
    except requests.exceptions.Timeout:
        return {"error": "Request timeout"}, 500
    except requests.exceptions.ConnectionError:
        return {"error": "Connection failed"}, 500
    except Exception as e:
        return {"error": str(e)}, 500


def run_async(func, on_done=None):
    """在后台线程执行网络请求，完成后通过 root.after 回调主线程"""
    try:
        import tkinter as tk
        root = tk._get_default_root()
    except:
        root = None

    def _wrap():
        try:
            result = func()
        except Exception as e:
            result = ({"error": str(e)}, 500)
        if on_done and root:
            try:
                root.after(0, on_done, result)
            except:
                pass  # mainloop 还没启动，忽略

    threading.Thread(target=_wrap, daemon=True).start()


# ---- Token 持久化（与 goosehost_cli.py 共用）----

def save_session():
    if TOKEN["v"]:
        try:
            _CONFIG_DIR.mkdir(mode=0o700, exist_ok=True)
            with open(_TOKEN_FILE, "w") as f:
                f.write(TOKEN["v"])
            if USER["v"]:
                with open(_USER_FILE, "w") as f:
                    json.dump(USER["v"], f)
        except:
            pass


def load_token_from_disk():
    """快速读取 token（不做网络验证），返回是否成功"""
    try:
        if not _TOKEN_FILE.exists():
            return False
        TOKEN["v"] = _TOKEN_FILE.read_text().strip()
        if _USER_FILE.exists():
            USER["v"] = json.loads(_USER_FILE.read_text())
        return bool(TOKEN["v"])
    except:
        return False


def clear_session():
    try:
        if _TOKEN_FILE.exists():
            _TOKEN_FILE.unlink()
        if _USER_FILE.exists():
            _USER_FILE.unlink()
    except:
        pass
