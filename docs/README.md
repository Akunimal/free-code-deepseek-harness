# Documentation index

Start with the [README](../README.md) (English) or [README.es.md](../README.es.md)
(Español). This page groups the documents in `docs/` and the repository root by
what you need. Links point to the current file locations.

Documents marked **historical** describe past releases or plans. They are not
kept up to date and may describe components that have since been removed. The
[CHANGELOG](../CHANGELOG.md) records what changed in each version.

Some documents are bilingual in one file, some have a `.es.md` sibling, and a few
are in one language only. Each entry below says which.

## Start here

- [README](../README.md) / [README.es.md](../README.es.md): what FreeCode is,
  install, first run.
- [CHANGELOG](../CHANGELOG.md): version history.
- [Known issues](KNOWN-ISSUES.md): open limitations and workarounds (bilingual).
- [Contributing](../CONTRIBUTING.md): setup, checks, and pull request workflow.

## Using the app

- [Managed MCP servers](mcp-servers.md): the MCP entries FreeCode starts, how to
  toggle them, and where their configuration lives.
- [Conversation UI](UI.md): notes on the conversation interface (English and
  Spanish sections).
- [Logging and updates](LOGGING-AND-UPDATES.md): log locations and update
  behavior.

## Architecture

- [Architecture](ARCHITECTURE.md): the Electron shell, the bundled Phoenix
  gateway, the vendored web app, and packaging.
- [Windows desktop containment](HEADLESS-DESKTOP.md): how background processes
  are isolated on Windows (bilingual).
- [Chat import](CHAT-IMPORT.md): the `@freecode/chat-importer` package.
- [Workspace bridge](WORKSPACE-BRIDGE.md): the `@freecode/workspace-bridge`
  package.
- [Upstream feature inventory](UPSTREAM-FEATURES.md): reference list of the
  upstream DeepSeek Harness surfaces shipped in this repository. Large; use it
  as a lookup, not for reading end to end.

## Development

- [Contributing](../CONTRIBUTING.md): setup, checks, and rules for changes.
- [Repository rules](../AGENTS.md): coding and release rules that apply to
  humans and AI agents, including the clean-install proof and the Windows
  headless process policy.
- [Upstream synchronization](UPSTREAM-SYNC.md): how the vendored DeepSeek
  Harness is kept in sync.
- [Upstream patching](UPSTREAM-PATCHING.md): the ordered patch stack under
  `patches/upstream/` and the order of sync steps.
- [Contract tests](CONTRACT-TESTS.md): tests for the seams between the shell,
  the gateway, and the vendored harness.

## Release

- [Release and packaging](RELEASE.md) / [RELEASE.es.md](RELEASE.es.md): build,
  release gate, and artifacts.
- [Release policy](RELEASE-POLICY.md) / [RELEASE-POLICY.es.md](RELEASE-POLICY.es.md):
  what may be published and when.
- [Release notes template](RELEASE-NOTES-TEMPLATE.md): starting point for a new
  release note.

### Release notes by version

Current release notes are at the repository root. Older ones are in `docs/`.

- **1.x:** [1.0.1](../release-notes-v1.0.1.md), [1.0.0](../release-notes-v1.0.0.md)
- **0.9.x:** [0.9.8](../release-notes-v0.9.8.md), [0.9.6](../release-notes-v0.9.6.md),
  [0.9.5](../release-notes-v0.9.5.md), [0.9.4](../release-notes-v0.9.4.md),
  [0.9.3](../release-notes-v0.9.3.md), [0.9.2](../release-notes-v0.9.2.md),
  [0.9.1](../release-notes-v0.9.1.md), [0.9.0](../release-notes-v0.9.0.md)
- **0.6.x–0.8.x:** [0.8.0](../release-notes-v0.8.0.md),
  [0.7.0](../release-notes-v0.7.0.md), [0.6.0](../release-notes-v0.6.0.md)
- **0.4.x–0.1.x:** [0.4.3](RELEASE-NOTES-v0.4.3.md), [0.4.2](RELEASE-NOTES-v0.4.2.md),
  [0.4.1](RELEASE-NOTES-v0.4.1.md), [0.4.0](RELEASE-NOTES-v0.4.0.md),
  [0.3.2](RELEASE-NOTES-v0.3.2.md), [0.3.1](RELEASE-NOTES-v0.3.1.md),
  [0.2.9](RELEASE-NOTES-v0.2.9.md), [0.2.8](RELEASE-NOTES-v0.2.8.md),
  [0.2.6](RELEASE-NOTES-v0.2.6.md), [0.2.5](RELEASE-NOTES-v0.2.5.md),
  [0.2.4](RELEASE-NOTES-v0.2.4.md), [0.2.3](RELEASE-NOTES-v0.2.3.md),
  [0.2.2](RELEASE-NOTES-v0.2.2.md), [0.2.1](RELEASE-NOTES-v0.2.1.md),
  [0.2.0](RELEASE-NOTES-v0.2.0.md), [0.1.8](RELEASE-NOTES-v0.1.8.md)

## Planning and history (historical)

- [Roadmap](ROADMAP.md): the original roadmap (bilingual).
- [Roadmap 0.6.0](ROADMAP-0.6.0.md), [Roadmap 0.7.0](ROADMAP-0.7.0.md)
- [State ledger 0.6.0](STATE-0.6.0.md), [State ledger 0.7.0](STATE-0.7.0.md)
- [Audit and test plan 0.6.0](AUDIT-0.6.0-TEST-PLAN.md)
- [Plan v0.1.5](PLAN-v0.1.5-publicaciones.md), [Plan v0.1.7](PLAN-v0.1.7-publicaciones.md),
  [Mega plan v0.4.0](PLAN-v0.4.0-mega.md)
- [Phase evidence for 0.7.0](evidence/0.7.0/): per-phase evidence files.
- [Pre-release review 0.6.0](historial/REVIEW.md).
- [Handoff state](historial/state.md) (Spanish).
- [Spanish translation task](historial/TODO-spanish-translations.md). Marked
  resolved in 0.8.0.
- [Task notes](../odd/tasks/): one note per task, in `odd/tasks/`.
- [OpenSpec changes](../openspec/): change proposals. The `0.8.0-gentle-ai-mode`
  change describes a feature removed in 1.0.0.

## Superseded design notes

- [Offline MCP design](OFFLINE-MCP-DESIGN.md): assumes Serena, which was removed
  in 0.8.0. Kept for reference only.
