# ============================================================
# gui.py — GooseHost 桌面管理面板（入口）
# ============================================================
import customtkinter as ctk
import ctypes
import os
import sys


def _toast(msg, stay=False):
    """Show a toast-like popup. If stay=True, returns (root, win) for manual cleanup."""
    import tkinter as tk
    root = tk.Tk()
    root.withdraw()
    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    tk.Label(win, text=msg, font=("Microsoft YaHei", 12), padx=24, pady=16,
             bg="#142319", fg="#02ff8e").pack()
    win.update_idletasks()
    x = win.winfo_screenwidth() // 2 - win.winfo_width() // 2
    y = win.winfo_screenheight() // 2 - win.winfo_height() // 2
    win.geometry(f"+{x}+{y}")
    if stay:
        return root, win
    root.after(2000, root.quit)
    root.mainloop()
    root.destroy()


# =================== CLI deploy mode (no GUI) ===================
def _cli_deploy(filepath):
    """Handle 'GooseHost.exe deploy file.html' -- no GUI window"""
    import api as _a
    _a.API_URL = "https://page.goose.gs.cn"
    _a.TOKEN = {"v": None}
    _a.load_token_from_disk()

    if not os.path.isfile(filepath):
        _toast("Error: file not found")
        sys.exit(1)
    if not _a.TOKEN["v"]:
        _toast("Not logged in. Run GooseHost.exe and sign in first.")
        sys.exit(1)

    ext = os.path.splitext(filepath)[1].lower()
    site_type = "md" if ext in (".md", ".markdown") else "html"

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        _toast(f"Error reading file: {e}")
        sys.exit(1)

    import re
    slug = re.sub(r'[^a-zA-Z0-9_\-.~]', '-', os.path.splitext(os.path.basename(filepath))[0])
    if not slug:
        slug = "my-site"

    payload = {"slug": slug}
    if site_type == "md":
        payload["md"] = content
    else:
        payload["html"] = content

    root_t, win_t = _toast("Deploying...", stay=True)
    win_t.update()

    resp, code = _a.api_request("POST", "/api/create", payload)
    if code == 200 and resp.get("success"):
        url = f"https://page.goose.gs.cn/md/{slug}" if site_type == "md" else f"https://page.goose.gs.cn/s/{slug}"
        for w in win_t.winfo_children():
            w.destroy()
        import tkinter as tk
        tk.Label(win_t, text=f"Deployed!\n{url}", font=("Microsoft YaHei", 12), padx=24, pady=16,
                 bg="#142319", fg="#02ff8e").pack()
        win_t.update()
        root_t.after(2000, root_t.quit)
        root_t.mainloop()
        root_t.destroy()
        sys.exit(0)
    else:
        for w in win_t.winfo_children():
            w.destroy()
        import tkinter as tk
        err = resp.get("msg") or resp.get("error") or f"HTTP {code}"
        tk.Label(win_t, text=f"Deploy failed ({code}): {err}", font=("Microsoft YaHei", 12), padx=24, pady=16,
                 bg="#142319", fg="#02ff8e").pack()
        root_t.after(2500, root_t.quit)
        root_t.mainloop()
        root_t.destroy()
        sys.exit(1)

if len(sys.argv) >= 3 and sys.argv[1] == "deploy":
    _cli_deploy(sys.argv[2])

# ---- 注册钉钉进步体（免费商用，Web 端同款）----
_FONT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DingTalkJinBuTi.ttf")
if os.path.exists(_FONT_PATH):
    try:
        FR_PRIVATE = 0x10
        ctypes.windll.gdi32.AddFontResourceExW(_FONT_PATH, FR_PRIVATE, 0)
    except:
        pass
_FONT_FAMILY = "DingTalk JinBuTi" if os.path.exists(_FONT_PATH) else "Microsoft YaHei"

# ---- 注册 Font Awesome（用于输入框图标等）----
_FA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fa-solid-900.ttf")
if os.path.exists(_FA_PATH):
    try:
        FR_PRIVATE = 0x10
        ctypes.windll.gdi32.AddFontResourceExW(_FA_PATH, FR_PRIVATE, 0)
    except:
        pass
_FA_FAMILY = "Font Awesome 6 Free" if os.path.exists(_FA_PATH) else None

# ---- 外观 ----
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("green")

