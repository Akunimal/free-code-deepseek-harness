# Release and packaging

This repository is the public Akunimal/free-code-deepseek-harness fork of
deepseek-ai/deepseek-harness. Product code lives outside the
vendor/deepseek-harness subtree where possible; upstream changes are replayed
through the ordered patch stack.

## Current baseline

The published v0.9.3 release is the current Windows x64 baseline:

- v0.9.3 Windows NSIS installer (~178.5 MB), installed and confirmed working by
  the user;
- v0.9.3 Windows portable executable (~651 MB / 620.8 MiB), built but not
  separately installation-tested;
- `latest.yml` plus the setup blockmap for the updater;
- pinned DSH `0.2.1-alpha.2` Windows x64 runtime tarball (~421.6 MB) and its
  `.sha256` file remain in the v0.9.2 release, separately from desktop installers.

For v0.9.3, shell preflight, regression gates, shell build and Windows setup/
portable packaging were verified; the user confirmed the installed setup works.
The full vendor composite typecheck still reports unrelated existing errors in
`packages/llm/llm`; the portable executable was not separately installed.
Windows x64 is the only tested and supported release target. Windows ARM64, Linux
and macOS are NOT tested and NOT supported; no artifacts are published for
them.

0.4.3 is a historical recovery reference, not a compatibility guarantee or the
source of truth for current code. Release validation uses the current v0.9.3
install and its pinned runtime bootstrap.

The 0.7.0 roadmap is closed; its ledger is
[docs/STATE-0.7.0.md](STATE-0.7.0.md). The full read-only findings are in
[docs/AUDIT-0.6.0-TEST-PLAN.md](AUDIT-0.6.0-TEST-PLAN.md).

## Local Windows build

Run from PowerShell on Windows x64:

```powershell
pnpm install --frozen-lockfile
pnpm apply:upstream-patches
pnpm test
pnpm typecheck
pnpm build:vendor
pnpm build:shell
pnpm --filter @freecode/shell package:runtime
pnpm --filter @freecode/shell package
pnpm --filter @freecode/shell smoke:nsis
```

These commands are local and do not use GitHub Actions. Required resources
fail the gate when missing; they are never silently skipped because a
developer machine lacks a fixture.

The v0.9.3 Windows desktop artifacts were built into the isolated local output
directory to preserve historical v0.9.2 files:

~~~
apps/shell/release-0.9.3-local/FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe
apps/shell/release-0.9.3-local/FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe.blockmap
apps/shell/release-0.9.3-local/FreeCode-DeepSeek-Harness-0.9.3-win-x64-portable.exe
apps/shell/release-0.9.3-local/latest.yml
apps/shell/release-0.9.3-local/win-unpacked/FreeCode DeepSeek Harness.exe
~~~

Artifact names are generated from the package version and verified after
packaging; do not copy an old name into a new release. If `release/win-unpacked`
is locked by a running instance (the `Device or resource busy` case seen in
0.9.0), package into a fresh output dir and copy the setup/portable/blockmap/
`latest.yml` artifacts into `release/` instead of force-deleting the locked
tree.

## Runtime dependency policy

The v0.9.3 desktop installers contain Electron, the opencode2api gateway (sole
model gateway — freellmpool removed), the bundled Tor binaries (`tor.exe`,
`geoip`, `geoip6`), native picker/runtime files and Tesseract. The DSH runtime
is intentionally excluded from setup/portable and shipped as a separate asset.
RTK, Caveman and free-search binaries are not vendored: they stay
optional PATH-resolved helpers, and unresolvable MCP entries start disabled. The
installed closure enumerates version, architecture, source, license, hash and
relative path in `runtime-deps.json`, verified by
`verify-runtime-dependencies.mjs`.

On any launch without a valid per-user cache, the packaged app downloads the
exact pinned DSH `0.2.1-alpha.2` Windows x64 runtime from the v0.9.2 release,
verifies its published SHA-256 and Electron ABI, and caches it under
`<userData>/harness-runtime`. Later starts can use this validated cache
offline. That download requires network access; a download or compatibility
failure must keep the supervisor stopped and offer Retry/Close.

## Windows-only publication

No Linux, macOS or Windows-ARM64 artifact is an official release asset, and
none of those platforms was tested by the maintainer. Contributors may
build on a native host, but a binary generated outside its target platform
is not evidence of usability and must not be advertised without real
testing on that platform. Do not mix Windows and WSL node_modules;
reinstall dependencies for the active operating system.

The repository has no release workflow. Pushes do not build or publish
installers. Publication is a manual action after the local gate, review of
checksums, clean NSIS/portable install and state-ledger lock.

## Updater and runtime updates

The application updater is not a substitute for a release gate. It must keep
the Send-shaped downward-arrow control, check at startup and on its scheduled
interval, show tray/native progress during download/install and preserve the
user data contract. v0.9.3 also prevents older DSH runtimes from appearing as
available upgrades.

The source-only upstream update path is:

~~~
freeze evidence
  -> update/fetch vendor/deepseek-harness
  -> pnpm apply:upstream-patches
  -> verify manifest and replay
  -> test/typecheck/build/package
~~~

See [docs/UPSTREAM-PATCHING.md](UPSTREAM-PATCHING.md) and
[docs/RELEASE-POLICY.md](RELEASE-POLICY.md).

## Version history and release links

Older documents under docs/RELEASE-NOTES-v*.md describe historical releases
and are intentionally not rewritten as current instructions. The published
baseline is tracked at
[GitHub release v0.9.3](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.3);
full bilingual notes live in [release-notes-v0.9.3.md](../release-notes-v0.9.3.md).

Previous baselines:
[GitHub release v0.9.1](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.1) —
[release-notes-v0.9.1.md](../release-notes-v0.9.1.md);
[GitHub release v0.9.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.0) —
[release-notes-v0.9.0.md](../release-notes-v0.9.0.md);
[GitHub release v0.8.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.8.0) —
[release-notes-v0.8.0.md](../release-notes-v0.8.0.md);
[GitHub release v0.7.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.7.0) —
[release-notes-v0.7.0.md](../release-notes-v0.7.0.md).

For the Spanish guide, see [RELEASE.es.md](RELEASE.es.md).
