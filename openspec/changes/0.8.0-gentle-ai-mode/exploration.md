# Exploration: gentle-ai mode as orchestrator (0.8.0-gentle-ai-mode)

## Current State

The harness ships two model lanes through the Electron shell (`apps/shell`), not through
a single pool:

- `deepseek-free` (`FreeLLMPool`, label migrated in `provider-seeder.ts`) over the
  loopback load-balancer, and `opencode-free` (`OpenCode No-Auth`) over the
  `opencode2api` anonymous-Zen sidecar. `packages/opencode-adapter/src/pool.ts`
  (`OpenCodePool`, 1..16 clamp, health/respawn/round-robin/sticky) is the legacy
  worker-pool implementation; current runtime (`apps/shell/src/main/index.ts`,
  `freellmpool.ts`) reports `freellmpool proxy active` and treats
  `pool:restartWorker` / `pool:resize` IPC as no-ops.
- `provider-seeder.ts` performs an idempotent merge into `$DSH_HOME/settings.yaml`
  (`llm-pi-ai.providers`, non-empty `models` required by the upstream namespace
  validator, per-model `reasoningEfforts`/`compat` via `reasoning-policy.ts`,
  `agent-default-model` pinned to `deepseek-free`). `model-refresher.ts` probes
  `/v1/models` + `/v1/chat/completions`, persists `model-catalog.json`, syncs only
  responders (latency-sorted, `ALWAYS_EXPOSED_MODELS = x-preview-f`,
  `strictResponders` for anonymous lanes), and uses atomic tmp+rename writes.
- Model selection UI/code is upstream-owned:
  `vendor/deepseek-harness/packages/client/ui-model-selection` (two entries over one
  per-session `ModelDirectoryResolver`: `/model` popupSelect + composer
  `conversation.input.model` seat, both via `session.models` /
  `session.selectModel`, generation-guarded) plus `ui-settings-models` and the
  `110-freecode-mimo-thinking-toggle.patch` seam
  (`session-controller` + `llm-pi-ai` + `ui-model-selection`).
  Contract: `packages/shared-types` (Zod IPC).
- Permissions/sandbox are upstream-authoritative: `fs-sandbox` fences
  write/edit per-call sandbox mode (reads pass through);
  `interaction/permission-presets` (`workspace-write` + `ask`,
  `danger-full-access` + `never`, `custom` derived) is the only write path
  (`/permission`, `permissions` projection); `plan-mode` is logged per-agent
  collaboration state (`plan/mode`, `exit_plan_mode`, stable tool catalog).
- Agent composition is upstream-owned: `preset/agent-presets`
  (`presets/standard/agent.cordis.yml` — full coding agent: persona,
  shell/fs/jobs/skills/goals, plan-mode group with `isolate: {planMode: true}`,
  compaction, delegation/subagents, `freecode-mcp-serena` /
  `freecode-mcp-free-search` rows gated on `FREECODE_MCP_*_ENABLED`, ask-user,
  todo, web). Authoring is copy-only (`copy('standard', id)`); copies are
  snapshots that drift on upgrade. Picker UI: `client/ui-agent-preset`.
  MCP shell side: `mcp-home.ts` (versioned `mcp/servers.json` + `cordis.patch.yml`
  managed block, `embeddedMcpEnvironment()` → `FREECODE_MCP_*_ENABLED`,
  `FREECODE_UVX_COMMAND`, `FREECODE_WEB_MODE=1`), `mcp-readiness.ts`
  (ring-buffer tracker), patches `070/085/090/100/130` (Standard preset rows,
  status channel, diagnostics, contracts/Serena activation).
- Shell helpers relevant to any external binary: `caveman-resolver.ts`
  (bundled `resources/<tool>/<tool>.exe` → PATH fallback via `where`/`which`,
  cached, null when absent; RTK/Caveman remain optional PATH helpers),
  `ocr.ts` (bundled Tesseract via `FREECODE_TESSERACT_PATH` → well-known paths →
  PATH; bounded 25 MB in / 256 KB out, 30 s cap), `updater.ts` +
  `harness-updater.ts` (Harness-only updater; release tag only after explicit
  approval, local-first flow).
- IPC is a closed Zod-validated contract: `apps/shell/src/main/ipc.ts` +
  `apps/shell/src/preload/index.ts` (`window.freecode`, `contextIsolation`,
  no direct `ipcRenderer`) + `packages/shared-types/src/index.ts`
  (`IpcChannels`, `IpcPayloads`, `FreeCodeApi`). Current channels: pool,
  models, omniroute, harness, settings, mcp, warpfleet, locale, ocr. No
  gentle-ai channel exists.
