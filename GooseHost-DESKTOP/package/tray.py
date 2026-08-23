# ============================================================
# tray.py — 系统托盘（基于 pystray + Pillow）
# ============================================================
import pystray
from PIL import Image
import tkinter as tk


def create_tray(root: tk.Misc, icon_path: str, title: str = "GooseHost"):
    image = Image.open(icon_path)

    def on_show(icon, item=None):
        root.after(0, root.deiconify)
        root.after(0, root.lift)

    def on_quit(icon, item=None):
        icon.stop()
        root.after(0, root.destroy)

    menu = pystray.Menu(
        pystray.MenuItem("显示主窗口", on_show, default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出", on_quit),
    )

    icon = pystray.Icon(title, image, title, menu)
    # 关闭窗口 = 最小化到托盘
    root.protocol("WM_DELETE_WINDOW", root.withdraw)

    # 通知接口
    def notify(message, title="GooseHost"):
        icon.notify(message, title)

    icon.show_notification = notify
    return icon
