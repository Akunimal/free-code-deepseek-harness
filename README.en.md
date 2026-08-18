# free-code-deepseek-harness

> Cross-platform desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): zero-config, DeepSeek Free provider out of the box, a local `opencode2api` worker pool, and the complete upstream web experience.

[Español](README.md)

## About this fork

This repository is the public fork of [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness). It keeps the upstream harness and adds a desktop GUI product for running it cross-platform: Electron owns the local processes, prepares the DeepSeek Free provider, starts the `opencode2api` pool, and opens the complete harness web UI inside a native window.

The product branch is `dev`; the fork keeps `master` as the upstream reference. Every `v*` tag triggers a reproducible release with native builds for all three supported platforms:

- Windows: NSIS `.exe` installer.
- macOS: Electron app/DMG.
- Linux: Electron desktop package/AppImage.

Artifacts are built in a Windows/macOS/Linux matrix, pass the contract tests, and are published to the fork's GitHub release. This is not a demo UI: every build contains the harness runtime, its workspace dependencies, the local worker pool, zero-config setup, and the upstream web surfaces documented below.

## What it delivers

This application packages the upstream harness and adds the desktop layer needed to use it without manually preparing processes, ports, or providers:

- Starts an `opencode2api` pool with health checks, round-robin, sticky sessions, transparent SSE, backoff, and a respawn budget.
- Starts `dsh web` on loopback, detects readiness, restarts the harness, and opens its UI in an isolated/sandboxed Electron window.
- Seeds `deepseek-free` against the pool, preserves user providers, and refreshes the model catalog by latency every 30 minutes or on demand.
- Preconfigures OpenCode's public account (`Bearer public`) as `FREECODE_PUBLIC_KEY`, so DeepSeek Free is usable without a private API key; an existing private OpenCode key is never overwritten.
- Detects local OmniRoute OpenAI-compatible routes, stores secrets through keytar or a file fallback, and exposes typed zod IPC through preload.
- Includes window, tray, notifications, pool-status overlay, settings-folder access, OpenCode SQLite/ChatML import, and workspace continuation.
- Writes rotating JSONL logs, supports opt-in GitHub updates, prepares reproducible stages, and publishes only from `v*` tags.
- Adds a per-conversation CSS animated background: two lightweight radial-gradient layers, no canvas or JavaScript loop, with `prefers-reduced-motion` support.

## Every feature of the included DeepSeek Harness

The UI is not a reduced mock: the bundled application ships upstream surfaces for conversations, sessions, workspaces, sidebar, subagents, models/providers, settings, themes, locale, attachments, markdown, slash commands, `/` and `@` input, tools, tool tree, feedback, permissions, plan, goal, questions, approvals, compaction, trajectory, jobs, workflows, deliverables, skills, web search/fetch, plugins, LSP, filesystem/code runtime, persistence, streaming, gateway, extensions, and the client module system. The exact inventory of all **219 declared packages** and availability notes lives in [UPSTREAM-FEATURES.md](docs/UPSTREAM-FEATURES.md); a contract test requires this inventory to be updated when upstream adds a surface.

## Quick start

Requirements: Node `>=22.19`, pnpm `11.22`, Git Bash, and a checkout with the vendored subtrees.

```bash
pnpm install
pnpm build:vendor
pnpm build
pnpm test
pnpm test:contract
```

Run the desktop shell in development:

```bash
pnpm --filter @freecode/shell dev
```

Prepare a complete runtime and installer:

```bash
pnpm build:desktop
```

The stage does not use `pnpm install --prod`: the harness requires its internal workspace links.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Exhaustive upstream inventory](docs/UPSTREAM-FEATURES.md)
- [Contracts and tests](docs/CONTRACT-TESTS.md)
- [Chat import](docs/CHAT-IMPORT.md)
- [Workspace bridge](docs/WORKSPACE-BRIDGE.md)
- [Animated UI](docs/UI.md)
- [Logging and updates](docs/LOGGING-AND-UPDATES.md)
- [Release and packaging](docs/RELEASE.md)
- [Upstream synchronization](docs/UPSTREAM-SYNC.md)

## Configuration and security

All local services bind to `127.0.0.1`. The vault resolves secrets into the child process without mutating `process.env`. Updates are disabled by default; `FREECODE_ENABLE_UPDATES=1` enables checks against GitHub Releases. Electron `userData` contains `dsh-home`, workers, and logs.

## Project status

The work branch is `dev`. Harness contracts, shell tests, the modified upstream UI, and reproducible packaging must pass before merging into `main`. See [state.md](state.md) for operational continuity.

## License

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Upstream notices and licensing are retained inside `vendor/deepseek-harness`.
