# Proposal: Gentle-AI Integrated Mode

## Intent

Add a selectable `gentle-ai` preset reusing IPC, MCP, ModelCatalog, permissions, sandbox, and plan-mode. Provide orchestrator value without replacing the opencode2api pool. Default to `gentle-ai` when binary detected, else `standard`.

## Scope

### In Scope

- Selectable `gentle-ai` preset (copy of `standard`, gentle persona); `standard` stays fallback.
- `gentle-ai:*` IPC (`status`, `doctor`, `run`) with Zod contract + preload `window.freecode.gentleAi`.
- Binary resolution bundled `resources/gentle-ai/gentle-ai.exe` → PATH fallback, cached, null-safe.
- Engram as third managed MCP row (on by default); REMOVE Serena row entirely.
- Enforced RDD v2 verbatim transitions in harness; gentle-ai owns `.atl/skill-registry.md`.
- `150-*` vendorOnly patch + contract tests; sync `upstream/master` + replay 15 patches + gate first.

### Out of Scope

- C (full delegation): no pool replacement, no `session.selectModel`/permission/sandbox bypass.
- No `vendor/` edits except replayed patches; no fetch/pull in this phase.
- No tag/release 0.8.0 before local install + open + user approval.
- No harness rewrite of `skill-registry.md`.

## Capabilities

### New Capabilities

- `gentle-ai-preset`: selectable preset composition, default-when-detected, plan/permission invariance.
- `gentle-ai-ipc`: Zod `gentle-ai:*` channels, preload projection, bounded run semantics.
- `gentle-ai-binary`: bundled-or-PATH resolution, `runtime-deps.json`, doctor, `run` caps/timeout.
- `gentle-ai-review`: enforced RDD v2 status/START/next_transition verbatim.

### Modified Capabilities

- None (no `openspec/specs/` exist; MCP/registry effects covered as new capabilities above).

## Approach

Approach B phased A→B; C rejected per `integrated-mode` scope.

- Phase A: detection/doctor/status contract (`resolveGentleAiBinary`, `status`/`doctor`, registry projection).
- Phase B: bounded `run`, preset composition, Engram row, `allow-global` guarded install (backup + visible consent).
- Flow: sync-latest + replay 010–140 + gate → spec → design → tasks → apply → verify → archive → local install/open.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/shell/src/main/*` (seeder, refresher, mcp-home, ipc, resolver, updater) | Modified | Lane, catalog, MCP rows, channel, binary, version sync |
| `apps/shell/src/preload/index.ts`, `packages/shared-types` | Modified | New `gentle-ai:*` Zod + preload |
| `apps/shell/resources/gentle-ai/`, `runtime-deps.json` | New | Bundled exe (+ caveman/RTK extra scope) |
| `vendor/.../agent-presets`, `ui-agent-preset`, `permission-presets`, `plan-mode`, `ui-model-selection` | Modified via `150-*` | Preset row only; authority preserved |
| `patches/upstream/*`, `scripts/apply+verify*.mjs` | Modified | Replay 15, then new `150-*` |
| `.atl/skill-registry.md` | External | Owned by gentle-ai refresh |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bundling weight ~300MB+ (gentle + caveman + RTK) | High | Confirm assets; size gate in design |
| REMOVE Serena breaks 070/085/090/100/130 + MCP tests | High | Delta spec + contract-test update |
| `allow-global` writes outside DSH_HOME | High | Pre-write backup + visible consent |
| Gentle owns registry; harness must not rewrite | Med | Scoped read-only projection |
| Preset-default flip surprises users | Med | Detect-or-fallback + status UI |
| Sync-latest drift in seams | Med | One ordered patch + full gate |
| Broken vendor worktree | Med | Root `git log -- vendor/...`; no fetch here |

## Rollback Plan

Revert `150-*` patch via apply script, remove `gentle-ai:*` IPC/preload, restore Serena row, reset default to `standard`; re-run `verify:upstream-patches` + `release:gate`.

## Dependencies

- Upstream `master` pull + 15-patch replay + gate before `150-*` design.
- Branch `main`, one commit per phase; local-first install/open; tag only on approval.

## Success Criteria

- [ ] Preset selectable; default flips only when binary detected.
- [ ] `status`/`doctor`/`run` bounded, permission/sandbox/plan-mode intact.
- [ ] Serena removed, Engram on, RDD v2 enforced, registry untouched by harness.
- [ ] Sync + replay + gate green; local install/open user-approved.
