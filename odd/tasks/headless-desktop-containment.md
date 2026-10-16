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

- [x] HDC-1: Native GUI-subsystem helper launches a suspended target on a private desktop, assigns its Job before resume, forwards pipes/env/cwd/argv/exit status, and watches only its own Job's windows on both desktops. Source-linked offline build and PE/attestation verifier included. Work-unit commit `bad6cc3`.
- [x] HDC-2: Windows async/sync launches use the attested helper; startup configures it before bootstrap, and the opencode2api bypass is removed. Explicit GUI, directory, document, editor and reveal gestures are authenticated and brokered through Electron, with no invisible fallback. Source tests and replayable vendor patch included. Work-unit commit pending.
- [ ] HDC-3: Enforce containment in build/package gates, run actual native and shell integration checks, update operational documentation and Graphify. Work-unit commit pending.

## Progress, evidence and next step

- HDC-1 RED: `rtk go test ./...` failed on missing `runContained`, `hostOptions`, `shouldHide` after correcting an unavailable syscall used by the test. Verifier RED: `rtk node --test scripts/build-headless-host.test.mjs` failed because the build/verifier module did not exist.
- HDC-1 GREEN: native `rtk go test ./... -count=1 -timeout 90s` passed 10 tests (including table cases). Real test-owned windows repeatedly requested visibility/focus; both root and CREATE_NEW_CONSOLE descendant stayed on the same noninteractive desktop. Actual helper termination closed only its owned Job tree. Pipes, Unicode/empty/quoted arguments, environment, cwd and exit code passed. Watchdog emitted native metadata evidence; no user's window contents or processes were inspected.
- `rtk node --test scripts/build-headless-host.test.mjs`: 1/1 passed; rejects console subsystem, stale source attestation and changed binary bytes. Offline native build and `--verify` passed. The native boundary plus its OS tests naturally exceed the planning heuristic; keep this coherent behavior together rather than split flags from lifecycle tests.
- Rollback HDC-1: remove `apps/shell/native/headless-host` and `scripts/build-headless-host*`; no production launch wiring changed in this unit.
- HDC-2 RED: policy/GUI tests failed to load the missing modules; the authenticated GUI-route test returned 404; vendor bridge tests failed on missing module and on absent path brokering. All observed before their implementation.
- HDC-2 GREEN: focused shell suite passed 5 files / 15 tests, including real DSH startup on the private desktop (5.58 seconds), actual Node stdout/stderr, bounded failure reporting and 50 start/restart/stop cycles. Vendor focused tests passed 5 files / 105 tests. Shell typecheck passed. The first concurrent run hit one DSH cold-start timeout, then recovered; running its real startup alone passed in 4.8 seconds. The invalid-image smoke's old direct-spawn assertion was updated to require the actual native helper's CreateProcessW failure instead of relaxing the outcome.
- HDC-2 durability check initially failed because overlapping-patch scratch replay copied CRLF Windows text while applying LF patches outside the repository's checkout rules. A dedicated CRLF regression failed first. Scratch-only CRLF canonicalization now preserves original files and still rejects real content divergence; 3 focused replay tests passed, then `pnpm verify:upstream-patches` passed every check (including idempotency and ordered replay). Patch 180 persists both GUI/path broker changes and their EN/ZH package documentation. No checker was disabled.
- Native dialog, open-app and document/reveal gestures have no session-event/model-output change; OS ownership tests and owner-local GUI route tests cover this deployment behavior rather than a session replay snapshot.
- Rollback HDC-2: revert the protected shell launcher/startup wiring and GUI broker plus vendor patch 180 together; do not leave an isolated DSH runtime without its explicit GUI broker.
- Next: HDC-3, enforce actual packaged helper/runtime compatibility and native smoke in the gates, rebuild affected vendor bundles, run broader checks and refresh Graphify. Engram mirror remains pending for missing host runtime registration.
