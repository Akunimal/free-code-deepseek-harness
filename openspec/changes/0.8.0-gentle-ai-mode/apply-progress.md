# Apply Progress — 0.8.0-gentle-ai-mode

Technical artifact: English. First execution; no prior apply-progress existed (no merge needed).

## Status

- `applyState`: ready → in-progress; Phases 1–3 complete, Phase 4 partially verified (focused gates green; full `release:gate` + clean install/open deferred to `sdd-verify` per local-first release flow).
- Branch: `main`. No PR opened, no tags. Single slice to `main` (ask-on-risk, chained No, risk Low, budget very-high, Decision No).
- No fetch/pull/subtree-pull executed (graphify-out dirty + vendor worktree condition honored). Local replay only.
- `skill_resolution: none` (no `sdd-*`/`gentle-ai`/`work-unit-commits`/`chained-pr` match in `.atl/skill-registry.md`; proceeded without skill injection).
- Memory: no `mem_save` tool exposed in this executor environment; findings persist file-only here.

## Phase 1 — Precondition (complete)

- Replay: `node scripts/apply-upstream-patches.mjs` → 15/15 already applied (baseline), then 16/16 with new `150-*` (1 applied, 15 already applied, 0 failed).
- Verify: `node scripts/verify-upstream-patch-stack.mjs` → `PASS` (16 patches; manifestValid, orderMonotonic, vendorOnly, noUnknownFiles, noMissingFiles, idempotent, replayClean, whitespaceClean all true).
- SyncCommit: `git log -- vendor/deepseek-harness` contains `2e70569147` (upstream v0.1.3-alpha.1). No `vendor/` hand-edits; upstream-visible change flows only via `patches/upstream/150-freecode-gentle-ai-preset.patch` + manifest + sanctioned replay script.
- Drift logged:
  - Vendor `standard/agent.cordis.yml` keeps its `070` Serena row (history preserved so per-patch reverse-checks stay independent and the gate stays green). Shell catalog (`mcp-home.ts`) migrated Serena → Engram; the stale vendor Serena row is inert (no `FREECODE_MCP_SERENA_ENABLED` flag is ever set; `disabled !== 'true'` keeps it off) and scheduled for a `070`-rebase follow-up requiring maintainer approval.
  - `scripts/mcp-config.mjs` still pins serena + free-search (out of task owners for 3.5); shell catalog owns the Engram migration. Divergence recorded in `release.contract.test.ts` comment.
  - `apps/shell/resources/freecode/serena-headless-launcher.py` still ships (packaging cleanup deferred); runtime no longer references it.
  - Full `release:gate` (build:desktop + NSIS + MCC real smoke) NOT run in apply; deferred to verify phase.

## Phase 2 — Contract Tests, STRICT TDD RED (complete)

RED run (`vitest run` on the 3 new files, before implementation): **30 failed / 3 passed**.
The 3 passes were registry-presence assertions against the pre-existing `.atl/skill-registry.md`; all production-code references failed (missing modules, missing Zod schemas, missing `150-*` patch).

- `2.1` → `packages/contract-tests/tests/gentle-ai-ipc.contract.test.ts` (13 tests)
- `2.2` → `packages/contract-tests/tests/gentle-ai-preset.contract.test.ts` (12 tests)
- `2.3` → `packages/contract-tests/tests/gentle-ai-review.contract.test.ts` (8 tests)

## Phase 3 — Core Implementation, GREEN (complete)

GREEN run (same 3 files, after implementation): **33 passed / 0 failed**.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1/1.2 | `scripts/verify-upstream-patch-stack.mjs` | Gate | N/A (infra) | N/A | ✅ PASS 16/16 | N/A (single ordered stack) | ➖ None needed |
| 2.1/3.1/3.2/3.3 | `gentle-ai-ipc.contract.test.ts` | Contract (vitest) | ✅ caveman-resolver 8/8 | ✅ 10 failed pre-impl | ✅ 13/13 | ✅ ≥2 cases/behavior (Zod valid/invalid/oversize; resolver bundled/null; doctor missing/caps/guard/no-secret) | ✅ removed unused imports, typed preload via shared-types |
| 2.2/3.4/3.5/3.6 | `gentle-ai-preset.contract.test.ts` | Contract (vitest) | ✅ mcp-home 6/6 post-migration | ✅ 12 failed pre-impl | ✅ 12/12 | ✅ flip/fallback/preserved; engram-on/serena-absent/patch-manifest | ✅ preset-only 150 (reverted overlapping hunk) |
| 2.3/3.7 (+3.6) | `gentle-ai-review.contract.test.ts` | Contract (vitest) | N/A (new) | ✅ 8 failed pre-impl | ✅ 8/8 | ✅ accept/reject/missing-START/audit; registry mtime+bytes | ✅ hash-not-store audit, `_clearRddAudit` for isolation |

