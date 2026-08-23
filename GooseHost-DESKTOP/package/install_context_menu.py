"""Install/uninstall 'Deploy to GooseHost' context menu (no Admin needed)"""
import winreg
import os
import sys

ICON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.ico")
# Use GooseHost.exe (same dir) for deploy, no Python needed
EXE  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "GooseHost.exe")
CMD  = f'"{EXE}" deploy "%1"'
KEY  = "GooseHostDeploy"
MENU = "Deploy to GooseHost"

EXTENSIONS = [".html", ".htm", ".md", ".markdown"]

def install():
    for ext in EXTENSIONS:
        try:
            path = rf"SystemFileAssociations\{ext}\shell\{KEY}"
            k = winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{path}")
            winreg.SetValueEx(k, "", 0, winreg.REG_SZ, MENU)
            winreg.SetValueEx(k, "Icon", 0, winreg.REG_SZ, ICON)
            winreg.CloseKey(k)

            kc = winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{path}\command")
            winreg.SetValueEx(kc, "", 0, winreg.REG_SZ, CMD)
            winreg.CloseKey(kc)
            print(f"  [+] {ext}")
        except Exception as e:
            print(f"  [!] {ext}: {e}")

    print("\nDone. Right-click .html / .md files -> Deploy to GooseHost")


def uninstall():
    for ext in EXTENSIONS:
        path = rf"SystemFileAssociations\{ext}\shell\{KEY}"
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{path}\command")
        except:
            pass
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{path}")
        except:
            pass
        print(f"  [-] {ext}")
    print("\nDone.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "uninstall":
        uninstall()
    else:
        install()
