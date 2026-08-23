@echo off
cd /d "%~dp0"
echo Uninstalling 'Deploy to GooseHost' context menu...
python install_context_menu.py uninstall
echo.
pause
