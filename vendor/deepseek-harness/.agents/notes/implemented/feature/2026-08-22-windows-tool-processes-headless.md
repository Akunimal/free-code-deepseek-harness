# Agent Note: Keep Windows Tool Processes Headless

Status: implemented

## Problem

The regular local subprocess path already passed `windowsHide: true`, but tool execution also has SDK and PTY lifecycle paths outside that seam. In particular, Windows ConPTY cleanup in `node-pty` forks `conpty_console_list_agent` without `windowsHide`, which can flash a console when a terminal tool closes. The SDK client was also a direct child-process path without the option. The Electron-run-as-Node picker fallback uses `wscript.exe`, a GUI-subsystem helper whose owned BrowseForFolder dialog must remain visible.

## Decision

Keep the headless contract at every tool-side process boundary:

- pass `windowsHide: process.platform === 'win32'` to the SDK runtime spawn;
- leave `windowsHide` unset for the `wscript` picker helper; applying it hides the dialog owned by that GUI process;
- maintain a pnpm patch for the `node-pty` ConPTY cleanup fork;
- preserve the Windows ACL sandbox flags because `CREATE_NO_WINDOW` is known to cause `STATUS_DLL_INIT_FAILED` with its restricted token.

The actual folder chooser remains visible because it is an intentional user-facing dialog. `wscript.exe` does not create a console window, so it does not need a console-hiding flag.

## Verification

Focused SDK, subprocess, and native-picker suites pass: 3 files / 19 tests. The resolved `node-pty` package under `node_modules/.pnpm` contains the patched fork option, and the vendor `pnpm typecheck` completes successfully.
