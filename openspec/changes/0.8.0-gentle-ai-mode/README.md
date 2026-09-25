# Change 0.8.0-gentle-ai-mode — scaffold (SDD-INIT)
# Technical artifact: English by default.

> Version 0.8.0: new Gentle AI mode as orchestrator + upstream update without breakage.
> Scope: integrated mode — selectable `gentle-ai` preset reusing IPC/MCP, not a pool replacement.

## Status
- Stage: init done. Ready for `sdd-explore`, then `sdd-propose`.
- `vendor/` untouched. No implementation in this phase.

## Layout (stages to be filled by later phases)
- `SESSION-CONTEXT.md` — cached preflight + decisions (read first, propagate).
- `exploration.md` — (sdd-explore output, pending).
- `proposal.md` — (sdd-propose output, pending).
- `spec/` — (sdd-spec delta specs, pending).
- `design.md` — (sdd-design output, pending).
- `tasks.md` — (sdd-tasks output, pending).
- Global config: `openspec/config.yaml`.

## Rules for later phases
1. Branch `main` only. One commit per phase. Never create `main1`.
2. `vendor/deepseek-harness` is read-only; changes flow via
   `patches/upstream/*.patch` replay + `pnpm verify:upstream-patches` + full gate.
3. Testing: STRICT TDD for contract/IPC/preset behavior; Standard Mode for
   scaffolding/docs. Gate before any release talk.
4. Release 0.8.0 tag/GitHub release ONLY after explicit user approval,
   after local install + open + user test pass.
5. Artifacts in English; conversation in neutral Spanish.
