# ============================================================
# dashboard.py — 主界面（导航 + 所有内容页）
# ============================================================
import customtkinter as ctk
import tkinter as tk
import os
import webbrowser
import config
from tkinter import filedialog, messagebox
from datetime import datetime
from config import (
    API_URL,
    C_ACCENT, C_ACCENT_HOVER, C_ACTIVE_NAV, C_BG, C_BORDER, C_BTN_TEXT,
    C_CARD, C_ERROR, C_ERROR_BG, C_INPUT, C_NAV_BG, C_SIDEBAR_BG,
    C_STAT_BG, C_TEXT, C_TEXT_MUTED, C_TEXT_SEC, FA_FAMILY,
    FONT_BASE, FONT_LG, FONT_MD, FONT_SM, FONT_STAT_VAL,
    RADIUS, RADIUS_LG, refresh_sites, deploy_slug_entry
)
from api import api_request, run_async
from widgets import make_card, make_input, make_btn, make_danger_btn, page_header


def main_interface(main_container, show_main_container, root, logout_callback):
    container = ctk.CTkFrame(main_container, fg_color="transparent")

    # ---- 顶部导航 ----
    top_nav = ctk.CTkFrame(container, height=56, fg_color=C_NAV_BG, corner_radius=0)
    top_nav.pack(side="top", fill="x")
    top_nav.pack_propagate(False)
    ctk.CTkFrame(top_nav, height=1, fg_color=C_BORDER).pack(side="bottom", fill="x")

    left_frame = ctk.CTkFrame(top_nav, fg_color="transparent")
    left_frame.pack(side="left", padx=18)
    ctk.CTkLabel(left_frame, text="GooseHost",
                 font=ctk.CTkFont(family="DingTalk JinBuTi", size=20, weight="bold"),
                 text_color=C_ACCENT).pack(side="left")
    import api as _api
    if _api.USER["v"]:
        email = _api.USER["v"].get("email", "")
        if email:
            ctk.CTkLabel(left_frame, text=f"  |  {email}",
                         font=FONT_SM, text_color=C_TEXT_SEC).pack(side="left", padx=10)

    ctk.CTkButton(top_nav, text="退出", command=logout_callback,
                  fg_color="transparent", hover_color=C_ERROR_BG,
                  text_color=C_ERROR, font=FONT_SM, width=60).pack(side="right", padx=18)

    # ---- 主体 ----
    body = ctk.CTkFrame(container, fg_color="transparent")
    body.pack(side="bottom", fill="both", expand=True)

    sidebar = ctk.CTkFrame(body, width=220, fg_color=C_SIDEBAR_BG, corner_radius=0)
    sidebar.pack(side="left", fill="y")
    sidebar.pack_propagate(False)

    sep = ctk.CTkFrame(body, width=1, fg_color=C_BORDER)
    sep.pack(side="left", fill="y")
    sep.pack_propagate(False)

    content_area = ctk.CTkFrame(body, fg_color="transparent")
    content_area.pack(side="right", fill="both", expand=True)

    # ---- 侧边栏导航 ----
    nav_buttons = {}
    nav_frames = {}
    nav_indicators = {}

    def _switch(page_name):
        for name, btn in nav_buttons.items():
            btn.configure(fg_color=C_ACTIVE_NAV if name == page_name else "transparent",
                          text_color=C_ACCENT if name == page_name else C_TEXT_SEC)
        for name, ind in nav_indicators.items():
            ind.configure(fg_color=C_ACCENT if name == page_name else "transparent")
        for key, frm in nav_frames.items():
            if key == page_name:
                frm.pack(fill="both", expand=True)
            else:
                frm.pack_forget()

    # 注入全局切换函数
    config.switch_to_page = _switch

    # 图标映射
    ICONS = {"overview": "\uf015", "deploy": "\uf135", "sites": "\uf0ac",
             "account": "\uf007", "browser_status": "\uf233"}

    sections = [
        ("主菜单", [
            ("概览", "overview"),
            ("部署", "deploy"),
            ("我的网站", "sites"),
        ]),
        ("设置", [
            ("账户", "account"),
            ("系统状态", "browser_status"),
        ]),
    ]

    for section_title, items in sections:
        ctk.CTkLabel(sidebar, text=section_title,
                     font=ctk.CTkFont(family="DingTalk JinBuTi", size=10, weight="bold"),
                     text_color=C_TEXT_MUTED).pack(anchor="w", padx=18, pady=(16, 6))

        for label, page_id in items:
            row = ctk.CTkFrame(sidebar, fg_color="transparent", height=38)
            row.pack(fill="x", pady=1, padx=8)
            row.pack_propagate(False)

            indicator = ctk.CTkFrame(row, width=3, fg_color="transparent")
            indicator.pack(side="left", fill="y")
            nav_indicators[page_id] = indicator

            # FA 图标（独立 Label，固定宽度）
            if FA_FAMILY and page_id in ICONS:
                ctk.CTkLabel(row, text=ICONS[page_id],
                             font=ctk.CTkFont(family=FA_FAMILY, size=14),
                             text_color=C_TEXT_SEC, width=22).pack(side="left")

            btn = ctk.CTkButton(row, text=label,
                                command=lambda p=page_id: (
                                    webbrowser.open("https://host.goose.gs.cn/status") if p == "browser_status"
                                    else _switch(p)
                                ),
                                fg_color="transparent", hover_color=C_ACTIVE_NAV,
                                text_color=C_TEXT_SEC, font=FONT_BASE,
                                anchor="w", height=38, corner_radius=RADIUS)
            btn.pack(side="left", fill="both", expand=True, padx=(2, 0))
            nav_buttons[page_id] = btn

    # ---- 创建内容页面 ----
    overview_frame = ctk.CTkFrame(content_area, fg_color="transparent")
    _build_overview(overview_frame)
    nav_frames["overview"] = overview_frame

    deploy_frame = ctk.CTkFrame(content_area, fg_color="transparent")
    _build_deploy(deploy_frame)
    nav_frames["deploy"] = deploy_frame

    sites_frame = ctk.CTkFrame(content_area, fg_color="transparent")
    _build_sites(sites_frame, root)
    nav_frames["sites"] = sites_frame

    account_frame = ctk.CTkFrame(content_area, fg_color="transparent")
    _build_account(account_frame, logout_callback)
    nav_frames["account"] = account_frame

    _switch("overview")
    return container


