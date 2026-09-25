# Tasks: Gentle-AI Integrated Mode

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550-700 (impl ~350, tests ~250, 150-* patch ~50) |
| 400-line budget risk | Low (review_budget very-high, no practical cap) |
| Chained PRs recommended | No |
| Suggested split | Single PR to main |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Precondition + STRICT TDD contracts (RED) | Single PR | `pnpm verify:upstream-patches` | N/A (local gate only, no spawn) | Delete contract files only |
| 2 | Wrapper/resolver/IPC/preset/MCP/registry/review + verify install+open | Single PR | `pnpm test:contract` | Manual clean install + open + picker/doctor/run | Revert `150-*` patch, remove `gentle-ai:*` IPC/preload, restore Serena row |

## Phase 1: Precondition — Sync + Replay + Gate

- [x] 1.1 Replay 15 patches `010-140` via `scripts/apply-upstream-patches.mjs`, run `pnpm verify:upstream-patches` + `pnpm release:gate`. Owner: `patches/upstream/*.patch`, `scripts/apply-upstream-patches.mjs`. Done: gate green; red blocks task 3.4.
- [x] 1.2 Confirm vendor syncCommit via local `git log -- vendor/deepseek-harness` (no fetch/pull). Owner: `vendor/deepseek-harness` (read-only). Done: commit `2e70569` confirmed or drift logged, no `vendor/` edits.

## Phase 2: Contract Tests — STRICT TDD RED First

- [x] 2.1 Write RED tests for `gentle-ai:status|doctor|run` Zod, bounds, preload shape, resolver, doctor, caps, no-secret. Owner: `packages/contract-tests/*gentle-ai*`. Done: `pnpm test:contract` fails before impl; covers invalid/oversize/timeout.
- [x] 2.2 Write RED tests for preset list, default-flip/fallback/preserved, invariance, Engram on/fail-open, Serena absent, `070/085/090/100/130` migration. Owner: `packages/contract-tests/*gentle-ai*`. Done: fails before impl, all scenarios defined.
- [x] 2.3 Write RED tests for RDD v2 verbatim/START/audit, registry read-only, gate-blocks-150. Owner: `packages/contract-tests/*gentle-ai*`. Done: paraphrase/missing-START rejected; registry mtime unchanged.

## Phase 3: Core Implementation — GREEN

- [x] 3.1 Create `main/gentle-ai-resolver.ts` (bundled `resources/gentle-ai/gentle-ai.exe` → PATH, cached, null-safe). Owner: `apps/shell/src/main/gentle-ai-resolver.ts`. Done: bundled preferred, null without throw.
- [x] 3.2 Create `main/gentle-ai.ts` wrapper (doctor/run, 30s timeout, 256KB truncate+flag, quoting, kill, `DSH_HOME` guard). Owner: `apps/shell/src/main/gentle-ai.ts`. Done: global write blocked without `allow-global`+backup+consent.
- [x] 3.3 Add Zod channels + preload `window.freecode.gentleAi` (`status|doctor|run` only, `contextIsolation`). Owner: `packages/shared-types/src/index.ts`, `apps/shell/src/main/ipc.ts`, `apps/shell/src/preload/index.ts`. Done: invalid payload rejected pre-spawn, no secrets.
- [x] 3.4 Create ordered idempotent `150-*` preset-row patch (copy `standard`, persona/prompt only). Owner: `patches/upstream/150-*.patch`. Done: picker lists `gentle-ai`; plan/permission/sandbox rows match `standard`.
- [x] 3.5 Add Engram default-on row (`failOnStartupError:false`, budget, `isCommandAvailable`), DELETE Serena row + update `070/085/090/100/130`. Owner: `apps/shell/src/main/mcp-home.ts`, `apps/shell/src/main/runtime.ts`, `apps/shell/src/main/mcp-readiness.ts`. Done: fail-open startup, no Serena refs.
- [x] 3.6 Add read-only registry projection + `runtime-deps.json` gentle-ai entry (caveman/RTK PATH-only if size gate fails). Owner: `apps/shell/src/main/*.ts`, `apps/shell/resources/runtime-deps.json`. Done: registry bytes/mtime unchanged; manifest win-x64 entry.
- [x] 3.7 Create `main/rdd.ts` verbatim validator (`status→START→next_transition`) + audit `{hash,sequence,verdict,time}`. Owner: `apps/shell/src/main/rdd.ts`. Done: bad order/paraphrase rejected, no secrets logged.

## Phase 4: Verification — Local First

- [ ] 4.1 Run `pnpm typecheck`, `pnpm test:contract`, `pnpm verify:upstream-patches`, `pnpm release:gate`. Owner: `scripts/release-gate.mjs`. Done: all green on Windows.
- [ ] 4.2 Clean local install + open + picker/doctor/run smoke (no tag/release without approval). Owner: `apps/shell/*`, `resources/gentle-ai/*`. Done: default flips only when binary+doctor pass; user approved.
