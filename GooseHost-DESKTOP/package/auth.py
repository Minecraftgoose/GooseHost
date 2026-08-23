# ============================================================
# auth.py — 登录 / 注册页面
# ============================================================
import customtkinter as ctk
from tkinter import messagebox
import webbrowser
from config import (
    API_URL,
    C_ACCENT, C_BORDER, C_CARD, C_ERROR, C_TEXT, C_TEXT_MUTED, C_TEXT_SEC,
    FONT_BASE, FONT_LG, FONT_SM, FONT_STAT, FONT_XL, RADIUS
)
from api import api_request, run_async, save_session
from widgets import make_card, make_input, make_btn, make_icon_input


# 供外部（verify_and_enter）更新状态标签
_status_label = None


def get_status_label():
    return _status_label


def login_page(main_container, show_main_container, root, logout_callback):
    global _status_label
    frame = ctk.CTkFrame(main_container, fg_color="transparent")

    center = ctk.CTkFrame(frame, fg_color="transparent")
    center.pack(expand=True)

    card = make_card(center, corner_radius=RADIUS)
    card.pack(padx=20, pady=20, ipadx=30, ipady=20)

    ctk.CTkLabel(card, text="GooseHost", font=FONT_XL, text_color=C_ACCENT).pack(pady=(20, 4))
    ctk.CTkLabel(card, text="登录到您的账户", font=FONT_BASE, text_color=C_TEXT_SEC).pack(pady=(0, 12))

    status_label = ctk.CTkLabel(card, text="", font=FONT_SM, text_color=C_ACCENT)
    status_label.pack(pady=(0, 4))
    _status_label = status_label

    # 邮箱（带 FA 图标）
    wrap1, email_entry = make_icon_input(card, "\uf0e0", placeholder="请输入邮箱")
    wrap1.pack(pady=(0, 14), padx=10)

    wrap2, pw = make_icon_input(card, "\uf023", placeholder="请输入密码", show="*")
    wrap2.pack(pady=(0, 20), padx=10)

    def do_login():
        email = email_entry.get().strip()
        password = pw.get()
        if not email or not password:
            messagebox.showerror("错误", "请填写完整")
            return
        login_btn.configure(text="登录中...", state="disabled")
        status_label.configure(text="", text_color=C_ACCENT)

        def _login_done(result):
            resp, code = result
            import api as _api
            if code == 200 and resp.get("access_token"):
                _api.TOKEN["v"] = resp["access_token"]
                _api.USER["v"] = resp.get("user")
                save_session()

                def _sites_done(r2):
                    sites_resp, _ = r2
                    _api.SITES.clear()
                    _api.SITES.extend(sites_resp if isinstance(sites_resp, list) else [])
                    import config
                    email = _api.USER["v"].get("email", "") if _api.USER["v"] else ""
                    config.notify("登录成功", f"Hi！{email} 欢迎回来")
                    try:
                        from dashboard import main_interface
                        frame = main_interface(main_container, show_main_container, root, logout_callback)
                        show_main_container(frame)
                    except Exception as e:
                        import traceback
                        traceback.print_exc()
                        login_btn.configure(text="\uf2f6  登  录", state="normal")
                        messagebox.showerror("错误", f"界面加载失败: {type(e).__name__}: {e}\n请截图发开发者")
                run_async(lambda: api_request("GET", "/api/my-sites"), _sites_done)
            else:
                login_btn.configure(text="\uf2f6  登  录", state="normal")
                status_label.configure(
                    text=resp.get("msg", "请检查邮箱和密码"), text_color=C_ERROR)

        run_async(lambda: api_request("POST", "/auth/login",
                    {"email": email, "password": password}), _login_done)

    login_btn = make_btn(card, "\uf2f6  登  录", do_login, width=280)
    login_btn.pack(pady=(0, 14))

    link_frame = ctk.CTkFrame(card, fg_color="transparent")
    link_frame.pack(pady=(0, 4))
    ctk.CTkLabel(link_frame, text="还没有账号？", font=FONT_SM, text_color=C_TEXT_SEC).pack(side="left")
    ctk.CTkButton(link_frame, text="立即注册",
                  command=lambda: register_page(main_container, show_main_container, root, logout_callback),
                  fg_color="transparent", hover_color=C_CARD,
                  text_color=C_ACCENT, font=FONT_SM, width=70).pack(side="left")

    ctk.CTkButton(card, text="系统状态",
                  command=lambda: webbrowser.open("https://host.goose.gs.cn/status"),
                  fg_color="transparent", hover_color=C_CARD,
                  text_color=C_TEXT_MUTED, font=FONT_SM).pack()

    # Enter 键绑定
    for child in card.winfo_children():
        if isinstance(child, ctk.CTkEntry):
            child.bind("<Return>", lambda e: do_login())

    email_entry.bind("<Return>", lambda e: do_login())
    pw.bind("<Return>", lambda e: do_login())

    show_main_container(frame)


