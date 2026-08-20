; Override the default process-running check that false-positives on
; Windows 11 24H2/25H2 (electron-builder #8536).
; electron-builder includes this file BEFORE the template, so the macro
; is already defined when allowOnlyOneInstallerInstance.nsh checks
; !ifmacrondef customCheckAppRunning.

!macro customCheckAppRunning
  ; intentionally empty — skip nsProcess/tasklist pipe check
!macroend
