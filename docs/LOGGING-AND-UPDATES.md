# Logging and updates

## Logging

The Electron main process writes structured JSONL to `<userData>/logs/app.log`. The rotating destination defaults to 5 MiB per file and three retained files (`app.log`, `.1`, `.2`, `.3`). The worker pool keeps its per-worker logs under `<userData>/logs/` as configured by `opencode-adapter`.

The logger records lifecycle, update checks, and operational metadata. It does not receive secret values; callers should log identifiers and status only.

## Updates

FreeCode checks the fork's GitHub Releases automatically and compares the bundled upstream commit with `deepseek-ai/deepseek-harness`. When a release or Harness runtime update is available, a localized download-arrow indicator appears beside Settings; clicking it still asks for confirmation before downloading or installing. Background checks run at startup and every six hours, with a single in-flight check so transient network failures cannot create overlapping updater work.

When the app is running from a source checkout, the same dialog can run **Update upstream and rebuild locally**. That action requires a clean checkout, pulls the upstream subtree, runs the full tests, and runs `pnpm build:desktop`; it is intentionally unavailable in packaged builds because a portable artifact does not contain Git, pnpm, or the build toolchain.

This policy keeps development, air-gapped use, and local builds deterministic.