def register_page(main_container, show_main_container, root, logout_callback):
    frame = ctk.CTkFrame(main_container, fg_color="transparent")
    center = ctk.CTkFrame(frame, fg_color="transparent")
    center.pack(expand=True)

    card = make_card(center, corner_radius=RADIUS)
    card.pack(padx=20, pady=20, ipadx=30, ipady=20)

    ctk.CTkLabel(card, text="创建账户", font=FONT_LG, text_color=C_ACCENT).pack(pady=(20, 4))
    ctk.CTkLabel(card, text="加入 GooseHost 开始托管您的网站",
                 font=FONT_SM, text_color=C_TEXT_SEC).pack(pady=(0, 24))

    wrap1, e1 = make_icon_input(card, "\uf0e0", placeholder="请输入邮箱")
    wrap1.pack(pady=(0, 14), padx=10)

    wrap2, e2 = make_icon_input(card, "\uf023", placeholder="请输入密码（至少 6 位）", show="*")
    wrap2.pack(pady=(0, 14), padx=10)

    wrap3, e3 = make_icon_input(card, "\uf023", placeholder="请再次输入密码", show="*")
    wrap3.pack(pady=(0, 20), padx=10)

    def do_register():
        email = e1.get().strip()
        password = e2.get()
        confirm = e3.get()
        if password != confirm:
            messagebox.showerror("错误", "密码不一致")
            return
        if len(password) < 6:
            messagebox.showerror("错误", "密码至少 6 位")
            return
        register_btn.configure(text="注册中...", state="disabled")

        def _done(result):
            resp, code = result
            if code == 200 and resp.get("success"):
                import config
                config.notify("注册成功", "请查收验证邮件")
                login_page(main_container, show_main_container, root, logout_callback)
            else:
                register_btn.configure(text="\uf234  注  册", state="normal")
                messagebox.showerror("注册失败", resp.get("msg", "未知错误"))

        run_async(lambda: api_request("POST", "/auth/signup",
                    {"email": email, "password": password}), _done)

    register_btn = make_btn(card, "\uf234  注  册", do_register, width=280)
    register_btn.pack(pady=(0, 14))

    link_frame = ctk.CTkFrame(card, fg_color="transparent")
    link_frame.pack()
    ctk.CTkLabel(link_frame, text="已有账号？", font=FONT_SM, text_color=C_TEXT_SEC).pack(side="left")
    ctk.CTkButton(link_frame, text="立即登录",
                  command=lambda: login_page(main_container, show_main_container, root, logout_callback),
                  fg_color="transparent", hover_color=C_CARD,
                  text_color=C_ACCENT, font=FONT_SM, width=70).pack(side="left")

    # Enter 键绑定
    for child in card.winfo_children():
        if isinstance(child, ctk.CTkEntry):
            child.bind("<Return>", lambda e: do_register())

    show_main_container(frame)
