# DSH Runtime Node Compatibility

## Goal
Fix the 0.9.2 startup regression where `dsh` exits successfully without starting, and prevent packaging a shell runtime that cannot execute the shipped DSH CLI.

## Problem and why
The installed 0.9.2 shell runs `dsh` through Electron 35.7.5's embedded Node v22.16.0. The shipped DSH CLI only calls `runCli()` behind `if (import.meta.main)`, an API added in Node v22.18.0; its package also declares `engines.node: ^22.19.0 || >=24.0.0`. Under Electron 35.7.5 the CLI therefore exits with code 0 and no output, so the supervisor retries five times with an empty output tail and never reaches readiness. Fixed by packaging Electron 44.7.0, whose embedded Node is v24.21.0.

Evidence gathered read-only:
- `apps/shell/package.json` resolves Electron 35.7.5; its bundled Electron Node reports `v22.16.0` and module ABI 133.
- Installed `resources/freecode/dsh/package.json` requires `^22.19.0 || >=24.0.0`.
- Installed `dsh/apps/cli/lib/bin.js` ends with `if (import.meta.main) await runCli()`.
- Running the installed CLI `--version` under system Node v24.12.0 prints `0.2.1-alpha.1`; the same invocation under Electron 35.7.5 exits 0 with empty stdout/stderr. A temporary-home `dsh web` probe under that Electron also exited 0 without readiness.
- `app.log` recorded `harness supervisor gave up` with `restarts: 5, tail: ""`. Before DSH-NODE-2, `createShellRuntime()` did not forward its configured logger to `HarnessSupervisor`, hiding per-child exit information.
- RED: the new exact-Electron CLI test failed under 35.7.5 with `expected '' to be '0.2.1-alpha.1'`.
- GREEN: the same test passes with Electron 44.7.0; its embedded Node probe reports v24.21.0, which satisfies the staged DSH engine.

## Scope
- Keep the release version at 0.9.2; update the packaged Electron runtime to v44.7.0 and add a regression test that executes the real CLI through that exact Electron binary.
- Add a fail-closed prepackage compatibility check for the DSH Node engine requirement, alongside the existing native-addon ABI verification.
- Forward the shell logger into `HarnessSupervisor` and retain exit code/signal evidence so future failures are diagnosable.
- Run focused and applicable shell checks, then prepare—not install—the 0.9.2 artifacts after notifying the user.

## Constraints and authorization
- User authorized finding and fixing the regression, chose TDD Red-Green-Refactor, and asked that the currently running app/process not be killed or disturbed.
- Do not close/restart the installed app, modify its user data, run its installer, tag/release, push, or merge anything upstream. The user installs the resulting build.
- Before invoking `electron-builder`, notify the user and wait for their go-ahead for that build.
- Work locally on `codex/dsh-node-runtime-fix`; this is a fork. No upstream PR/merge work is in scope.
- Engram mirror is pending: this runtime did not provide an authoritative session identity, so agent-attributed Engram writes are disabled. Preserve this complete document locally and sync the mirror only after the host registers the identity.

## TDD and delivery
- Mode: RED → GREEN → REFACTOR.
- Source: explicit user selection earlier in this task.
- Runner: pnpm + Vitest; focused command will be `pnpm --dir apps/shell exec vitest run <focused-test>`.
- Forecast: about 230 authored changed lines, generated artifacts excluded.
- Delivery strategy: `ask-on-risk` (default); forecast is below the advisory ~400-line threshold. No push or PR is authorized.

## Tasks
- [x] **DSH-NODE-1 — Pin compatible Electron and add runtime compatibility gates.** Added the real Electron-backed regression test, observed RED at Electron 35.7.5, then upgraded the shell runtime to Electron 44.7.0 and added a fail-closed `engines.node` prepackage gate with tested semver boundaries. GREEN: the CLI prints its version under Electron 44.7.0/Node 24.21.0, the runtime engine check passes, and native ABI verification passes (14/26 load; 12 foreign-platform/non-ABI warnings). Work-unit commit: `5e3646f`.
- [x] **DSH-NODE-2 — Preserve supervisor failure diagnostics.** Observed RED for both missing logger forwarding and an empty silent-exit tail; forwarded the configured shell logger and appended bounded code/signal exit evidence. Focused runtime tests pass and preserve the tail limit. Full shell test suite also passes. Work-unit commit: `28f33dc`.
- [x] **DSH-NODE-3 — Validate the 0.9.2 build and produce setup/portable artifacts.** Typecheck, shell build, all shell Vitest tests, prepackage verification, and Graphify update passed. After the user's explicit go-ahead, `pnpm --dir apps/shell package` completed and generated the v0.9.2 setup and portable executables. Verified both embedded file product versions are 0.9.2; setup SHA-512 matches `latest.yml`, and portable SHA-256 was computed. Setup: 526,172,056 bytes; portable: 526,009,162 bytes. Work-unit commit: recorded below after commit.

## Progress and next step
DSH-NODE-1/2 are implemented and validated in commits `5e3646f` and `28f33dc`. `pnpm --dir apps/shell typecheck`, `pnpm --dir apps/shell build`, full Vitest (26 files, 177 tests), `prepackage:verify`, and frozen lockfile validation all pass. The real DSH smoke reached readiness. Graphify's tracked root graph has 713 nodes/1,351 edges/34 communities (checkpoint `e0fa648`). The user approved packaging; the build completed and produced `apps/shell/release/FreeCode-DeepSeek-Harness-0.9.2-win-x64-setup.exe` and `apps/shell/release/FreeCode-DeepSeek-Harness-0.9.2-win-x64-portable.exe`. Their file versions are 0.9.2; sizes are 526,172,056 and 526,009,162 bytes respectively. `latest.yml` setup SHA-512 matches the independently calculated file hash; portable SHA-256 is `af158c7d99781168ac5520e732c7ba3079aeafc2b0f50ef4b32e9fc9db38d21e`. User will install after finishing with the currently running app. Neither the installed app/processes nor profile were touched; no install, tag, release, push, or upstream merge was performed. Next: deliver artifact paths and await the user's install/result before any release action.

## Relevant files
- `apps/shell/package.json` — packaged Electron version and shell scripts.
- `apps/shell/src/main/runtime.ts` — constructs `HarnessSupervisor` and forwards the configured shell logger.
- `apps/shell/src/main/harness-supervisor.ts` — child startup/retry and stuck diagnostics.
- `apps/shell/tests/supervisor.smoke.test.ts` — existing DSH supervisor smoke tests.
- `scripts/verify-native-abi.mjs` — prepackage native ABI gate paired with the new DSH Node-engine gate.
- `scripts/verify-dsh-node-engine.mjs` — probes Electron's embedded Node and checks it against DSH's declared engine.
- `vendor/deepseek-harness/apps/cli/lib/bin.js` — vendored CLI entry guarded by `import.meta.main`.
- `graphify-out/graph.json` — refreshed app-shell architecture graph (713 nodes, 1,351 edges).
