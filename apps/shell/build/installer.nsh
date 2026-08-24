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

; Clean stale runtime files from a previous installation so renamed or removed
; packages (e.g. koffi native binaries) cannot linger and cause load failures.
; User data in %APPDATA% is never touched.
!macro customInstall
  IfFileExists "$INSTDIR\resources\freecode\dsh\node_modules\*.*" 0 +2
    RMDir /r "$INSTDIR\resources\freecode\dsh\node_modules"
  IfFileExists "$INSTDIR\resources\freecode\dsh\packages\*.*" 0 +2
    RMDir /r "$INSTDIR\resources\freecode\dsh\packages"
  IfFileExists "$INSTDIR\resources\freecode\dsh\apps\*.*" 0 +2
    RMDir /r "$INSTDIR\resources\freecode\dsh\apps"
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
