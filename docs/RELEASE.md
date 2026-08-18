# Release and packaging

Releases are tag-only. Pushes to `main` or `dev` do not build or publish installers.

## Local build

```bash
pnpm install
pnpm test
pnpm test:contract
pnpm build:desktop
```

`build:desktop` compiles the shell, runs `scripts/package-runtime.sh`, and invokes electron-builder. The runtime script builds the upstream libraries/web app, copies a clean stage, removes only the upstream development `postinstall`, performs a complete workspace install, verifies `apps/cli/lib/bin.js` and the Cordis workspace link, then copies the stage into ignored packaging resources.

## CI release

`.github/workflows/release.yml` runs on `push` tags matching `v*`, tests and builds a Windows, macOS, and Linux matrix, and publishes artifacts to a GitHub Release. The GitHub owner/repository is `Akunimal/free-code-deepseek-harness`.

## Versioning

The first release target from the original plan is `v0.1.0`. Before tagging, verify a zero-config boot, model discovery, provider registration, message streaming, worker restart, tray/overlay actions, import/continuation, and the conversation motion layer.
