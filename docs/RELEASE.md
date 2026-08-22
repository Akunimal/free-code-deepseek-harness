# Release and packaging

This repository is the public `Akunimal/free-code-deepseek-harness` fork of
`deepseek-ai/deepseek-harness`. The product branch in this checkout is `main`;
the vendored `vendor/deepseek-harness` subtree remains the upstream reference.
A release tag is the intended versioning boundary for the desktop GUI and the
complete upstream web harness. The source contains cross-platform packaging
configuration, but the published `v0.1.7` artifact set is Windows x64 only;
macOS and Linux are not included or claimed as tested in that release.

Releases are tag-only. Branch pushes do not build or publish installers.

## Local build

```bash
pnpm install
pnpm test
pnpm test:contract
pnpm build:desktop
```

`build:desktop` compiles the shell, runs `scripts/package-runtime.sh`, and invokes electron-builder. The runtime script builds the upstream libraries/web app, copies a clean stage, removes only the upstream development `postinstall`, performs a complete workspace install, verifies `apps/cli/lib/bin.js` and the Cordis workspace link, then copies the stage into ignored packaging resources.

The Windows target emits both `FreeCode-DeepSeek-Harness-<version>-win-x64-setup.exe` (NSIS) and `FreeCode-DeepSeek-Harness-<version>-win-x64-portable.exe`. The portable target has no installer step and stores its `data/` directory beside the executable. The packaged runtime is self-contained: a user does not need Node, pnpm, Git, Go, or Python after downloading an artifact. Other platform configurations remain source-level targets only until a future release explicitly includes and tests them.

The Help menu checks the fork's GitHub Release, the compatible Harness-only asset, and the upstream commit recorded in `runtime-manifest.json`. When a compatible Harness asset exists, the update downloads it, validates it, stops/restarts only `dsh`, and atomically replaces `resources/freecode/dsh`; the shell, opencode2api pool, Tor, and user data are not replaced. Full application updates remain available through `electron-updater` when a desktop release is published. A source checkout can additionally run `node scripts/update-upstream-local.mjs`, which pulls the upstream subtree and rebuilds only `package:runtime`; the packaged portable app never tries to compile without a toolchain.

The local desktop package also writes a Harness-only release asset beside the installers:

```text
apps/shell/release/deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz
apps/shell/release/deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz.sha256
```

Attach the platform-specific `.tar.gz` files and their SHA-256 digests to the fork release manually when publishing. This path does not use GitHub Actions or consume workflow quota.

On the current Windows checkout, the expected local test paths are:

```text
I:\DeepSeek-Harness\free-code-deepseek-harness\apps\shell\release\FreeCode-DeepSeek-Harness-0.1.7-win-x64-portable.exe
I:\DeepSeek-Harness\free-code-deepseek-harness\apps\shell\release\FreeCode-DeepSeek-Harness-0.1.7-win-x64-setup.exe
I:\DeepSeek-Harness\free-code-deepseek-harness\apps\shell\release\win-unpacked\FreeCode DeepSeek Harness.exe
```

## CI release (not used for v0.1.7)

`.github/workflows/release.yml` is retained as an optional tag-based path and, when deliberately run, tests and builds a Windows, macOS, and Linux matrix. It was not run for `v0.1.7`, because that release was built and uploaded locally without spending GitHub Actions quota. The GitHub owner/repository is `Akunimal/free-code-deepseek-harness`; the deleted standalone repository is not part of the release path.

The release job first builds the four supported `opencode2api` resources (Windows x64, macOS arm64, macOS x64, and Linux x64), then runs the adapter and contract suites from a clean checkout. This prevents native-resource and workspace-build assumptions from being hidden by a developer's ignored local artifacts.

## Versioning

The current patch release is `v0.1.7`. Its Windows setup/portable artifacts, blockmap, `latest.yml`, Harness runtime tarball, and SHA-256 digest were rebuilt locally on 2026-08-22, validated with a silent per-user install that returned exit code `0`, and uploaded manually to the [published GitHub release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.1.7). No GitHub Actions workflow was used. Before a future release, verify the full local preflight: zero-config boot, model discovery, provider registration, message streaming, worker restart, tray/overlay actions, import/continuation, workspace lifecycle, update checking, headless tool execution, and the conversation motion layer.

For the Spanish release guide, see [RELEASE.es.md](RELEASE.es.md).
