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
