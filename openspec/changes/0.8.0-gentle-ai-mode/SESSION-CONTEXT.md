# Session context — 0.8.0-gentle-ai-mode (cached for propagation)
# Technical artifact: English by default. Conversation stays in neutral Spanish.

## Preflight (from orchestrator, cached verbatim)
- execution_mode: auto
- artifact_store.mode: both (files + memory)
- delivery_strategy: ask-on-risk
- review_budget_lines: very-high (user asked for no practical cap)
- memory: engram_unavailable in this executor environment (no MCP/memory tools exposed);
  proceed file-only, do not block.

## Decisions already taken (do not re-ask)
1. route = full SDD.
2. scope = integrated mode: selectable `gentle-ai` preset reusing existing IPC/MCP;
   NOT a replacement of the opencode2api worker pool.
3. branch = `main`. Do NOT create `main1`. One commit per phase to `main`.
4. upstream = sync latest: subtree pull `vendor/deepseek-harness` from
   `upstream/master` + replay of the 15 patches (orders 010-140) + full gate.
5. release flow = everything local first (clean install + open + user test);
   tag + release 0.8.0 ONLY after explicit approval.
6. language domain contract = orchestration/conversation in neutral Spanish;
   technical artifacts (specs, design, tasks, code comments, tests) in English.

## What sdd-init did (2026-09-25)
- Verified stack: Node >=22.19 (found v24.12.0), pnpm 11.22.0, Electron shell
  (`apps/shell`, electron ^35.7.5), vendor subtree (`vendor/deepseek-harness`,
  upstream v0.1.3-alpha.1 / syncCommit 2e70569), worker pool (`vendor/opencode2api`
  Go + `packages/opencode-adapter`).
- Verified upstream-first convention: `patches/upstream/*.patch` (15 files,
  010-140, incl. duplicated 085/130 status-channel pair) + manifest
  `patches/upstream/upstream-patches.json` (vendorOnly, ordered, idempotent
  apply) + `scripts/apply-upstream-patches.mjs` + `scripts/verify-upstream-patch-stack.mjs`.
- Verified testing capability: `pnpm test`, `pnpm test:contract`, `pnpm typecheck`,
  `pnpm release:gate` (Windows-only full gate). See `openspec/config.yaml`.
- Created this change scaffold. Did NOT implement the mode. Did NOT touch `vendor/`.

## How to cache this context
- Files are the source of truth (`engram_unavailable`): this file +
  `openspec/config.yaml`.
- If a later phase has `mem_save`, persist keys:
  project='free-code-deepseek-harness', change='0.8.0-gentle-ai-mode',
  branch='main', scope='integrated-preset', upstream='sync-latest+replay-15+gate',
  release='local-first-then-tag-on-approval', review_budget='very-high',
  language='es-conversation/en-artifacts'.
- Every later phase (explore/propose/spec/...) must re-read this file first.

## Next
- `sdd-explore` for `0.8.0-gentle-ai-mode`: clarify gentle-ai orchestrator intents,
  preset surface, IPC/MCP reuse points, upstream sync risks. Then `sdd-propose`.
