# Headless desktop containment

## Objective and authorization

Prevent recurring background console/GUI flashes across harness upgrades with a Windows execution boundary, not only per-call `windowsHide` flags. The user explicitly requested a durable systemic solution and a watchdog. Local implementation and isolated tests are authorized. No installer launch, installed-app modification, process inspection/termination of the user's instance, push, tag, release, or remote execution is authorized here.

## Evidence and limits

- The current central launcher only calls Node `spawn`/`spawnSync` with `windowsHide`; despite its comments it does not attach a Job Object or enforce a desktop boundary.
- The runtime verifier inspects known source/bundle strings. It cannot prevent a new native executable or descendant from creating another window.
- `opencode2api.ts` bypasses the central launcher. The exact process producing the user's latest flash has not been captured, so do not attribute it to a particular executable without evidence.
- Microsoft documents that `STARTUPINFO.lpDesktop` selects a desktop before process execution and that descendants normally inherit their parent's desktop. An asynchronous `SetWinEventHook` alone cannot prevent the first visible frame.
- This is accidental-window containment, not a sandbox against malicious same-user code, UAC, services, or OS brokers.

## Design and scope

Launch Windows background roots through a GUI-subsystem native helper on a unique noninteractive desktop. Create the child suspended, assign an owned kill-on-close Job Object before resuming, preserve standard pipes/environment/cwd/exit code, and fail closed if containment cannot initialize. The helper watches window-show events for its own Job only, hides unexpected windows, and emits bounded metadata without titles, arguments, environment, or window contents. Keep the Electron UI and intentional GUI actions on the interactive desktop via an authenticated explicit GUI broker; preserve the existing directory-dialog bridge. No polling/hiding by executable name and no process-name kills.

## Workflow and delivery

- Route: direct inline; no delegation; substantial implementation.
- TDD: red-green-refactor from the user's explicit session choice. Runners: pnpm/Vitest for shell contracts, `go test` for the dependency-free native Windows helper and actual OS integration tests.
- Forecast: approximately 1,200 authored additions/deletions; use cohesive work units, not a hard line cap.
- Delivery: auto-chain, `stacked-to-main` from the user's session delivery choice. Local feature-branch work-unit commits only; no merge/push/PR without authorization. Branch: `codex/v0.9.5-clean-runtime-bootstrap`.
- Engram mirror `odd/headless-desktop-containment/tasks`: pending; host has not registered an authoritative runtime session ID. Do not invent an ID or perform agent-attributed memory writes.
- Preserve pre-existing Graphify output and unrelated untracked files.

## Acceptance and checks

- A test-owned native fixture deliberately creates a visible window and launches descendants without hidden flags; these remain off the interactive desktop, preserve I/O and exit status, and cannot steal foreground focus.
- Job ownership is established before target execution; killing only a test-owned helper closes only its own descendant range.
- A watchdog never hides an unrelated window; its diagnostics exclude titles, arguments and secrets and are bounded.
- Native initialization errors do not fall back to direct interactive spawning.
- Background shell paths use the centralized protected launcher. Electron UI, authenticated folder picker and explicit user GUI launches remain usable.
- Packaging verifies the native helper is GUI-subsystem Windows x64, current-source-attested, and present in the actual output. Include a real adversarial native smoke, not just source-string contracts.
- Focused tests, shell typecheck and applicable full suites pass. Refresh Graphify after final edits.

## Tasks

- [x] HDC-1: Native GUI-subsystem helper launches a suspended target on a private desktop, assigns its Job before resume, forwards pipes/env/cwd/argv/exit status, and watches only its own Job's windows on both desktops. Source-linked offline build and PE/attestation verifier included. Work-unit commit pending.
- [ ] HDC-2: Wire the fail-closed central seam and startup; remove direct sidecar bypass; preserve intentional GUI actions through the existing authenticated bridge. Add regression tests. Work-unit commit pending.
- [ ] HDC-3: Enforce containment in build/package gates, run actual native and shell integration checks, update operational documentation and Graphify. Work-unit commit pending.

## Progress, evidence and next step

- HDC-1 RED: `rtk go test ./...` failed on missing `runContained`, `hostOptions`, `shouldHide` after correcting an unavailable syscall used by the test. Verifier RED: `rtk node --test scripts/build-headless-host.test.mjs` failed because the build/verifier module did not exist.
- HDC-1 GREEN: native `rtk go test ./... -count=1 -timeout 90s` passed 10 tests (including table cases). Real test-owned windows repeatedly requested visibility/focus; both root and CREATE_NEW_CONSOLE descendant stayed on the same noninteractive desktop. Actual helper termination closed only its owned Job tree. Pipes, Unicode/empty/quoted arguments, environment, cwd and exit code passed. Watchdog emitted native metadata evidence; no user's window contents or processes were inspected.
- `rtk node --test scripts/build-headless-host.test.mjs`: 1/1 passed; rejects console subsystem, stale source attestation and changed binary bytes. Offline native build and `--verify` passed. The native boundary plus its OS tests naturally exceed the planning heuristic; keep this coherent behavior together rather than split flags from lifecycle tests.
- Rollback HDC-1: remove `apps/shell/native/headless-host` and `scripts/build-headless-host*`; no production launch wiring changed in this unit.
- Next: HDC-2, integrate the fail-closed seam and preserve explicit GUI actions. Engram mirror remains pending for missing host runtime registration.
