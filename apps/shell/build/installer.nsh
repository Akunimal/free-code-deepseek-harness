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

; The beforePack hook replaces the old-version uninstaller calls with this
; macro, so upgrades cannot run a stale NSIS uninstaller asynchronously
; against the new payload. Only the shipped resources/freecode tree is
; removed; the installer then extracts it fresh. User data in %APPDATA%
; is never touched.
!macro freecodePrepareInstall
  RMDir /r "$INSTDIR\resources\freecode"
!macroend

; NOTE: there is intentionally NO customInit macro here. installer.nsi
; evaluates `!ifmacrodef customInit` inside .onInit BEFORE installSection.nsh
; (which `!include`s this file) is ever parsed, so the macro would be
; defined too late to run; verify-nsis-hooks.mjs rejects it outright.
; $INSTDIR sanitizing therefore lives in the beforePack patch
; (patch-nsis.cjs `patchInstDirSanitize`), inserted as raw section
; instructions right after `StrCpy $appExe`, i.e. before setLinkVars,
; CHECK_APP_RUNNING, freecodePrepareInstall and payload extraction.
; Rationale: a stale drive-relative InstallLocation (e.g. `D:dir` left by
; an interrupted run) would otherwise make the whole install silently land
; nowhere with exit code 0. Legit absolute /D paths are preserved.

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

; electron-builder can preserve shortcuts during upgrades when the registry
; says KeepShortcuts=true. That state is not proof that either .lnk points to
; the current executable or has a valid "Start in" directory: a prior broken
; installer may have left an empty working directory behind. Recreate both
; links after extraction so every install/upgrade repairs target and working
; directory deterministically.
!macro customInstall
  ; CreateShortCut stores $OUTDIR as the shortcut's "Start in" directory.
  ; customInstall runs after electron-builder has extracted the payload, and
  ; its last extraction directory is not a stable contract (it may be empty or
  ; point at a temporary NSIS directory). Pin it to the actual app directory
  ; before repairing/creating either shortcut so launching from Start/Desktop
  ; has the same working directory as the packaged executable.
  SetOutPath "$INSTDIR"

  !ifdef MENU_FILENAME
    CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
  !endif

  CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"

  CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
!macroend