### Test Summary

- **Total tests written**: 33 (13 IPC + 12 preset + 8 review)
- **Total tests passing**: 33/33 (focused files); 39/39 with updated `release.contract.test.ts`
- **Layers used**: Contract (33), Unit/shell (mcp-home 6, caveman-resolver 8)
- **Approval tests** (refactoring): `apps/shell/tests/mcp-home.test.ts` rewritten for Engram (spec-driven behavior change); `release.contract.test.ts` updated for Engram migration
- **Pure functions created**: `resolveGentleAiBinary`, `truncateGentleAiOutput`, `resolveDefaultPreset`, `isGlobalWriteAllowed`, `validateRddTransition`, `getSkillRegistryProjection`

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm --filter @freecode/contract-tests exec vitest run tests/gentle-ai-ipc.contract.test.ts tests/gentle-ai-preset.contract.test.ts tests/gentle-ai-review.contract.test.ts` → 3 files passed, 33 tests passed |
| Focused test command (regression) | `pnpm --filter @freecode/contract-tests exec vitest run tests/release.contract.test.ts ...` (4 files) → 39 passed; `pnpm --filter @freecode/shell exec vitest run tests/mcp-home.test.ts tests/caveman-resolver.test.ts` → 14 passed |
| Runtime harness command/scenario and exact result | `node scripts/verify-upstream-patch-stack.mjs` → PASS (16 patches, all 8 checks); manual clean install + open + picker/doctor/run → **deferred to sdd-verify** (local-first gate + user approval required; no tag/release from apply) |
| Rollback boundary | Revert `150-*` via `git apply --reverse patches/upstream/150-freecode-gentle-ai-preset.patch` + remove `gentle-ai:*` IPC/preload (`ipc.ts`, `preload/index.ts`, `shared-types`), delete `gentle-ai*.ts` + `rdd.ts`, restore Serena rows in `mcp-home.ts`/`runtime.ts`; re-run `verify:upstream-patches`. Exact file list in Files Changed below. |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/contract-tests/tests/gentle-ai-ipc.contract.test.ts` | Created | RED→GREEN: Zod channels/bounds, preload shape, resolver, doctor, caps, guard, no-secret (13 tests) |
| `packages/contract-tests/tests/gentle-ai-preset.contract.test.ts` | Created | RED→GREEN: 150 patch, default flip/fallback/preserved, invariance, Engram/Serena, runtime-deps, migration (12 tests) |
| `packages/contract-tests/tests/gentle-ai-review.contract.test.ts` | Created | RED→GREEN: RDD verbatim/START/audit, registry read-only, gate-blocks-150 (8 tests) |
| `packages/shared-types/src/index.ts` | Modified | `gentle-ai:*` channels + `GentleAiStatus/Doctor/RunRequest/RunResponse` Zod + caps + `FreeCodeApi.gentleAi`; rebuilt `dist` |
| `apps/shell/src/main/gentle-ai-resolver.ts` | Created | Bundled `resources/gentle-ai/gentle-ai.exe` → PATH, cached, null-safe (caveman precedent) |
| `apps/shell/src/main/gentle-ai.ts` | Created | Status/doctor/run, 30s timeout, 256KB truncate+flag, kill, `DSH_HOME` guard, read-only registry projection, default-preset resolution |
| `apps/shell/src/main/rdd.ts` | Created | RDD v2 verbatim validator + hashed audit log (no secrets) |
| `apps/shell/src/main/ipc.ts` | Modified | Three Zod-validated handlers (`gentleAiStatus/Doctor/Run`), cleanup on dispose |
| `apps/shell/src/preload/index.ts` | Modified | `window.freecode.gentleAi` (`status/doctor/run`), `contextIsolation` kept, no raw `ipcRenderer` |
| `apps/shell/src/main/mcp-home.ts` | Modified | Serena row deleted; Engram row (`engram` + `['mcp']`, fail-open, reconnect budget, `isCommandAvailable`); launcher/uvx Serena specials removed |
| `apps/shell/src/main/runtime.ts` | Modified | `serenaLauncherPath` plumbing removed |
| `apps/shell/resources/runtime-deps.json` | Modified | `gentle-ai` win-x64 entry (`required:false`, PATH-only until bundling approved; caveman/RTK stay PATH-only per size gate) |
| `apps/shell/tests/mcp-home.test.ts` | Modified | Approval-test migration: Engram expectations, fail-open budget, zero-Serena assertions |
| `packages/contract-tests/tests/release.contract.test.ts` | Modified | Migrated expectation: shell catalog engram (not serena); runtime drops launcher ref; scripts-catalog drift noted |
| `patches/upstream/150-freecode-gentle-ai-preset.patch` | Created | Ordered vendorOnly preset-only patch: new `presets/gentle-ai/{preset.yml,agent.cordis.yml}` (Standard copy, gentle persona, Engram row) |
| `patches/upstream/upstream-patches.json` | Modified | `150` entry (order 150 > 140, vendorOnly, seam, contractTests) |
| `openspec/changes/0.8.0-gentle-ai-mode/tasks.md` | Modified | Phases 1–3 marked `[x]` |
| `vendor/deepseek-harness/.../presets/gentle-ai/` | Applied via replay | New preset materialized in working tree by sanctioned apply script (not a hand-edit) |