# ---------- 概览 ----------
def _build_overview(parent):
    frame = ctk.CTkFrame(parent, fg_color="transparent")
    frame.pack(fill="both", expand=True)
    page_header(frame, "欢迎回来", "这里是您的网站管理控制台")

    import api as _api
    sites = _api.SITES
    total = len(sites)
    latest = "-"
    if sites:
        times = [s.get("updated_at") for s in sites if s.get("updated_at")]
        if times:
            latest_dt = datetime.fromisoformat(max(times).replace('Z', '+00:00'))
            latest = latest_dt.strftime("%Y-%m-%d %H:%M")

    stats_row = ctk.CTkFrame(frame, fg_color="transparent")
    stats_row.pack(fill="x", padx=24, pady=(0, 16))
    for i, (icon, value, label) in enumerate([("\uf0ac", str(total), "网站总数"), ("\uf017", latest, "最近更新")]):
        card = make_card(stats_row, corner_radius=RADIUS, fg_color=C_STAT_BG)
        card.pack(side="left", fill="x", expand=True, padx=(0, 12) if i == 0 else 0)
        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="x", padx=16, pady=14)
        # FA 图标
        if FA_FAMILY:
            ctk.CTkLabel(inner, text=icon,
                         font=ctk.CTkFont(family=FA_FAMILY, size=18),
                         text_color=C_ACCENT).pack(anchor="w")
        ctk.CTkLabel(inner, text=label, font=FONT_SM, text_color=C_TEXT_SEC).pack(anchor="w")
        ctk.CTkLabel(inner, text=value, font=FONT_STAT_VAL, text_color=C_TEXT).pack(anchor="w", pady=(4, 0))

    quick_card = make_card(frame, corner_radius=RADIUS)
    quick_card.pack(fill="x", padx=24, pady=(0, 16))
    quick_inner = ctk.CTkFrame(quick_card, fg_color="transparent")
    quick_inner.pack(fill="x", padx=16, pady=14)
    ctk.CTkLabel(quick_inner, text="快捷操作", font=FONT_MD, text_color=C_TEXT).pack(anchor="w", pady=(0, 12))

    btn_row = ctk.CTkFrame(quick_inner, fg_color="transparent")
    btn_row.pack(fill="x")
    make_btn(btn_row, "\uf055  新建网站", lambda: config.switch_to_page("deploy"),
             width=140, height=42).pack(side="left", padx=(0, 10))
    make_btn(btn_row, "\uf03a  管理网站", lambda: config.switch_to_page("sites"),
             width=140, height=42).pack(side="left")


