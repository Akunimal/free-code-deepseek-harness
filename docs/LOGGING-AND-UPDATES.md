# Logging and updates

## Logging

The Electron main process writes structured JSONL to `<userData>/logs/app.log`. The rotating destination defaults to 5 MiB per file and three retained files (`app.log`, `.1`, `.2`, `.3`). The worker pool keeps its per-worker logs under `<userData>/logs/` as configured by `opencode-adapter`.

The logger records lifecycle, update checks, and operational metadata. It does not receive secret values; callers should log identifiers and status only.

## Updates

The Help menu always provides an explicit **Buscar actualizaciones / Check for updates** action. It checks the fork's GitHub Releases and compares the bundled upstream commit with `deepseek-ai/deepseek-harness`; it never downloads or installs without the user's confirmation. A release update is downloaded and installed from that button. Background checks on startup and every six hours remain opt-in through `FREECODE_ENABLE_UPDATES=1`.

When the app is running from a source checkout, the same dialog can run **Update upstream and rebuild locally**. That action requires a clean checkout, pulls the upstream subtree, runs the full tests, and runs `pnpm build:desktop`; it is intentionally unavailable in packaged builds because a portable artifact does not contain Git, pnpm, or the build toolchain.

This policy keeps development, air-gapped use, and local builds deterministic.