- Upstream policy (verified, not re-discovered): `vendor/deepseek-harness`
  subtree at syncCommit `2e70569` (`v0.1.3-alpha.1`), read-only for SDD phases;
  15 patches `010-140` (`vendorOnly`, ordered, idempotent) via
  `scripts/apply-upstream-patches.mjs` + `scripts/verify-upstream-patch-stack.mjs`;
  order is fetch → subtree pull → apply → prepare → tests/gate. The vendor
  gitlink worktree is broken — inspect via `git log -- vendor/...` from repo
  root. This phase performs NO fetch/pull and touches NO vendor files.
- Gentle AI v2.6.0 (given context, external Go binary, not a pool member):
  `install --agent opencode --preset full-gentleman`, `sdd-*` skills, review
  RDD v2 (`status` → `START` → `next_transition` verbatim), Engram MCP,
  `skill-registry refresh/list` → `.atl/skill-registry.md`. Known risks:
  mutates global configs, version-bound sync, growing store, Windows/Go
  fragility. `.atl/skill-registry.md` (2026-09-20) contains NO `sdd-*` and NO
  `gentle-ai` entries — verified.
- Pre-decided scope (from `SESSION-CONTEXT.md`, not re-asked): integrated mode —
  selectable `gentle-ai` preset reusing existing IPC/MCP, NOT a pool replacement;
  branch `main`; upstream `sync-latest` + replay-15 + gate; local-first release.

## Affected Areas

- `apps/shell/src/main/provider-seeder.ts` — where a gentle-ai lane would (or would
  not) seed a provider route; non-empty-models validator constraint.
- `apps/shell/src/main/model-refresher.ts` — where a gentle-ai model entry would
  need catalog/probe semantics (`probeModels: false` vs strict responders).
- `apps/shell/src/main/mcp-home.ts`, `apps/shell/src/main/runtime.ts`,
  `apps/shell/src/main/ipc.ts` — managed MCP catalog, env-flag injection
  (`FREECODE_MCP_*_ENABLED`), and any new `gentle-ai:*` IPC channel.
- `apps/shell/src/preload/index.ts`, `packages/shared-types/src/index.ts` (+ `chat.ts`) —
  closed Zod IPC contract; any new channel needs schema + preload projection.
- `apps/shell/src/main/caveman-resolver.ts`, `apps/shell/resources/runtime-deps.json` —
  template for optional-external-binary resolution (bundled vs PATH-only) and
  packaging manifest if a `gentle-ai` binary is ever bundled.
- `apps/shell/src/main/updater.ts`, `apps/shell/src/main/harness-updater.ts` —
  version-bound sync risk if gentle-ai pins its own release cadence.
- `apps/shell/src/main/ocr.ts` — precedent for bounded blocking CLI wrappers
  (size/time caps, no secret leak to renderer).
- `packages/opencode-adapter/src/pool.ts`, `src/lb.ts`, `src/index.ts` — must NOT
  be replaced; gentle-ai is not a pool member.
- `vendor/deepseek-harness/packages/preset/agent-presets/presets/standard/agent.cordis.yml`,
  `preset.yml` — reference composition a gentle-ai preset would copy/specialize.
- `vendor/deepseek-harness/packages/client/ui-agent-preset` — picker surface for a
  new preset row (read-only reference; change flows via patch).
- `vendor/deepseek-harness/packages/interaction/permission-presets`,
  `vendor/deepseek-harness/packages/plan/plan-mode`,
  `vendor/deepseek-harness/packages/fs/fs-sandbox` — authoritative permission,
  plan, and filesystem fences a gentle-ai orchestrator must not bypass.
- `vendor/deepseek-harness/packages/client/ui-model-selection`,
  `packages/client/ui-settings-models` — `session.selectModel` / `ModelCatalog`
  reuse point; `110` patch seam.
- `patches/upstream/upstream-patches.json`, `patches/upstream/*.patch` (010-140),
  `scripts/apply-upstream-patches.mjs`, `scripts/verify-upstream-patch-stack.mjs` —
  only legal path for any upstream-visible change (new `150-*` vendorOnly patch).
- `.atl/skill-registry.md` — registry has no gentle-ai/sdd-* match; refresh
  semantics must be scoped so `gentle-ai skill-registry refresh` cannot rewrite
  harness-owned global config.

