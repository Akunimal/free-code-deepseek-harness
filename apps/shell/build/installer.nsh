; Override the default process-running check that false-positives on
; Windows 11 24H2/25H2 (electron-builder #8536).
; electron-builder includes this file BEFORE the template, so the macro
; is already defined when allowOnlyOneInstallerInstance.nsh checks
; !ifmacrondef customCheckAppRunning.

!macro customCheckAppRunning
  ; Kill any running instance silently instead of checking (avoids false positives)
  nsExec::ExecToStack 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Pop $0
  ; Ignore errors (exit code 128 = process not found, 0 = killed, 1 = killed with children)
  Sleep 1000
!macroend

; electron-builder 25.1.8 does not invoke a customInit macro. The supported
; customInstall hook runs AFTER installApplicationFiles and must never delete
; runtime directories there. The beforePack hook replaces the old-version
; uninstaller calls with this macro, so upgrades cannot run a stale NSIS
; uninstaller asynchronously against the new payload.
; User data in %APPDATA% is never touched.
!macro freecodePrepareInstall
  RMDir /r "$INSTDIR\resources\freecode"
!macroend

; The previous uninstaller can return a non-zero code after it has already
; removed the old files. Treat that result as non-fatal so the new payload and
; shortcuts are still installed.
!macro customUnInstallCheck
  StrCpy $R0 0
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  StrCpy $R0 0
  ClearErrors
!macroend

; electron-builder intentionally preserves shortcuts during upgrades when the
; registry says KeepShortcuts=true. That state is not proof that either .lnk
; still exists: users, cleanup tools, or a prior broken installer may have
; removed it. Recreate only missing links after extraction so an upgrade cannot
; leave a registered, working install invisible from Start/Desktop.
!macro customInstall
  !ifdef MENU_FILENAME
    CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
  !endif

  ${ifNot} ${FileExists} "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${endIf}

  ${ifNot} ${FileExists} "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endIf}
!macroend
