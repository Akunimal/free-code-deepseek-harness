# Gentle-AI MCP Registry Specification

## Purpose

Managed MCP catalog change for the `gentle-ai` preset: Engram added as a default-on row, Serena removed, and skill-registry ownership assigned to gentle-ai with a read-only harness projection.

## Requirements

### Requirement: Engram Managed Row On By Default

The system MUST add Engram as a third product-managed MCP row, enabled by default, with `failOnStartupError: false`, a bounded reconnect budget, and `isCommandAvailable` gating per `mcp-home.ts`.

#### Scenario: Engram enabled by default

- GIVEN a fresh managed catalog with an available Engram command
- WHEN MCP startup resolves
- THEN the Engram row is enabled

#### Scenario: Engram fail-open when unavailable

- GIVEN the Engram command is unavailable
- WHEN MCP startup resolves
- THEN the Engram row stays disabled and startup still succeeds

### Requirement: Serena Row Removal With Migration

The system MUST REMOVE the `freecode-mcp-serena` row entirely. Contracts from patches `070`, `085`, `090`, `100`, and `130` MUST be updated, and existing Serena-only state MUST migrate to Engram or a documented none path.

#### Scenario: Serena absent from catalog

- GIVEN the `150-*` patch is applied
- WHEN the managed catalog and `cordis.patch.yml` block are inspected
- THEN no Serena row or Serena env flag remains

#### Scenario: Migrated contracts stay green

- GIVEN Serena references are removed
- WHEN `pnpm test:contract` and MCP readiness checks run
- THEN updated `070`/`085`/`090`/`100`/`130` expectations pass without Serena

### Requirement: Registry Ownership by Gentle-AI

`.atl/skill-registry.md` MUST be owned by `gentle-ai skill-registry refresh`. The harness MUST provide only a read-only projection and MUST NOT rewrite the file.

#### Scenario: Harness projection is read-only

- GIVEN the harness surfaces registry state
- WHEN the status or doctor path reads `.atl/skill-registry.md`
- THEN the file modification time and bytes are unchanged

#### Scenario: External refresh owns writes

- GIVEN `gentle-ai skill-registry refresh` runs
- WHEN it completes
- THEN registry bytes may change only through that command, never through harness writes
