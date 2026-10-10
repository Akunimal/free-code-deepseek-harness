# Finish upstream sync and prevent PowerShell console flashes

## Goal

Complete the local `deepseek-harness` sync on `upstream-sync/20261008`, preserve all fork-owned overlays as an ordered patch stack, and ensure Win32-created `pwsh` children stay hidden and do not steal focus.

## Problem and root cause

In v0.9.1, native `CreateProcessW` and `CreateProcessAsUserW` creation paths supplied redirected stdio but omitted `STARTF_USESHOWWINDOW` and `SW_HIDE`. The outer Node `windowsHide` option cannot hide a grandchild created through native Win32. The imported upstream snapshot `15a4129ecf` contains the production fix and assertions for both creation paths.

## Scope and constraints

- Upstream snapshot: `deepseek-harness` `0.2.1-alpha.1`, commit `15a4129ecf332e3e1018f26ee50c49f3f0b2054d`.
- Local sync commit: `3b46b46ae9722a70cb3fb5e075aba7ebd00f0b5a` on `upstream-sync/20261008`; manifest `syncCommit` points to this commit.
- Preserve and replay the fork's ordered `patches/upstream/` overlays. This is a fork: no upstream push, PR, or merge is in scope.
- Do not reset, abort, clean, discard work, or stop/kill the user's running process. Do not compile/package the installer until notifying the user and receiving approval.
- TDD: Red-Green-Refactor, explicitly selected by the user. Runner: vendored Vitest; pnpm cannot resolve this sandbox workspace, so focused Vitest is invoked through local Node.
- Exact focused command (cwd `vendor/deepseek-harness`):
  `node -e 'process.env.TEMP=process.cwd();process.env.TMP=process.env.TEMP;process.env.TMPDIR=process.env.TEMP;const r=require("node:child_process").spawnSync(process.execPath,["node_modules/vitest/vitest.mjs","run","--config","vitest.config.ts","packages/subprocess/win32-process/tests/ordinary-process.spec.ts","packages/subprocess/win32-process/tests/process.spec.ts"],{encoding:"utf8",env:process.env,maxBuffer:32*1024*1024});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);process.exit(r.status??1);'`
- Graphify was queried before source inspection. `rtk graphify update I:\DeepSeek-Harness\free-code-deepseek-harness` was attempted after the edits but failed with `uv trampoline failed to canonicalize script path`; graph freshness is unconfirmed.
- Engram mirror `odd/pwsh-console-window-regression/tasks` is pending because the runtime did not register an authoritative session identity. Do not attempt agent-attributed memory writes until the host re-registers it.

## Acceptance criteria

- No unmerged index entries or active merge remain; imported upstream state and fork overlays are committed locally.
- The ordered patch stack replays idempotently on top of the imported snapshot.
- Tests assert `STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW` and `SW_HIDE` for ordinary and restricted-token Win32 creation.
- Focused tests are green. Any environment-blocked checks are recorded honestly. Installer compilation remains unstarted pending user approval.

## Delivery

- Strategy: `exception-ok`; this is a single local subtree sync, well beyond the advisory ~400-line review heuristic. No upstream delivery is authorized or needed.
- Forecast: upstream tree import is substantially over 400 changed lines; focused regression guards are under 150 authored lines.

## Tasks

### SYNC-1 - Complete local upstream subtree sync

- [x] Resolve the imported subtree against upstream, including upstream deletions, then replay the fork overlays.
- [x] Update the patch manifest to upstream `0.2.1-alpha.1` and local sync anchor `3b46b46ae9722a70cb3fb5e075aba7ebd00f0b5a`.
- [x] Replay all 20 ordered patches; refresh overlapping patches so reverse/replay validation remains clean.
- [x] Confirm no unmerged index entries or active merge remain.
- [x] Create the local work-unit commit for the replayed fork state and this task evidence; do not push.
- Checks: `node scripts/apply-upstream-patches.mjs` twice (20 already-applied, zero failed both runs); `node scripts/verify-upstream-patch-stack.mjs`; `git ls-files -u`; `git diff --check`.
- Evidence/limitations: patch replay succeeded twice. The verifier reports all static/replay/whitespace checks green except its idempotency subprocess: pnpm tries an implicit install and fails with `EPERM` resolving the workspace realpath. Full `git diff --check` flags whitespace in serialized patch hunks; the vendored source and task/docs checks pass. No remote operation was performed.
- Commit evidence: `109a14ec22f44a6fc26162eb8f34a83255f63f57` (`chore(upstream): complete 0.2.1-alpha.1 sync with fork patches`).

### REG-1 - Guard hidden Win32 child windows

- [x] Confirm and retain hidden startup flags for both `CreateProcessW` and `CreateProcessAsUserW` routes.
- [x] TDD Red: temporarily remove `STARTF_USESHOWWINDOW`; three assertions fail (`257` expected, `256` received). Restore the production fix.
- [x] TDD Green: focused Vitest run passes 2 files / 19 tests. Both creation routes have hidden-flag regression assertions, so no additional duplicate test file is needed.
- [x] Re-run focused Win32 tests after patch replay: 2 files / 19 tests passed.
- [x] Record the local work-unit commit containing this behavior, regression proof, and sync docs.
- Checks: focused Vitest command above; ordered patch replay; graph freshness. No installer/build/package command.
- Evidence/limitations: separate OCR/content check passed 145 tests across 3 suites; the read-image suite had 28 failures from sandbox `EPERM` during temp-path `realpath`, unrelated to Win32 startup. `pnpm` and the patch-stack verifier's pnpm subprocess are blocked by the same sandbox realpath restriction.
- Commit evidence: `109a14ec22f44a6fc26162eb8f34a83255f63f57` (`chore(upstream): complete 0.2.1-alpha.1 sync with fork patches`).

## Progress and next step

Root cause is fixed by the imported native startup-info flags, and both creation routes are protected by a proven Red-Green regression test. The local work-unit commit is `109a14ec22f44a6fc26162eb8f34a83255f63f57`; no merge is active, no unmerged paths remain, and all 20 fork patches apply idempotently through the direct local Node runner. Graphify freshness could not be confirmed because its update command failed with `uv trampoline failed to canonicalize script path`. No process was killed; no installer compilation was started. Next step: wait for user approval before any installer compilation.

## Relevant files

- `vendor/deepseek-harness/packages/subprocess/win32-process/src/process.ts` - native Win32 process startup flags.
- `vendor/deepseek-harness/packages/subprocess/win32-process/tests/ordinary-process.spec.ts` - ordinary `CreateProcessW` hidden-window assertions.
- `vendor/deepseek-harness/packages/subprocess/win32-process/tests/process.spec.ts` - restricted-token `CreateProcessAsUserW` hidden-window assertions.
- `patches/upstream/` - ordered fork-owned overlays and their manifest.
- `docs/UPSTREAM-SYNC.md` and `docs/UPSTREAM-PATCHING.md` - local sync and replay policy.