# ---------- 部署 ----------
def _build_deploy(parent):
    frame = ctk.CTkFrame(parent, fg_color="transparent")
    frame.pack(fill="both", expand=True)
    page_header(frame, "部署网站", "快速创建和部署您的静态网站")

    card = make_card(frame, corner_radius=RADIUS)
    card.pack(fill="x", padx=24, pady=(0, 16))
    form = ctk.CTkFrame(card, fg_color="transparent")
    form.pack(fill="x", padx=16, pady=16)

    ctk.CTkLabel(form, text="子域名", font=FONT_SM, text_color=C_TEXT_SEC).pack(anchor="w", pady=(0, 4))
    entry = make_input(form, placeholder="例如 my-site", width=400)
    entry.pack(anchor="w", fill="x", pady=(0, 14))
    config.deploy_slug_entry = entry

    ctk.CTkLabel(form, text="内容文件", font=FONT_SM, text_color=C_TEXT_SEC).pack(anchor="w", pady=(0, 4))

    file_row = ctk.CTkFrame(form, fg_color="transparent")
    file_row.pack(fill="x", pady=(0, 8))
    file_label = ctk.CTkLabel(file_row, text="未选择文件", font=FONT_SM, text_color=C_TEXT_MUTED)
    file_label.pack(side="left", fill="x", expand=True)
    content_data = {"content": "", "type": "html"}

    def choose_file():
        file_path = filedialog.askopenfilename(
            filetypes=[("Web files", "*.html *.htm *.md *.markdown")]
        )
        if file_path:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content_data["content"] = f.read()
                ext = os.path.splitext(file_path)[1].lower()
                content_data["type"] = "md" if ext in (".md", ".markdown") else "html"
                file_label.configure(text=f"已选择: {os.path.basename(file_path)}  ({content_data['type'].upper()})",
                                     text_color=C_ACCENT)
            except:
                messagebox.showerror("错误", "读取文件失败")

    make_btn(file_row, "选择文件", choose_file, width=110, height=34).pack(side="right")

    def do_deploy():
        import api as _api
        slug = config.deploy_slug_entry.get().strip()
        content = content_data["content"]
        if not slug or not content:
            messagebox.showerror("错误", "请填写子域名并上传文件")
            return
        site_type = content_data["type"]
        payload = {"slug": slug}
        if site_type == "md":
            payload["md"] = content
        else:
            payload["html"] = content
        deploy_btn.configure(text="部署中...", state="disabled")

        def _deploy_done(result):
            resp, code = result
            if code == 200 and resp.get("success"):
                # 只加新站点到本地列表，不重拉全部
                sname = f"md/{slug}" if site_type == "md" else slug
                new_site = {"name": sname, "created_at": ""}
                _api.SITES.append(new_site)
                deploy_btn.configure(text="\uf135  部  署", state="normal")
                if config.tray_icon:
                    config.tray_icon.show_notification(f"Deployed {slug}", "GooseHost")
                config.switch_to_page("sites")
                if config.refresh_sites:
                    config.refresh_sites()
            else:
                deploy_btn.configure(text="\uf135  部  署", state="normal")
                messagebox.showerror("Failed", resp.get("msg", "deploy failed"))

        run_async(lambda: api_request("POST", "/api/create", payload), _deploy_done)

    deploy_btn = make_btn(form, "\uf135  部  署", do_deploy, width=200, height=42)
    deploy_btn.pack(fill="x", pady=(0, 8))


