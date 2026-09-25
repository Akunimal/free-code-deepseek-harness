# Gentle-AI IPC Specification

## Purpose

Bounded `gentle-ai:*` IPC surface with Zod validation and preload projection, reusing the closed harness IPC contract without secret leakage.

## Requirements

### Requirement: Zod Contract for Gentle-AI Channels

The system MUST expose exactly three channels — `gentle-ai:status`, `gentle-ai:doctor`, and `gentle-ai:run` — validated by Zod schemas in `packages/shared-types` and registered in `IpcChannels` and `IpcPayloads`.

#### Scenario: Valid status call succeeds

- GIVEN a valid `gentle-ai:status` payload
- WHEN the channel is invoked
- THEN the handler returns a typed status response

#### Scenario: Invalid payload rejected

- GIVEN a malformed `gentle-ai:run` payload
- WHEN the channel is invoked
- THEN the call is rejected with a validation error and no spawn occurs

### Requirement: Preload Projection

The system MUST project the surface as `window.freecode.gentleAi` via `apps/shell/src/preload/index.ts` with `contextIsolation` preserved. The renderer MUST NOT access `ipcRenderer` directly.

#### Scenario: Preload exposes scoped API

- GIVEN the shell window is loaded
- WHEN renderer code reads `window.freecode.gentleAi`
- THEN `status`, `doctor`, and `run` functions are present and no raw `ipcRenderer` is exposed

### Requirement: Bounded Run Semantics

The system MUST bound every `gentle-ai:run` invocation by input size, output size, and timeout. Defaults MUST follow the `ocr.ts` precedent and be documented in the contract.

#### Scenario: Oversize input rejected

- GIVEN a `run` request exceeding the documented stdin cap
- WHEN it is invoked
- THEN it is rejected before spawn with a size error

#### Scenario: Timeout enforced

- GIVEN a `run` invocation that exceeds its timeout
- WHEN the timeout elapses
- THEN the process is terminated and a timeout error is returned with truncated output

### Requirement: No Secret Leak

The system MUST NOT forward harness secrets, provider keys, or full environment variables to the renderer or to the spawned process beyond the documented allowlist.

#### Scenario: Secrets absent from responses

- GIVEN a `status`, `doctor`, or `run` call completes
- WHEN the response reaches the renderer
- THEN it contains no API keys, tokens, or undisclosed environment values

### Requirement: IPC Contract Test Coverage

All three channels, validation rejections, bounds, and the preload shape MUST be covered by contract tests before implementation (STRICT TDD).

#### Scenario: Contract suite gates IPC

- GIVEN the IPC surface is implemented
- WHEN `pnpm test:contract` runs
- THEN happy-path, invalid-payload, oversize, timeout, and preload-shape cases all pass