## Approaches

1. **A — Lightweight read-only preset (detect + doctor + registry)**
   Ship a selectable `gentle-ai` agent-preset entry that does NOT execute
   gentle-ai: on select it runs detection (`resolveGentleAiBinary`-style PATH /
   bundled probe, same pattern as `caveman-resolver.ts`), a bounded doctor
   (`--version`, config sanity, Engram reachability), and surfaces registry
   state from `.atl/skill-registry.md`. No new provider route, no new IPC
   beyond a `gentle-ai:status` projection (or reuse of `ocr:status`-style
   shape), no `settings.yaml` mutation, default preset stays `standard`.
   - Pros: zero vendor-semantics risk; survives `sync-latest` (patch surface
     ~ one `150-*` preset row or shell-only change); no global-config mutation;
     no pool/sandbox/permission bypass; shippable as docs + status UI + tests;
     establishes the detection contract later approaches reuse.
   - Cons: does not deliver "orchestrator" behavior; users asking for gentle-ai
     execution still drop to an external terminal; value is diagnostic only.
   - Effort: Low.

2. **B — Integrated preset with CLI wrapper + IPC (recommended)**
   Ship a real selectable `gentle-ai` preset that reuses the harness:
   preset composition copied from `standard` (copy-only authoring, snapshot
   semantics documented), persona/section swapped to gentle-ai orchestration
   prompt, `plan-mode` + `permission-presets` + `fs-sandbox` rows kept intact,
   MCP via existing `FREECODE_MCP_*_ENABLED` flags (Engram added as a third
   managed row only if product confirms, default disabled, fail-open
   `failOnStartupError: false` + reconnect budget like Serena/free-search).
   Execution goes through a bounded shell wrapper (`launchHidden`-style,
   stdin/stdout caps, timeout, no secret exfil — `ocr.ts` precedent) exposed
   over new Zod-validated `gentle-ai:*` IPC (`status`, `doctor`, `run` or
   `orchestrate` with bounded input), preloaded as `window.freecode.gentleAi`.
   Model routing stays on `deepseek-free` / `opencode-free` via
   `provider-seeder` + `model-refresher` + `session.selectModel`; gentle-ai
   gets NO dedicated provider route and NO pool membership. Binary resolution
   follows `caveman-resolver.ts` (bundled `resources/gentle-ai/gentle-ai.exe`
   if product approves bundling, else PATH-only, cached, null-safe). Change
   flows as one new `150-freecode-gentle-ai-preset.patch` (vendorOnly) +
   shell/packages changes + contract tests; full gate before release talk.
   - Pros: matches pre-decided `integrated-mode` scope; reuses IPC/MCP,
     `ModelCatalog`, permissions, sandbox, plan-mode instead of forking them;
     upstream-sync-compatible (single ordered patch); testable under STRICT TDD
     (contract/IPC/preset behavior); preserves local-first release and
     `standard` default.
   - Cons: moderate complexity — new IPC surface, wrapper hardening (Windows
     quoting, Go-process lifecycle, bounded output), preset-drift maintenance
     on every upstream sync, Engram/third-row MCP decision required.
   - Effort: Medium.

3. **C — Full delegation (harness yields orchestration to gentle-ai)**
   Route sessions through the external `gentle-ai` Go binary as the primary
   orchestrator: harness becomes a launcher/status pane, gentle-ai owns
   planning, tool calls, skills (`sdd-*`), review (RDD v2 verbatim
   transitions), and Engram memory. Would require replacing or bypassing
   `OpenCodePool`/freellmpool routing, `session.selectModel`, `permissions`
   projection, `fs-sandbox` enforcement, and the `standard` composition.
   - Pros: fastest path to "full gentleman" feature parity with upstream
     gentle-ai docs; least harness-side prompt engineering.
   - Cons: directly contradicts the pre-decided scope (integrated preset, not
     pool replacement); breaks upstream-first policy (broad vendor edits, not
     one replayable patch); highest `sync-latest` breakage risk (seams:
     `agent-presets`, `ui-agent-preset`, `permission-presets`, `plan-mode`,
     `ui-model-selection`, `llm-pi-ai` providers); inherits all flagged risks —
     global-config mutation, version-bound sync, store growth, Windows/Go
     fragility; permission/sandbox authority becomes ambiguous (who enforces
     `workspace-write`?); release gate and contract-test surface explode.
   - Effort: High.