# ---------- 我的网站 ----------
def _build_sites(parent, root):
    frame = ctk.CTkFrame(parent, fg_color="transparent")
    frame.pack(fill="both", expand=True)
    page_header(frame, "我的网站", "管理和编辑您所有的网站")

    scroll = ctk.CTkScrollableFrame(frame, fg_color="transparent")
    scroll.pack(fill="both", expand=True, padx=24, pady=(0, 16))

    # 跟踪每张 site card，方便增删改时不重建
    cards = {}  # {slug: card_widget}

    def _make_card(site):
        """创建一张网站卡片，不入 scroll"""
        name = site.get("name", "未知")
        site_type = "md" if name.startswith("md/") else "html"
        display = name[3:] if site_type == "md" else name
        created = site.get("created_at", "")[:10]

        card = make_card(scroll, corner_radius=RADIUS)
        badge_text = site_type.upper()
        fg = C_ACCENT if site_type == "html" else "#1a2f40"
        tc = C_BTN_TEXT if site_type == "html" else "#6495ed"
        w = 44 if site_type == "html" else 38
        badge = ctk.CTkLabel(card, text=badge_text,
                             font=ctk.CTkFont(family="DingTalk JinBuTi", size=9, weight="bold"),
                             fg_color=fg, text_color=tc, corner_radius=3, width=w, height=22)
        badge.pack(side="left", padx=(12, 6), pady=12)
        badge.pack_propagate(False)

        name_label = ctk.CTkLabel(card, text=display,
                                  font=ctk.CTkFont(family="DingTalk JinBuTi", size=15, weight="bold"),
                                  text_color=C_TEXT)
        name_label.pack(side="left", pady=12)

        ctk.CTkLabel(card, text=created, font=FONT_SM,
                     text_color=C_TEXT_MUTED).pack(side="left", padx=8, pady=12)

        btn_frame = ctk.CTkFrame(card, fg_color="transparent")
        btn_frame.pack(side="right", padx=10, pady=8)

        def visit():
            n = site.get("name")
            t = "md" if n.startswith("md/") else "html"
            url = f"{API_URL}/md/{n[3:]}" if t == "md" else f"{API_URL}/s/{n}"
            webbrowser.open(url)

        def edit():
            _open_editor(site, root, refresh)

        def delete():
            slug = site.get("name")
            if not messagebox.askyesno("Confirm", f"Delete {display}?"):
                return
            import api as _api
            def _done(result):
                resp, code = result
                if code == 200 and resp.get("success"):
                    card.pack_forget()
                    card.destroy()
                    cards.pop(slug, None)
                    for i, s in enumerate(_api.SITES):
                        if s.get("name") == slug:
                            _api.SITES.pop(i)
                            break
                    config.notify("Deleted", display)
                else:
                    messagebox.showerror("Failed", resp.get("msg", "delete failed"))
            run_async(lambda: api_request("POST", "/api/delete", {"slug": slug}), _done)

        make_btn(btn_frame, "Visit", visit, width=56, height=28).pack(side="left", padx=2)
        ctk.CTkButton(btn_frame, text="Edit", command=edit,
                      width=56, height=28, corner_radius=RADIUS,
                      fg_color="#2a1f00", hover_color="#3a2f00",
                      text_color="#ffaa00", font=FONT_SM).pack(side="left", padx=2)
        make_danger_btn(btn_frame, "Delete", delete, width=56, height=28).pack(side="left", padx=2)
        return card

    def refresh():
        for w in list(scroll.winfo_children()):
            w.destroy()
        cards.clear()
        import api as _api
        if not _api.SITES:
            empty_frame = ctk.CTkFrame(scroll, fg_color="transparent")
            empty_frame.pack(expand=True, pady=60)
            ctk.CTkLabel(empty_frame, text="No sites yet", font=FONT_MD, text_color=C_TEXT_MUTED).pack()
            ctk.CTkLabel(empty_frame, text="Go to Deploy to create your first site",
                         font=FONT_SM, text_color=C_TEXT_MUTED).pack(pady=(4, 0))
        else:
            for site in _api.SITES:
                card = _make_card(site)
                card.pack(fill="x", pady=5)
                cards[site.get("name")] = card

    config.refresh_sites = refresh
    refresh()


