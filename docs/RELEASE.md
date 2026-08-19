# Release and packaging

This repository is the public `Akunimal/free-code-deepseek-harness` fork of
`deepseek-ai/deepseek-harness`. The product branch is `dev`; `master` remains
the upstream reference branch. A release tag packages the desktop GUI together
with the complete upstream web harness and publishes one native artifact set
per operating system.

Releases are tag-only. Pushes to `main` or `dev` do not build or publish installers.

## Local build

```bash
pnpm install
pnpm test
pnpm test:contract
pnpm build:desktop
```

`build:desktop` compiles the shell, runs `scripts/package-runtime.sh`, and invokes electron-builder. The runtime script builds the upstream libraries/web app, copies a clean stage, removes only the upstream development `postinstall`, performs a complete workspace install, verifies `apps/cli/lib/bin.js` and the Cordis workspace link, then copies the stage into ignored packaging resources.

The Windows target emits both `FreeCode-DeepSeek-Harness-<version>-win-x64-setup.exe` (NSIS) and `FreeCode-DeepSeek-Harness-<version>-win-x64-portable.exe`. The portable target has no installer step and stores its `data/` directory beside the executable. The packaged runtime is self-contained: a user does not need Node, pnpm, Git, Go, or Python after downloading an artifact. macOS and Linux artifacts likewise include the harness runtime and native worker resources; their app/container conventions may still use the platform's normal user-data location unless `FREECODE_PORTABLE_DIR` is supplied.

The Help menu checks both the fork's GitHub Release and the upstream commit recorded in `runtime-manifest.json`. A confirmed release update downloads and installs through `electron-updater`. A source checkout can additionally run `node scripts/update-upstream-local.mjs`, which pulls the upstream subtree, runs tests, and rebuilds the desktop artifact; the packaged portable app reports upstream changes but never tries to compile without a toolchain.

On the current Windows checkout, the expected local test paths are:

```text
I:\DeepSeek-Harness\free-code-deepseek-harness\apps\shell\release\FreeCode-DeepSeek-Harness-0.1.4-win-x64-portable.exe
I:\DeepSeek-Harness\free-code-deepseek-harness\apps\shell\release\FreeCode-DeepSeek-Harness-0.1.4-win-x64-setup.exe
I:\DeepSeek-Harness\free-code-deepseek-harness\apps\shell\release\win-unpacked\FreeCode DeepSeek Harness.exe
```

## CI release

`.github/workflows/release.yml` runs on `push` tags matching `v*`, tests and builds a Windows, macOS, and Linux matrix, and publishes artifacts to a GitHub Release. The GitHub owner/repository is `Akunimal/free-code-deepseek-harness`; the deleted standalone repository is not part of the release path.

The release job first builds the four supported `opencode2api` resources (Windows x64, macOS arm64, macOS x64, and Linux x64), then runs the adapter and contract suites from a clean checkout. This prevents native-resource and workspace-build assumptions from being hidden by a developer's ignored local artifacts.

## Versioning

The patch release target is `v0.1.4`. Before tagging, verify the full local preflight: zero-config boot, model discovery, provider registration, message streaming, worker restart, tray/overlay actions, import/continuation, workspace lifecycle, update checking, headless tool execution, and the conversation motion layer.
