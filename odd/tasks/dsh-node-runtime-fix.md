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
- `app.log` records `harness supervisor gave up` with `restarts: 5, tail: ""`. `createShellRuntime()` currently does not forward its configured logger to `HarnessSupervisor`, hiding per-child exit information.
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
- [x] **DSH-NODE-1 — Pin compatible Electron and add runtime compatibility gates.** Added the real Electron-backed regression test, observed RED at Electron 35.7.5, then upgraded the shell runtime to Electron 44.7.0 and added a fail-closed `engines.node` prepackage gate with tested semver boundaries. GREEN: the CLI prints its version under Electron 44.7.0/Node 24.21.0, the runtime engine check passes, and native ABI verification passes (14/26 load; 12 foreign-platform/non-ABI warnings).
- [ ] **DSH-NODE-2 — Preserve supervisor failure diagnostics.** Observed RED for both missing logger forwarding and an empty silent-exit tail; source changes and focused tests are in progress. Acceptance: dsh stderr, exit status, and supervisor give-up details reach `app.log`/the stuck dialog without exposing unrelated secrets.
- [ ] **DSH-NODE-3 — Validate the 0.9.2 build inputs.** Run focused tests, shell typecheck/full applicable tests, native ABI verification, Node-engine verification, and Graphify update. Record all outcomes. Only after notifying and receiving the user's go-ahead, build setup/portable artifacts; never install them.

## Progress and next step
DSH-NODE-1 is complete: the CLI test was observed RED on Electron 35.7.5, then GREEN on Electron 44.7.0; the declared-engine verifier and native ABI check pass. The DSH-NODE-2 source/test are present in the working tree but are not part of this work-unit commit. Next: commit DSH-NODE-1 with its test and document, then close/commit DSH-NODE-2 after the observed test outcome. The installed app/processes and profile remain untouched.

## Relevant files
- `apps/shell/package.json` — packaged Electron version and shell scripts.
- `apps/shell/src/main/runtime.ts` — constructs `HarnessSupervisor`; currently omits the configured logger.
- `apps/shell/src/main/harness-supervisor.ts` — child startup/retry and stuck diagnostics.
- `apps/shell/tests/supervisor.smoke.test.ts` — existing DSH supervisor smoke tests.
- `scripts/verify-native-abi.mjs` — prepackage native ABI gate paired with the new DSH Node-engine gate.
- `scripts/verify-dsh-node-engine.mjs` — probes Electron's embedded Node and checks it against DSH's declared engine.
- `vendor/deepseek-harness/apps/cli/lib/bin.js` — vendored CLI entry guarded by `import.meta.main`.