def _open_editor(site, root, refresh_callback):
    n = site.get("name")
    t = "md" if n.startswith("md/") else "html"
    display = n[3:] if t == "md" else n

    edit_win = ctk.CTkToplevel(root)
    edit_win.title(f"编辑 - {display}")
    edit_win.geometry("800x600")
    edit_win.minsize(600, 400)
    edit_win.configure(fg_color=C_BG)
    edit_win.transient(root)
    edit_win.grab_set()
    # 设置窗口图标
    _icon = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.ico")
    if os.path.exists(_icon):
        try:
            edit_win.iconbitmap(_icon)
            edit_win.after(0, lambda: edit_win.iconbitmap(_icon))
        except:
            pass

    top = ctk.CTkFrame(edit_win, fg_color=C_NAV_BG, height=44, corner_radius=0)
    top.pack(fill="x")
    top.pack_propagate(False)
    ctk.CTkLabel(top, text=f"编辑  {display}  ({t.upper()})",
                 font=FONT_BASE, text_color=C_ACCENT).pack(side="left", padx=14, pady=10)
    ctk.CTkLabel(top, text=f"保存后自动覆盖部署",
                 font=FONT_SM, text_color=C_TEXT_MUTED).pack(side="left", padx=8)

    def upload_file():
        file_path = filedialog.askopenfilename(
            parent=edit_win,
            filetypes=[("HTML files", "*.html *.htm"), ("Markdown files", "*.md *.markdown"), ("All files", "*.*")]
        )
        if file_path:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    text_widget.delete("1.0", "end")
                    text_widget.insert("1.0", f.read())
                status_label.configure(text=f"已载入: {os.path.basename(file_path)}", text_color=C_ACCENT)
            except:
                messagebox.showerror("错误", "读取文件失败", parent=edit_win)

    ctk.CTkButton(top, text="上传文件", command=upload_file,
                  fg_color="transparent", hover_color=C_ACTIVE_NAV,
                  text_color=C_ACCENT, font=FONT_SM, width=80).pack(side="right", padx=10)

    text_frame = ctk.CTkFrame(edit_win, fg_color="transparent")
    text_frame.pack(fill="both", expand=True, padx=10, pady=10)

    text_widget = tk.Text(text_frame, bg=C_CARD, fg=C_TEXT, insertbackground=C_ACCENT,
                          font=("Consolas", 12), wrap="none", relief="flat", borderwidth=0,
                          padx=10, pady=10, selectbackground=C_ACCENT, selectforeground=C_BTN_TEXT)
    text_widget.insert("1.0", "// 加载中...")
    text_widget.configure(state="disabled")
    text_widget.pack(side="left", fill="both", expand=True)

    v_scroll = ctk.CTkScrollbar(text_frame, command=text_widget.yview)
    text_widget.configure(yscrollcommand=v_scroll.set)
    text_widget.pack(side="left", fill="both", expand=True)
    v_scroll.pack(side="right", fill="y")

    bottom = ctk.CTkFrame(edit_win, fg_color="transparent")
    bottom.pack(fill="x", padx=14, pady=(0, 14))
    status_label = ctk.CTkLabel(bottom, text="正在加载内容...", font=FONT_SM, text_color=C_TEXT_SEC)
    status_label.pack(side="left")

    def _content_loaded(result):
        resp, code = result
        if code != 200:
            status_label.configure(text=f"Load failed (HTTP {code})", text_color=C_ERROR)
            text_widget.configure(state="disabled")
            return
        content = (resp.get("html") or resp.get("md") or "")
        text_widget.configure(state="normal")
        text_widget.delete("1.0", "end")
        text_widget.insert("1.0", content)
        status_label.configure(text="")

    run_async(lambda: api_request("GET", f"/api/file/{n}"), _content_loaded)

    def do_save():
        import api as _api
        new_content = text_widget.get("1.0", "end-1c")
        if not new_content.strip():
            messagebox.showerror("错误", "内容不能为空", parent=edit_win)
            return
        payload = {"slug": n}
        if n.startswith("md/"):
            payload["md"] = new_content
        else:
            payload["html"] = new_content
        save_btn.configure(text="保存中...", state="disabled")
        status_label.configure(text="保存中...", text_color=C_ACCENT)

        def _update_done(result):
            resp, code = result
            if code == 200 and resp.get("success"):
                status_label.configure(text="Saved", text_color=C_ACCENT)
                config.notify("Updated", display)
                edit_win.after(600, edit_win.destroy)
            else:
                save_btn.configure(text="Save & Deploy", state="normal")
                status_label.configure(text=f"Failed: {resp.get('msg', 'error')}", text_color=C_ERROR)

        run_async(lambda: api_request("POST", "/api/update", payload), _update_done)

    ctk.CTkButton(bottom, text="取消", command=edit_win.destroy,
                  fg_color="transparent", hover_color=C_ACTIVE_NAV,
                  text_color=C_TEXT_SEC, font=FONT_SM, width=70).pack(side="right", padx=6)
    save_btn = make_btn(bottom, "保存并部署", do_save, width=120, height=36)
    save_btn.pack(side="right", padx=6)


