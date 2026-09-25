# Design: Gentle-AI Integrated Mode

## Technical Approach

Approach B phased A→B: `gentle-ai` preset copied from `standard`, run via bounded main wrapper reusing IPC/MCP/ModelCatalog/permissions/sandbox/plan-mode. One `150-*` vendorOnly patch for preset row; rest in shell/packages. Precondition: sync + replay 010–140 + verify + gate green. STRICT TDD.

## Architecture Decisions

### Decision: Preset copy of standard

| Option | Tradeoff | Decision |
|---|---|---|
| Copy `standard`, swap persona/prompt only | Drift; re-diff per sync | **Chosen**; keeps plan/permission/sandbox/MCP rows |
| Fork composition | Breaks 070/085/090/100/130 | Rejected |
| C: binary owns orchestration | Bypasses pool/selectModel; violates scope | **Rejected (C)** |

Default `gentle-ai` only if fresh install + binary + doctor pass; stored choice never flips; else `standard`.

### Decision: Bounded CLI wrapper

| Option | Tradeoff | Decision |
|---|---|---|
| New `main/gentle-ai.ts` + `gentle-ai-resolver.ts` | Small, mirrors precedents | **Chosen** |
| Reuse `pool.ts` | Legacy/no-op; not a pool member | Rejected |
| C: launcher only | Ambiguous authority | **Rejected (C)** |

`launchHidden` + ocr.ts caps (bounded stdin, 256KB truncate+flag, 30s timeout, quoting, kill) + caveman pattern (bundled→PATH, cached, null-safe). Install stays in `DSH_HOME` unless `allow-global`+backup+consent.

### Decision: IPC + preload + Zod

| Option | Tradeoff | Decision |
|---|---|---|
| Exactly `status\|doctor\|run` + `window.freecode.gentleAi` | Minimal, closed-contract | **Chosen** |
| Per-skill channels | Explosion | Rejected |

Zod rejects bad/oversize pre-spawn; no keys/env beyond allowlist; `contextIsolation` kept.

### Decision: Resolution + manifest + size gate

| Option | Tradeoff | Decision |
|---|---|---|
| Bundled `resources/gentle-ai/gentle-ai.exe`→PATH, manifest win-x64 `required:false` | Offline-safe + weight | **Chosen** |
| Bundle caveman+RTK always | ~300MB+ blowup | Extra scope; size-gated, else PATH-only |

### Decision: Serena→Engram, registry, RDD v2

| Option | Tradeoff | Decision |
|---|---|---|
| Engram default-on (`failOnStartupError:false`, budget, `isCommandAvailable`); DELETE Serena; update 070/085/090/100/130 | Migration cost, fail-open | **Chosen** |
| Keep Serena | Dual indexer | Rejected |
| Harness writes registry | Ownership conflict | Rejected: read-only projection |

RDD v2 enforced: `status→START→next_transition` verbatim; bad order/paraphrase/missing `START` rejected; audit `{hash,sequence,verdict,time}`, no secrets.

### Decision: Single 150-* patch

| Option | Tradeoff | Decision |
|---|---|---|
| One `150-*` preset-row patch, ordered, idempotent | Minimal sync surface | **Chosen** |
| Multiple patches | Churn | Rejected |

Gate-red blocks design/apply; `vendor/` otherwise read-only.

## Data Flow

```
Renderer → ipc.ts (Zod) → gentle-ai.ts (resolve/run/doctor) → reply (truncated, no secrets)
Picker → 150-* preset → selectModel (deepseek-free/opencode-free); MCP fail-open; registry read-only; RDD → audit
```

## File Changes

| File | Action | Description |
|---|---|---|
| `main/gentle-ai.ts` | Create | Wrapper: doctor/run, caps, guard, audit |
| `main/gentle-ai-resolver.ts` | Create | Bundled→PATH resolve |
| `main/rdd.ts` | Create | Verbatim validator + audit |
| `shared-types/src/index.ts` | Modify | Channels, Zod, `FreeCodeApi.gentleAi` |
| `main/ipc.ts` | Modify | Three handlers |
| `preload/index.ts` | Modify | `freecode.gentleAi` |
| `main/mcp-home.ts`, `runtime.ts`, `mcp-readiness.ts` | Modify | Engram row, Serena delete |
| `resources/runtime-deps.json` | Modify | gentle-ai entry; extras if gate passes |
| `patches/upstream/150-*.patch` | Create | Preset row after sync+gate |
| `contract-tests/*gentle-ai*` | Create | TDD suites |

## Interfaces / Contracts

```ts
GentleAiStatus = { available: boolean; binaryPath: string|null; doctorPass: boolean|null }
GentleAiRun = { output: string; truncated: boolean } | { error: "size"|"timeout"|"validation"|"blocked-global" }
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Contract (STRICT TDD) | Preset list/flip/fallback/preserved/invariance; run happy/invalid/oversize/timeout/no-secret; preload; resolver; doctor; global-block; Engram on/fail-open, Serena absent, 070/085/090/100/130; RDD accept/reject/audit; registry unchanged; gate-blocks-150 | `pnpm test:contract`, mocked spawn/fs |
| Integration | Verify patches, readiness, manifest + gate | Scripts + `release:gate` |
| E2E | Install + open + picker + doctor + run | Manual; no tag w/o approval |

## Threat Matrix

Spawn boundary exists; reference rows are VCS/PR-only → all N/A. Hardening via caps/timeout/quoting/allowlist above.

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Documentation-like paths | N/A: no doc→exec | — | — |
| Git repository selection | N/A: no cwd change | — | — |
| Commit state | N/A: no commits | — | — |
| Push state | N/A: no push | — | — |
| PR commands | N/A: no PR automation | — | — |

## Migration / Rollout

Sync+replay+gate → land `150-*` + shell/packages + tests → migrate Serena→Engram/none → local install/open + approval. Rollback: revert `150-*`, remove IPC/preload, restore Serena, default `standard`; re-verify + gate.

## Open Questions

- [ ] Engram command + budget values?
- [ ] Exe pin + size budget (MB)?
- [ ] `allow-global` UX + backup path?
