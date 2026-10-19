# Diagnose the NSIS installer startup failure

## Goal

Determine why the 0.9.1/0.9.2 Windows setup launch attempts report loader error 623, and avoid changing a valid product installer based on a sandbox-only failure.

## Problem and current evidence

Both product setup attempts reported `ERROR_ILLEGAL_DLL_RELOCATION` (623) when started from Codex's sandboxed command environment. The same error reproduced when a no-op setup compiled by NSIS 3.12 was launched from that sandbox. The NSIS 3.12 compiler successfully compiled the no-op, and the exact same no-op executable launched from an unsandboxed host shell and exited `0` (PID 20908). This isolates the observed failure to the sandboxed launch context, not the product payload or an NSIS 3.0.4.1 regression. The Windows message describes a system-DLL address-range conflict; the exact inserted DLL names remain unavailable, and querying the Application event log is denied.

The NSIS 3.12 release archive was downloaded from the official `electron-userland/electron-builder-binaries` release and matched its published SHA-256 `fe36a357f3a220db893498e830fd80e0769768a18a99f4e4d2447b982538feed`. Upgrading or pinning the product's NSIS toolchain is not a fix: NSIS 3.12's no-op also fails only when run inside the sandbox and succeeds outside it. Do not change the toolchain for this issue. The actual product setup was not launched outside the sandbox because its hook contains `taskkill /F`; the host process check found no harness process, but the execution safety review still rejected that product-install operation. Thus the sandbox-vs-host no-op diagnosis is verified, while successful installation of the product setup remains unverified.

## Scope and constraints

- This is a fork. No push, upstream merge, PR, tag, or release is authorized or needed.
- Preserve any running user application. Never run `taskkill`, `smoke:nsis`, or `smoke:nsis:upgrade` as part of diagnosis; the NSIS hook contains a forced process-kill path.
- Do not install a product build. Before compiling a replacement product installer, notify the user and wait for explicit approval, per the user's earlier instruction.
- The user authorized downloads needed for this diagnosis. Only the official NSIS 3.12 bundle was downloaded; its SHA-256 was verified against the release page.
- TDD: Red-Green-Refactor, explicitly selected by the user. Project test runner: Vitest (use the local Node/Vitest invocation if pnpm workspace resolution is blocked); use a silent, empty no-op NSIS probe for loader compatibility, never the product installer, as the startup test.
- Engram mirror `odd/nsis-installer-load-error/tasks` is pending because this runtime has no authoritative registered session identity; do not attempt an agent-attributed memory write until registration is restored.

## Acceptance criteria

- The silent no-op installer reproduces 623 inside the Codex sandbox and exits 0 from an unsandboxed host shell.
- Do not pin/upgrade NSIS for this issue; no product-code regression was found.
- Actual product installer launch/install remains unverified; do not invoke the product hook from this task because it can force-kill the app process.
- Any replacement product setup remains local and unsigned unless separately authorized. No installation, process termination, tag, or release occurs without the required user direction.

## Delivery

- Strategy: `exception-ok` (local fork work only; no PR or upstream delivery).
- Forecast: fewer than 200 authored changed lines, generated artifacts excluded.
- Current branch: `upstream-sync/20261008` (non-default; preserve its existing commits and unrelated untracked fixture).

## Tasks

### NSIS-DIAG-1 - Bound the loader failure

- [x] Reproduce the same 623 failure on both product setup versions and confirm it occurs before a setup PID exists.
- [x] Verify x86 system controls start, the two setup files have the same stub-level PE metadata/imports, and the 0.9.1/0.9.2 installer configuration differs only by version metadata.
- [x] Reproduce 623 on both product setup attempts from the sandbox and on the cached NSIS 3.0.4.1 compiler.
- [x] Compile a silent, empty no-op setup with the checksum-verified NSIS 3.12 bundle; it fails with 623 inside the sandbox but exits 0 outside it.
- [x] Conclude the launch error is specific to the Codex sandbox context; the NSIS-version hypothesis is disproven.
- Checks: NSIS 3.0.4.1 `/VERSION`; NSIS 3.12 `/VERSION`; empty no-op compile and `/S` execution inside/outside sandbox; host process inventory. No product installer was executed.
- Evidence: 3.12 bundle SHA-256 matched the official release digest; no-op host run reported PID 20908 / exit 0; host process inventory showed no FreeCode/DeepSeek/Harness/electron process; Application event-log query was denied; no running app process was killed.

### NSIS-FIX-1 - Decide whether the product toolchain needs a change

- [x] Do not alter the NSIS version or add a product regression test for a failure reproduced only inside the sandbox; NSIS 3.12 passes the host no-op startup test.
- Checks: compare the same no-op executable in sandbox vs unsandboxed host; no app source was edited, so Vitest/prepackage checks were not applicable.
- Commit evidence: none; no product-code change was justified.

### NSIS-BUILD-1 - Validate the product setup without risking running processes

- [ ] If desired, user should launch the existing setup outside Codex's sandbox (e.g. File Explorer); the product setup itself was not launched because its NSIS hook force-kills the app process.
- [x] No build, install, tag, release, push, merge, or process termination was performed in this diagnostic.
- Checks: no matching harness process was running at host preflight; actual product installation remains unverified.

## Progress and next step

Root cause of the observed failure was the execution boundary: 623 reproduces inside the Codex command sandbox but not for the same silent no-op executable in the unsandboxed host shell. This is not evidence that the 0.9.1/0.9.2 installer binaries are broken. No source/config file was edited and no product installer was launched. Next step, if the user still wants installation, is to run the existing setup outside the Codex sandbox after closing the app; the setup hook force-kills the target executable and the safety review rejected our product-install attempt. Graphify freshness is unconfirmed because `rtk graphify update 'I:\DeepSeek-Harness\free-code-deepseek-harness'` failed with `uv trampoline failed to canonicalize script path`. Engram mirror remains pending because no authoritative runtime session ID is registered.

## Relevant files

- `apps/shell/package.json` - pins `electron-builder` 25.1.8 and version 0.9.2.
- `apps/shell/electron-builder.yml` - Windows NSIS/portable targets; unchanged from v0.9.1.
- `apps/shell/build/installer.nsh` - installer hook includes forced `taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T`; do not invoke while the app is active.
- `apps/shell/release/FreeCode-DeepSeek-Harness-0.9.1-win-x64-setup.exe` - existing setup used as a comparison.
- `apps/shell/release/FreeCode-DeepSeek-Harness-0.9.2-win-x64-setup.exe` - current local candidate; not installed.
