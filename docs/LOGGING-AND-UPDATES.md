# Logging and updates

## Logging

The Electron main process writes structured JSONL to `<userData>/logs/app.log`. The rotating destination defaults to 5 MiB per file and three retained files (`app.log`, `.1`, `.2`, `.3`). The worker pool keeps its per-worker logs under `<userData>/logs/` as configured by `opencode-adapter`.

The logger records lifecycle, update checks, and operational metadata. It does not receive secret values; callers should log identifiers and status only.

## Updates

Updates are opt-in. Set `FREECODE_ENABLE_UPDATES=1` to enable the `electron-updater` adapter configured for GitHub Releases owned by `Akunimal/free-code-deepseek-harness`. The app checks on startup and every six hours, does not auto-download, and installs only through the explicit updater flow. Without the flag, the menu item and service are inert and no network check occurs.

This policy keeps development, air-gapped use, and local builds deterministic.