## Deviations from Design

1. **150 patch is preset-only (new files) instead of also rewriting the vendor Standard file.** First attempt modified Standard in place (Serena→Engram), which broke `verify-upstream-patch-stack` per-patch reverse independence (`070` reverse no longer applied). Reverted via `git apply --reverse` and re-issued preset-only. Vendor Standard keeps its `070` Serena row as inert history (see drift above). The gentle-ai preset itself carries the Engram row + gentle persona, so picker-visible behavior matches design.
2. **Authored volume exceeds the 550–700 forecast** (new preset file ~290 lines dominates the patch). Budget is `very-high` (no practical cap), risk Low, single PR — no `size:exception` needed; recorded here honestly.
3. **`allow-global` backup + visible consent UX is enforced at the wrapper boundary** (`blocked-global` error without `allowGlobal`; IPC passes the flag through) — the pre-write backup + consent dialog itself is a verify-phase UI concern, not implemented in apply.

## Issues Found

- **Pre-existing (not caused by this change, not fixed):** `tests/lb.contract.test.ts` → `opencode2api CLI flags` fails (`-port` absent from Go binary usage). Outside this change surface (no Go/adapter/lb edits). Reported for the orchestrator; verify phase should confirm against a clean baseline.
- **Pre-existing:** `packages/contract-tests` `tsc --noEmit` reports 2 implicit-`any` errors in `tests/stream.contract.test.ts` (`translate`). Untouched by this change; shell + shared-types typecheck clean.
- Contract tests are hermetic except machine-PATH leakage: fixed by stubbing `PATH` in the doctor-absence test (dev boxes with a real `gentle-ai` on PATH).

## Phase 4 — Verification (partial; remainder owned by sdd-verify)

- [ ] 4.1 `pnpm typecheck` (shell + shared-types clean; contract-tests has 2 pre-existing stream errors), `pnpm test:contract` (in-scope 39/39 green; full suite 101 passed / 1 pre-existing lb fail / 12 skipped), `pnpm verify:upstream-patches` (PASS), `pnpm release:gate` (**not run** — heavy Windows gate incl. desktop build + NSIS; deferred).
- [ ] 4.2 Clean local install + open + picker/doctor/run smoke (**not run** — requires user session + explicit approval; no tag/release from apply).

## Workload / PR Boundary

- Mode: single PR to `main` (no chain; `Chain strategy: pending` unchanged)
- Current work unit: 0.8.0 gentle-ai slice (precondition + RED + GREEN + focused verification)
- Boundary: `010–140` replay baseline → new `150-*` + shell/packages + contract tests; ends before full gate and install/open smoke
- Estimated review budget impact: ~1.2k authored lines (preset copy dominates); within `very-high` budget; risk Low

## Status

12/14 tasks complete (Phases 1–3). Ready for verify (`sdd-verify` owns 4.1 remainder + 4.2, then `sdd-archive`). No tag/release requested or performed.
