# ============================================================
# widgets.py — 可复用的 UI 组件构建函数
# ============================================================
import customtkinter as ctk
from config import (
    C_ACCENT, C_ACCENT_HOVER, C_ACTIVE_NAV, C_BG, C_BORDER,
    C_BTN_TEXT, C_CARD, C_ERROR, C_ERROR_BG, C_INPUT,
    C_TEXT, C_TEXT_MUTED, C_TEXT_SEC, FA_FAMILY,
    FONT_BASE, FONT_LG, FONT_SM, RADIUS, RADIUS_LG
)


def make_card(parent, **kwargs):
    defaults = {
        "fg_color": C_CARD,
        "corner_radius": RADIUS_LG,
        "border_width": 1,
        "border_color": C_BORDER,
    }
    defaults.update(kwargs)
    return ctk.CTkFrame(parent, **defaults)


def make_input(parent, placeholder="", show=None, width=300, **kwargs):
    entry = ctk.CTkEntry(
        parent,
        width=width,
        placeholder_text=placeholder,
        show=show or "",
        font=FONT_BASE,
        fg_color=C_INPUT,
        border_color=C_BORDER,
        border_width=1,
        corner_radius=RADIUS,
        text_color=C_TEXT,
        placeholder_text_color=C_TEXT_SEC,
        height=44,
        **kwargs
    )
    return entry


def make_icon_input(parent, fa_code, placeholder="", show=None, width=300, **kwargs):
    """带 Font Awesome 图标的输入框（图标在左侧，跟 web 端一致）"""
    wrap = ctk.CTkFrame(parent, fg_color="transparent")
    # 图标
    if FA_FAMILY:
        icon = ctk.CTkLabel(wrap, text=fa_code,
                            font=ctk.CTkFont(family=FA_FAMILY, size=16),
                            text_color=C_ACCENT, width=30)
        icon.pack(side="left", padx=(0, 2))
    # 输入框
    entry = make_input(wrap, placeholder=placeholder, show=show, width=width - 32, **kwargs)
    entry.pack(side="left")
    return wrap, entry


def make_btn(parent, text, command, is_primary=True, width=None, height=40, **kwargs):
    if is_primary:
        defaults = {
            "fg_color": C_ACCENT,
            "hover_color": C_ACCENT_HOVER,
            "text_color": C_BTN_TEXT,
        }
    else:
        defaults = {
            "fg_color": "transparent",
            "hover_color": C_ACTIVE_NAV,
            "text_color": C_ACCENT,
        }
    defaults.update(kwargs)
    btn = ctk.CTkButton(
        parent, text=text, command=command,
        font=FONT_BASE, corner_radius=RADIUS, height=height,
        **defaults
    )
    if width:
        btn.configure(width=width)
    return btn


def make_danger_btn(parent, text, command, width=None, height=36):
    return ctk.CTkButton(
        parent, text=text, command=command,
        font=FONT_SM,
        fg_color=C_ERROR_BG, hover_color="#4a2020",
        text_color=C_ERROR,
        corner_radius=RADIUS, height=height, width=width
    )


def page_header(parent, title, desc=""):
    """统一样式的页面标题区"""
    header_frame = ctk.CTkFrame(parent, fg_color="transparent")
    header_frame.pack(fill="x", padx=24, pady=(20, 4))
    ctk.CTkLabel(header_frame, text=title, font=FONT_LG, text_color=C_TEXT).pack(anchor="w")
    if desc:
        ctk.CTkLabel(header_frame, text=desc, font=FONT_SM, text_color=C_TEXT_SEC).pack(
            anchor="w", pady=(4, 0))
    ctk.CTkFrame(parent, height=1, fg_color=C_BORDER).pack(
        fill="x", padx=24, pady=(12, 16))