### Tradeoff summary

| Dimension | A (detect-only) | B (integrated) | C (delegate) |
|---|---|---|---|
| Fits `integrated-mode` scope | Partial (entry point only) | Yes | No |
| Upstream `sync-latest` safety | Highest | Manageable (one `150-*` patch + gate) | Lowest (broad seam churn) |
| Permission/sandbox authority | Untouched | Preserved (reuses presets + fs-sandbox) | Ambiguous/forked |
| IPC/MCP reuse | Status only | Full (`gentle-ai:*` + `FREECODE_MCP_*`) | Bypassed |
| User value | Diagnostic | Selectable orchestrator inside harness | Full external parity |
| Complexity | Low | Medium | High |

## Recommendation

Recommend **B (integrated preset with CLI wrapper + IPC)**, phased as **A → B**:

- Phase 0 (inside B's first increment): land A's detection/doctor/status
  contract (`resolveGentleAiBinary`, `gentle-ai:status`/`doctor`, registry
  projection, `standard` remains default). This is independently shippable and
  de-risks the wrapper.
- Then add the bounded orchestration path (`gentle-ai:run`, preset
  composition, prompt section, optional Engram row) behind the same patch
  number (`150-*`), with STRICT TDD contract tests (Zod IPC, preset mount,
  permission/plan-mode invariance, doctor failure cases) and the full
  `verify:upstream-patches` + `release:gate` before any 0.8.0 tag talk.
- Explicitly reject C under the current scope decisions; re-open only via a new
  product decision reversing `integrated-mode`.

## Risks

- Upstream `sync-latest` drift: `agent-presets`, `ui-agent-preset`,
  `permission-presets`, `plan-mode`, `ui-model-selection`, `llm-pi-ai` seams may
  rename; mitigation is one ordered vendorOnly patch + contract tests + gate.
- Preset snapshot drift: a `gentle-ai` copy of `standard` rots on upgrade;
  mitigation is documenting the source commit and re-diffing each sync.
- External Go binary on Windows: spawn/quoting/lifecycle fragility; mitigation
  is `caveman-resolver.ts` + `ocr.ts` precedents (bundled-or-PATH, cached,
  null-safe, bounded output/timeout, no secret leak).
- Global-config mutation by `gentle-ai install --agent opencode`: must be
  sandboxed to `DSH_HOME` (never harness-global or user-global) or run in
  `--dry-run`/doctor mode until product decides.
- Engram MCP as third managed row: reconnect-budget burn if command cannot
  spawn; mitigation is `isCommandAvailable` gating (default disabled) per
  `mcp-home.ts`.
- Store growth (`store crece`): diagnose before committing to bundled skills or
  persistent gentle-ai state inside the packaged app.
- Vendor gitlink worktree is broken: all upstream evidence via
  `git log -- vendor/...` from root; no fetch/pull in explore (honored).

## Ready for Proposal

Yes — with `product_decisions: pending`. Execution mode is `auto`, so no
interview is conducted here; the following state is persisted for the
orchestrator to ask before/with `sdd-propose`.

### product_decisions: pending

1. Default preset on fresh install: keep `standard` default with `gentle-ai`
   opt-in, or make `gentle-ai` the default when its binary is detected?
2. Binary distribution: bundle `gentle-ai.exe` in `resources/gentle-ai`
   (Windows x64 asset + `runtime-deps.json` entry) or PATH-only detection?
3. Global-mutation guard: may `gentle-ai install --agent opencode` write outside
   `DSH_HOME`, or is it confined to `DSH_HOME` / doctor-only until approved?
4. Engram MCP: add as third product-managed row (default on/off?) or reuse
   Serena + free-search only?
5. Review enforcement: is RDD v2 (`status` → `START` → `next_transition`
   verbatim) enforced in-harness or advisory documentation?
6. Skill source of truth: does `gentle-ai skill-registry refresh` own
   `.atl/skill-registry.md`, or does the harness keep its scoped refresh?
7. Upstream target for 0.8.0: pin at `2e70569` or sync `upstream/master` latest
   now (with 15-patch replay + gate) before designing the `150-*` patch?

---
`skill_resolution: none` (no `sdd-*` or `gentle-ai` match in
`.atl/skill-registry.md`; proceeded without skill injection).
`memory: engram_unavailable in this executor environment — no mem_save tool
exposed; findings persist file-only in this artifact.`
