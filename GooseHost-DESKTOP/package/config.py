# ============================================================
# config.py — 全局常量与共享状态
# ============================================================

# ---- 颜色令牌（与 Web 端 GooseHost 对齐）----
C_ACCENT       = "#02ff8e"
C_ACCENT_DARK  = "#00cc6a"
C_ACCENT_HOVER = "#00e67a"
C_BG           = "#0a0f0d"
C_CARD         = "#142319"
C_INPUT        = "#0d1a12"
C_BORDER       = "#1a3a25"
C_TEXT         = "#e6e6e6"
C_TEXT_SEC     = "#999999"
C_TEXT_MUTED   = "#666666"
C_ERROR        = "#ff5252"
C_ERROR_BG     = "#331a1a"
C_NAV_BG       = "#0e1812"
C_SIDEBAR_BG   = "#0e1812"
C_ACTIVE_NAV   = "#16241b"
C_STAT_BG      = "#16241b"
C_BTN_TEXT     = "#001a0d"

RADIUS   = 6
RADIUS_LG = 10

# ---- API ----
API_URL = "https://page.goose.gs.cn"

# ---- 运行时全局状态 ----
TOKEN = None
USER = None
SITES = []
switch_to_page = None
refresh_sites = None
deploy_slug_entry = None
tray_icon      = None     # pystray.Icon 实例，gui.py 启动时注入


def notify(title, message):
    """发送气泡通知，tray 不可用时静默跳过"""
    if tray_icon:
        try:
            tray_icon.show_notification(message, title)
        except:
            pass

# ---- 字体（由 gui.py 在 root 创建后注入）----
FONT_XL      = None
FONT_LG      = None
FONT_MD      = None
FONT_BASE    = None
FONT_SM      = None
FONT_STAT    = None
FONT_STAT_VAL = None
FA_FAMILY    = None     # Font Awesome 字体名，由 gui.py 注入
