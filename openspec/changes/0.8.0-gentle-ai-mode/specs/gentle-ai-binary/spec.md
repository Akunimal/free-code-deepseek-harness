# Gentle-AI Binary Specification

## Purpose

Reliable resolution and bounded execution of the external gentle-ai binary, following the `caveman-resolver.ts` and `ocr.ts` precedents.

## Requirements

### Requirement: Bundled-or-PATH Resolution

The system MUST resolve the binary as bundled `resources/gentle-ai/gentle-ai.exe` first, then PATH fallback, with caching and null-safe absence. Resolution logic MUST mirror `caveman-resolver.ts`.

#### Scenario: Bundled binary preferred

- GIVEN a bundled `resources/gentle-ai/gentle-ai.exe` exists
- WHEN resolution runs
- THEN the bundled path is returned

#### Scenario: PATH fallback and null-safe absence

- GIVEN no bundled binary exists but `gentle-ai` is on PATH
- WHEN resolution runs
- THEN the PATH entry is returned; when neither exists, null is returned without throwing

### Requirement: Packaging Manifest Entry

The system MUST declare the bundled binary in `apps/shell/resources/runtime-deps.json` when bundling is approved, so packaging includes the Windows x64 asset.

#### Scenario: Manifest includes asset

- GIVEN bundling is approved
- WHEN the package manifest is inspected
- THEN a `resources/gentle-ai` entry exists for the Windows x64 executable

### Requirement: Doctor Checks

The `gentle-ai:doctor` path MUST check binary presence, `--version` execution, config sanity under `DSH_HOME`, and Engram reachability, each bounded by timeout, and report per-check pass or fail.

#### Scenario: Doctor reports missing binary

- GIVEN no binary is resolvable
- WHEN `doctor` runs
- THEN it returns a failing presence check with remediation guidance and no spawn beyond the probe

### Requirement: Bounded Execution Caps

Spawned invocations MUST enforce stdin and stdout caps, a wall-clock timeout, and safe Windows argument quoting. Global-config mutation MUST be confined to `DSH_HOME` unless explicit `allow-global` consent with pre-write backup is granted.

#### Scenario: Output truncated safely

- GIVEN a run producing output beyond the stdout cap
- WHEN execution completes
- THEN output is truncated to the cap and flagged as truncated

#### Scenario: Global mutation guarded

- GIVEN an install path that would write outside `DSH_HOME`
- WHEN `allow-global` consent and backup are absent
- THEN the write is blocked and doctor-only mode is offered

### Requirement: Extra Scope Caveman RTK Bundle With Size Gate

Bundling of `caveman` and `RTK` executables is SEPARATE extra scope. It MUST be gated by a documented size budget because combined weight may exceed 300 MB.

#### Scenario: Size gate blocks extra bundle

- GIVEN the combined `gentle-ai` plus `caveman` plus `RTK` asset weight exceeds the budget
- WHEN packaging is evaluated
- THEN the extra bundle is excluded or split until the budget passes
