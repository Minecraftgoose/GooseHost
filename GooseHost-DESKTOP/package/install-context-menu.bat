@echo off
cd /d "%~dp0"
echo Installing 'Deploy to GooseHost' context menu...
python install_context_menu.py
echo.
pause