# ---------- 账户 ----------
def _build_account(parent, logout_callback):
    frame = ctk.CTkFrame(parent, fg_color="transparent")
    frame.pack(fill="both", expand=True)
    page_header(frame, "账户设置", "管理您的账户信息和安全设置")

    import api as _api
    card1 = make_card(frame, corner_radius=RADIUS)
    card1.pack(fill="x", padx=24, pady=(0, 16))
    inner1 = ctk.CTkFrame(card1, fg_color="transparent")
    inner1.pack(fill="x", padx=16, pady=14)
    ctk.CTkLabel(inner1, text="账户信息", font=FONT_MD, text_color=C_TEXT).pack(anchor="w", pady=(0, 12))
    row1 = ctk.CTkFrame(inner1, fg_color="transparent")
    row1.pack(fill="x")
    ctk.CTkLabel(row1, text="登录邮箱", font=FONT_BASE, text_color=C_TEXT).pack(side="left")
    email = _api.USER["v"].get("email") if _api.USER["v"] else "-"
    ctk.CTkLabel(row1, text=email, font=FONT_BASE, text_color=C_TEXT_SEC).pack(side="left", padx=16)

    card2 = make_card(frame, corner_radius=RADIUS)
    card2.pack(fill="x", padx=24)
    inner2 = ctk.CTkFrame(card2, fg_color="transparent")
    inner2.pack(fill="x", padx=16, pady=14)
    ctk.CTkLabel(inner2, text="退出登录", font=FONT_MD, text_color=C_TEXT).pack(anchor="w", pady=(0, 12))
    row2 = ctk.CTkFrame(inner2, fg_color="transparent")
    row2.pack(fill="x")
    ctk.CTkLabel(row2, text="退出当前账户", font=FONT_BASE, text_color=C_TEXT).pack(side="left")
    ctk.CTkLabel(row2, text="清除登录状态，返回登录页面",
                 font=FONT_SM, text_color=C_TEXT_MUTED).pack(side="left", padx=10)
    make_danger_btn(row2, "退出登录", logout_callback, width=90).pack(side="right")