# ---- 主窗口（必须在 CTkFont 之前创建）----
root = ctk.CTk()
root.title("GooseHost 管理面板")
root.geometry("1020x700")
root.minsize(920, 600)

# ---- 绑定应用图标（必须 set 两次，主窗口 + default）----
_ICON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.ico")
if os.path.exists(_ICON_PATH):
    try:
        root.iconbitmap(_ICON_PATH)
        root.after(0, lambda: root.iconbitmap(_ICON_PATH))
    except:
        pass

# ---- 注入字体到 config ----
import config
config.FONT_XL      = ctk.CTkFont(family=_FONT_FAMILY, size=28, weight="bold")
config.FONT_LG      = ctk.CTkFont(family=_FONT_FAMILY, size=24, weight="bold")
config.FONT_MD      = ctk.CTkFont(family=_FONT_FAMILY, size=18, weight="bold")
config.FONT_BASE    = ctk.CTkFont(family=_FONT_FAMILY, size=14)
config.FONT_SM      = ctk.CTkFont(family=_FONT_FAMILY, size=12)
config.FONT_STAT    = ctk.CTkFont(family=_FONT_FAMILY, size=32, weight="bold")
config.FONT_STAT_VAL = ctk.CTkFont(family=_FONT_FAMILY, size=24, weight="bold")
config.FA_FAMILY = _FA_FAMILY  # Font Awesome 字体名

# ---- 初始化 API 模块共享状态 ----
import api as _api
_api.API_URL = config.API_URL
_api.TOKEN  = {"v": None}
_api.USER   = {"v": None}
_api.SITES  = []

root.configure(fg_color=config.C_BG)

# ---- 全局容器 ----
main_container = ctk.CTkFrame(root, fg_color="transparent")
main_container.pack(fill="both", expand=True)


def show_main_container(frame):
    for child in main_container.winfo_children():
        child.pack_forget()
    frame.pack(fill="both", expand=True)


def logout():
    _api.TOKEN["v"] = None
    _api.USER["v"] = None
    _api.SITES.clear()
    _api.clear_session()
    # 清理旧版本残留
    old_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".goosehost_session.json")
    if os.path.exists(old_file):
        try:
            os.remove(old_file)
        except:
            pass
    config.notify("已退出登录", "GooseHost")
    from auth import login_page
    login_page(main_container, show_main_container, root, logout)


def _verify_and_enter():
    """后台验证 token，成功则跳转主界面"""
    if not _api.TOKEN["v"]:
        return
    try:
        from auth import get_status_label
        lbl = get_status_label()
        if lbl:
            lbl.configure(text="正在恢复登录状态...", text_color=config.C_ACCENT)
    except:
        pass

    def _done(result):
        sites_resp, code = result
        if code == 200 and isinstance(sites_resp, list):
            _api.SITES.clear()
            _api.SITES.extend(sites_resp)
            email = _api.USER["v"].get("email", "") if _api.USER["v"] else ""
            config.notify("登录成功", f"Hi！{email} 欢迎回来")
            try:
                from dashboard import main_interface
                frame = main_interface(main_container, show_main_container, root, logout)
                if hasattr(root, 'splash_label'):
                    root.splash_label.destroy()
                show_main_container(frame)
            except Exception as e:
                import traceback
                traceback.print_exc()
                if hasattr(root, 'splash_label'):
                    root.splash_label.destroy()
                from auth import login_page
                login_page(main_container, show_main_container, root, logout)
        else:
            _api.TOKEN["v"] = None
            _api.USER["v"] = None
            _api.clear_session()
            # Token 过期，切回登录页面
            if hasattr(root, 'splash_label'):
                root.splash_label.destroy()
            from auth import login_page
            login_page(main_container, show_main_container, root, logout)

    _api.run_async(lambda: _api.api_request("GET", "/api/my-sites"), _done)


# ---- 启动 ----
if __name__ == "__main__":
    # ==================== GUI 模式 ====================
    from auth import login_page
    has_token = _api.load_token_from_disk()
    if has_token:
        root.after(100, _verify_and_enter)
    else:
        login_page(main_container, show_main_container, root, logout)

    if os.path.exists(_ICON_PATH):
        from tray import create_tray
        config.tray_icon = create_tray(root, _ICON_PATH, "GooseHost")
        config.tray_icon.run_detached()

    root.mainloop()
