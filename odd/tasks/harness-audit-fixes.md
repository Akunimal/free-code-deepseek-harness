# Harness audit fixes

## Objective

Close the five confirmed findings from the read-only harness audit: privileged Electron navigation/IPC boundary, overlapping model-catalog refreshes, stale Tor status in the Pool Status overlay, and two request/response integrity defects in the legacy adapter load balancer.

## Problem and why

The audit found that the privileged harness renderer has no main-frame navigation guard and most IPC handlers do not verify the caller; a manual catalog refresh can return before the initial refresh has produced a catalog; the Tor overlay is omitted from status event fan-out; and the dormant adapter LB can lose request bytes above 10 MiB and return an incomplete response after exhausting retries.

## Scope

- Add trusted-origin navigation and per-handler IPC sender/frame authorization, including the limited Pool Status overlay permissions.
- Coalesce catalog refresh callers onto the same in-flight operation.
- Push asynchronous Tor state changes to the Pool Status overlay.
- Preserve large request bodies on the LB's single-attempt path and avoid forwarding representation-length headers for a body that was discarded after retry exhaustion.
- Add regression tests for each behavior and update this task record with observed verification and commit IDs.
- Re-investigate the three integration timeouts from the first full shell run and compile a fresh isolated v0.9.5 Windows x64 setup after the checks pass.

## Constraints

- Build of an isolated setup is authorized; do not launch or install it. No release, tag, push, or remote operation.
- Do not inspect, stop, restart, or interfere with a running FreeCode instance.
- Preserve all pre-existing unrelated worktree changes and untracked files.
- TDD mode: red-green-refactor, from the user's explicit earlier choice; runner: pnpm/Vitest.
- Route: direct inline; TDD: red-green-refactor; runner: pnpm/Vitest. Forecast exceeded ~400 authored changed lines (excluding generated Graphify output); user selected `stacked-to-main` for the delivery chain. This authorizes only local work-unit commits on the current feature branch; no push, PR, merge, tag, or release is authorized for this task.
- Engram mirror: pending because the runtime has no authoritative registered session ID; do not invent one or write agent-attributed memory.

## Acceptance criteria

- Non-trusted or subframe IPC invocations are rejected; only the expected loopback harness origin and explicitly scoped overlay calls are allowed.
- External main-frame navigations/redirects from the privileged harness are prevented.
- Concurrent/manual refresh waits for and returns the same completed catalog, never `undefined` or a stale null.
- Pool Status sees Tor `starting`, `ready`, `failed`, and `stopped` pushes after it subscribes.
- A request larger than 10 MiB reaches the selected worker byte-for-byte once without retries.
- Exhausted retry responses remain complete and do not advertise stale body length/encoding metadata.
- Focused tests and applicable static/type checks pass; the live app remains untouched.

## Tasks

