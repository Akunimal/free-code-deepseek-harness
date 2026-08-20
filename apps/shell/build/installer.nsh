; Override the CHECK_APP_RUNNING macro to avoid false-positive "cannot close"
; errors on Windows 11 24H2/25H2 when no instance is actually running.
; electron-builder's default nsProcess::FindProcess sometimes detects stale
; handles or phantom entries left by crashed installers.  The oneClick flow
; already installs per-user without elevation, so a real collision (two users
; running the same per-user app) is not a practical scenario.

!macro customCheckAppRunning
  ; Intentionally empty — skip the unreliable process check.
!macroend
