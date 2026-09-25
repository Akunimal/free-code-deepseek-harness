# Gentle-AI Preset Specification

## Purpose

Selectable `gentle-ai` agent preset that reuses upstream composition, routing, permissions, sandbox, and plan-mode. It provides orchestrator value without replacing the worker pool.

## Requirements

### Requirement: Selectable Gentle-AI Preset Composition

The system MUST expose a selectable `gentle-ai` preset copied from `standard` at the pinned upstream commit, with only persona and orchestration prompt sections specialized.

#### Scenario: Preset appears in picker

- GIVEN the `150-*` patch is applied
- WHEN the user opens the agent-preset picker
- THEN `gentle-ai` is listed alongside `standard`

#### Scenario: Copy-only authoring preserved

- GIVEN the upstream `standard` composition at the pinned commit
- WHEN the `gentle-ai` preset is inspected
- THEN plan-mode, permission, sandbox, MCP, and tool rows match `standard` except persona and orchestration prompt

### Requirement: Default-When-Detected With Standard Fallback

The system MUST default to `gentle-ai` only when its binary is detected and doctor passes; otherwise it MUST fall back to `standard`. Existing user selections MUST NOT be flipped.

#### Scenario: Default flips on detection

- GIVEN a fresh install with no stored preset
- WHEN the gentle-ai binary is detected and doctor passes
- THEN the default preset is `gentle-ai`

#### Scenario: Fallback to standard

- GIVEN a fresh install with no detectable binary or failing doctor
- WHEN the default preset is resolved
- THEN the default preset is `standard`

#### Scenario: Existing selection preserved

- GIVEN a stored user preset selection
- WHEN detection state changes
- THEN the stored selection is preserved

### Requirement: Plan Permission Sandbox Invariance

The system MUST preserve upstream authority for plan-mode, permission-presets, and fs-sandbox when `gentle-ai` is active. It MUST NOT bypass `workspace-write` gating, `/permission` projection, or per-call sandbox mode.

#### Scenario: Permission gate intact

- GIVEN `gentle-ai` is the active preset
- WHEN a write tool call requires `workspace-write` approval
- THEN the standard permission prompt is enforced

#### Scenario: Pool replacement rejected

- GIVEN `gentle-ai` is active
- WHEN a session routes models
- THEN routing stays on `deepseek-free` / `opencode-free` via `session.selectModel` and the pool is not replaced

### Requirement: Upstream Sync Precondition for 150 Patch

The system MUST apply `sync-latest` plus replay of patches `010-140` plus a green `verify:upstream-patches` and `release:gate` BEFORE the `150-*` vendorOnly patch is created. `vendor/` MUST remain read-only except via replayed patches.

#### Scenario: Gate blocks 150 patch

- GIVEN `verify:upstream-patches` or `release:gate` is red
- WHEN the `150-*` patch is proposed
- THEN design and apply MUST NOT proceed until the gate is green

#### Scenario: Vendor read-only honored

- GIVEN the change is in spec, design, or tasks phase
- WHEN changes are authored
- THEN no direct `vendor/` edits exist outside `patches/upstream/*.patch`

### Requirement: Contract Test Coverage

Preset selection, default resolution, and invariance behavior MUST be covered by automated contract tests written before implementation (STRICT TDD).

#### Scenario: Contract tests gate implementation

- GIVEN preset behavior is implemented
- WHEN `pnpm test:contract` runs
- THEN selection, default-flip, fallback, and invariance cases all pass