- [x] HAF-1 — Protect privileged renderer navigation and IPC; add negative/positive security contracts. Added exact-origin/port allowlisting, top-level origin checks in every IPC handler, overlay-only channel permissions, navigation/redirect guards, and reload of the existing view when the supervisor publishes a new ephemeral port. RED observed before implementation; GREEN: 27/27 focused Vitest tests and shell TypeScript check passed. Implementation commit: `468d21f` (`fix(security): restrict harness renderer IPC`). Runtime smoke: N/A for this unit; do not launch/attach to the user's app, and the pure policy tests plus production-source contract cover the changed decision points.
- [x] HAF-2 — Coalesce model catalog refresh calls; add an initial-refresh race regression test. `doRefresh` now returns one shared in-flight promise to boot/timer/manual callers. Failed refreshes report failure and do not hand IPC a previous/null catalog; retry timers can start after the shared operation settles. RED: focused state test failed to resolve missing single-flight module, then exposed the async operation scheduling assumption in the test; GREEN: 27/27 focused Vitest tests and shell TypeScript check passed. Implementation commit: `98a8018` (`fix(models): coalesce catalog refresh requests`).
- [x] HAF-3 — Fan Tor status changes out to the Pool Status overlay; add an event delivery contract. Added a dedicated Tor target list so the harness and live overlay receive asynchronous Tor state while unrelated broadcasts remain harness-only; destroyed targets are filtered. RED: event contract failed because overlay got no Tor event. GREEN: 28/28 focused IPC/overlay tests and shell TypeScript check passed. Implementation commit: `7d71b7e` (`fix(tor): broadcast status to pool overlay`).
- [x] HAF-4 — Preserve oversized request bodies on the legacy LB's one-shot path; add a byte-for-byte test. Declared >10 MiB bodies skip buffering; unknown-length bodies use a non-destructive iterator and stream the consumed prefix plus remaining bytes to one worker without retry. RED: oversized Content-Length request timed out because the old early-return async iterator destroyed the input stream. GREEN: both Content-Length and chunked >10 MiB byte-for-byte tests passed; adapter TypeScript check passed. Commit: `9542d43` (`fix(adapter): preserve large bodies and complete retry responses`), shared with HAF-5 because both harden the same LB request/response boundary.
- [x] HAF-5 — Strip stale representation headers from exhausted retry responses; add response-completeness tests. Empty synthesized responses now drop body framing/representation headers but preserve retry metadata and request IDs; HEAD retains corresponding GET metadata. RED: exhausted retries timed out because the response advertised the discarded JSON body's Content-Length. GREEN: 13/13 adapter tests and adapter TypeScript check passed. Commit: `9542d43` (`fix(adapter): preserve large bodies and complete retry responses`), shared with HAF-4 because both harden the same LB request/response boundary.
- [x] HAF-6 — Reproduce the three shell integration timeouts before deciding on a code fix. All three pass individually; all three pass together; a fresh full shell run passes 52/52 files and 371/371 tests. No deterministic source defect reproduced, so no speculative code change.
- [x] HAF-7 — Run desktop prepackage checks and build a fresh isolated v0.9.5 Windows x64 NSIS setup; verify the artifact without launching/installing it. All prepackage checks passed; electron-builder produced the setup and blockmap; `verify-nsis-package-output.mjs` verified PE/package metadata, update manifest, runtime manifest, and separate-DSH policy. Artifact: `apps/shell/release-0.9.5-audit-20261016/FreeCode-DeepSeek-Harness-0.9.5-win-x64-setup.exe` (178,764,405 bytes; SHA-256 `91578ddde1b0a27f68bebc16fbcbf74998700479cb179acb2b0e2ac62c28ffb8`). Setup was not launched or installed. Commit: pending.

## Progress and evidence

