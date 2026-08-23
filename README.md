# FreeCode DeepSeek Harness

> Vibe coding on Windows with DeepSeek Free — open a project, describe what you want to build, and start.

[Leer en español](README.es.md)

![FreeCode with x-preview-f selected](docs/assets/capeng.jpg)

## What is FreeCode?

FreeCode is a desktop app that bundles the complete DeepSeek Harness with an
OpenCode bridge already configured. It gives you a local coding workspace with
chat, files, tools, sessions, and a persistent embedded Chromium browser.

You do not need to install Node, pnpm, Git, Python, OpenCode, or a separate
worker service to use the Windows release.

## Start in three steps

1. Download the Windows installer from [Release v0.1.8](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.1.8).
2. Install FreeCode, open it, and choose your project folder.
3. Tell the model what you want to build in plain language.

The release also includes a portable `.exe` if you do not want an installer.
The installer is the better choice for everyday use; the portable build is
useful when you want to carry the app with you.

## What you get

- DeepSeek Free ready to use, including `x-preview-f` when it is available.
- A persistent Chromium browser for research and browser-based computer use.
- Headless tool calling for normal coding work; only the project selector needs
  to open a visible chooser when required.
- Sessions, workspaces, file tools, permissions, plans, questions, and the
  complete upstream Harness web experience.
- English, Spanish, and Chinese in the app, including native menus and tray.
- CSS conversation backgrounds with reduced-motion support.
- An in-app update check from the Help menu.

## A few practical limits

The free route is shared and can be limited by upstream IP/session rate limits.
That means a response can take a while or temporarily fail. FreeCode keeps the
last known-good model selection, gives slow `x-preview-f` probes extra time, and
retries transient network failures. More workers improve concurrency; they do
not create more quota.

## Updating

Use Help → Check for updates. Releases are built and uploaded manually, with no
GitHub Actions release workflow, so the repository does not spend its free CI
quota. The release checklist and bilingual notes are in
[docs/RELEASE-POLICY.md](docs/RELEASE-POLICY.md).

## For contributors

```bash
pnpm install
pnpm build:vendor
pnpm build
pnpm test
pnpm test:contract
pnpm build:desktop
```

More detail is available in [the architecture guide](docs/ARCHITECTURE.md),
[the feature inventory](docs/UPSTREAM-FEATURES.md),
[the release guide](docs/RELEASE.md), and
[the UI notes](docs/UI.md).

## Project

This is the public [Akunimal/free-code-deepseek-harness](https://github.com/Akunimal/free-code-deepseek-harness)
fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
The product branch is `main`; the upstream reference lives in
`vendor/deepseek-harness`.

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
