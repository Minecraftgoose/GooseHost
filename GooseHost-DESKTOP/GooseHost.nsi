; GooseHost.nsi
!include "MUI2.nsh"

Name "GooseHost"
OutFile "..\release\GooseHost-Setup.exe"
InstallDir "$PROGRAMFILES\GooseHost"
RequestExecutionLevel admin
BrandingText "GooseHost"

!define MUI_ICON "..\dist\icon.ico"
!define MUI_UNICON "..\dist\icon.ico"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "..\dist\*.*"

  CreateDirectory "$SMPROGRAMS\GooseHost"
  CreateShortcut "$SMPROGRAMS\GooseHost\GooseHost.lnk" "$INSTDIR\GooseHost.exe"
  CreateShortcut "$SMPROGRAMS\GooseHost\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\GooseHost.lnk" "$INSTDIR\GooseHost.exe"

  nsExec::ExecToLog '"$INSTDIR\install-context-menu.bat"'

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GooseHost" "DisplayName" "GooseHost"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GooseHost" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GooseHost" "DisplayIcon" "$INSTDIR\GooseHost.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GooseHost" "Publisher" "GooseHost"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GooseHost" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GooseHost" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ExecWait 'taskkill /f /im GooseHost.exe'
  nsExec::ExecToLog '"$INSTDIR\uninstall-context-menu.bat"'
  RMDir /r "$INSTDIR"
  RMDir /r "$SMPROGRAMS\GooseHost"
  Delete "$DESKTOP\GooseHost.lnk"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\GooseHost"
SectionEnd