- Exploration complete; baseline audit recorded five findings and verified existing focused suites.
- HAF-1 RED observed: `renderer-security.test.ts` could not resolve the not-yet-implemented policy module; the production-source contract also failed because the harness navigation guard was absent. One test harness import mistake was corrected before accepting this RED evidence.
- HAF-1 GREEN observed: `rtk pnpm --filter @freecode/shell exec vitest run tests/renderer-security.test.ts tests/window-composition.test.ts tests/model-refresh-ipc.test.ts` — 3 files / 27 tests passed; `rtk pnpm exec tsc -p apps/shell/tsconfig.json --noEmit` — passed; `rtk git diff --cached --check` — passed.
- HAF-2 RED observed: `tests/model-refresh-state.test.ts` failed to load the absent `single-flight.js` helper before implementation. Once implemented, the first GREEN attempt found the regression test had not waited for the intentionally deferred operation invocation; the corrected test observes the single-flight lifecycle rather than depending on synchronous operation entry.
- HAF-2 GREEN observed: `rtk pnpm --filter @freecode/shell exec vitest run tests/model-refresh-state.test.ts tests/model-refresh-ipc.test.ts tests/window-composition.test.ts` — 3 files / 27 tests passed; `rtk pnpm exec tsc -p apps/shell/tsconfig.json --noEmit` — passed.
- HAF-3 RED observed: `rtk pnpm --filter @freecode/shell exec vitest run tests/model-refresh-ipc.test.ts` — the new Tor fan-out test failed because the overlay received no `tor:status` event.
- HAF-3 GREEN observed: `rtk pnpm --filter @freecode/shell exec vitest run tests/model-refresh-ipc.test.ts tests/tor-ipc-contract.test.ts tests/window-composition.test.ts` — 3 files / 28 tests passed; `rtk pnpm exec tsc -p apps/shell/tsconfig.json --noEmit` — passed.
- HAF-4 RED observed: the original large-body path timed out in `tests/lb-retry.test.ts` after the async iterator stopped at the 10 MiB cap and destroyed the incoming request.
- HAF-4 GREEN observed: `rtk pnpm --filter @freecode/opencode-adapter exec vitest run tests/lb-retry.test.ts` — 12/12 tests passed, including Content-Length and chunked oversized request byte-preservation; `rtk pnpm --filter @freecode/opencode-adapter exec tsc --noEmit` — passed.
- HAF-5 RED observed: exhausted retries with two workers timed out because the synthesized empty 429 response retained the previous response's `Content-Length`.
- HAF-5 GREEN observed: `rtk pnpm --filter @freecode/opencode-adapter exec vitest run tests/lb-retry.test.ts` — 13/13 tests passed; `rtk pnpm --filter @freecode/opencode-adapter exec tsc --noEmit` — passed (exit 0).
- Full shell suite observed: `rtk pnpm --filter @freecode/shell exec vitest run` — 49/52 files passed, 368/371 tests passed. Three integration failures remain unverified/unrelated to changed tests: `profile-models.integration.test.ts` timed out waiting for CLI readiness stdout; `supervisor.smoke.test.ts` timed out waiting for initial harness readiness; `tor-startup.integration.test.ts` received no Tor bootstrap progress. Do not hide these failures.
- Focused shell regression suite observed after full run: 5 files / 37 tests passed; `rtk pnpm exec tsc -p apps/shell/tsconfig.json --noEmit` passed.
- Full adapter suite observed: `rtk pnpm --filter @freecode/opencode-adapter exec vitest run` — 2 files / 24 tests passed; adapter TypeScript check passed.
- HAF-6 retest evidence: `tests/tor-startup.integration.test.ts` passed in isolation; `tests/profile-models.integration.test.ts` passed in isolation (50.44s); `tests/supervisor.smoke.test.ts` passed in isolation (5/5); the three together passed (3 files / 7 tests); then `rtk pnpm --filter @freecode/shell exec vitest run --reporter=dot` passed all 52 files / 371 tests. The initial 49/52, 368/371 run did not reproduce; its cause remains undetermined, rather than attributed to a code bug.
- HAF-7 build evidence: `rtk pnpm --filter @freecode/shell package:desktop` with `FREECODE_RELEASE_TARGETS=nsis` and fresh output `release-0.9.5-audit-20261016` passed all prepackage verification, built Electron 44.0.0 / Windows x64 NSIS setup, and generated its blockmap. `rtk node scripts/verify-nsis-package-output.mjs apps/shell/release-0.9.5-audit-20261016/FreeCode-DeepSeek-Harness-0.9.5-win-x64-setup.exe` passed (178,764,405 bytes); SHA-256: `91578ddde1b0a27f68bebc16fbcbf74998700479cb179acb2b0e2ac62c28ffb8`. No install, launch, publication, tag, push, or remote operation was performed.
- Graphify update completed: 121,220 nodes / 257,548 edges; aggregated view rebuilt with 4,598 communities. Graphify reported labels changed with the new community set and suggested `graphify label` (LLM); label refresh was not run because it is not required for graph freshness and would use an LLM.
- Engram mirror is pending until runtime registration is available.

## Next step

Implementation, regression suite, and isolated setup build are complete. Record the final local work-unit commit below; the setup remains a locally built, statically verified artifact only. Do not install, launch, publish, tag, push, or overwrite prior release artifacts under this task's authorization.
