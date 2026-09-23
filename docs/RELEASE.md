# Release and packaging

This repository is the public Akunimal/free-code-deepseek-harness fork of
deepseek-ai/deepseek-harness. Product code lives outside the
vendor/deepseek-harness subtree where possible; upstream changes are replayed
through the ordered patch stack.

## Current baseline

The published 0.7.0 release is the current Windows x64 baseline:

- 0.7.0 Windows NSIS installer (~300 MB);
- 0.7.0 Windows portable executable (~300 MB);
- `latest.yml` plus blockmap for the updater;
- harness runtime tarball (+`.sha256`) for in-app runtime updates.

The 0.7.0 gate passed: typecheck clean, shell suite 165/165, all
prepackage verifiers green, clean install, `harness ready`, both model
lanes populated, graceful shutdown. Tested on Windows 10/11 x64 ONLY.
Windows ARM64, Linux and macOS are NOT tested and NOT supported; no
artifacts are published for them.

0.4.3 is the last operational recovery reference because it opens. It is not a
compatibility guarantee and is not the source of truth for current code. The
0.7.0 gate does not require an upgrade from 0.4.3; it requires clean install,
open, project selection and relaunch.

The 0.7.0 roadmap is closed; its ledger is
[docs/STATE-0.7.0.md](STATE-0.7.0.md). The full read-only findings are in
[docs/AUDIT-0.6.0-TEST-PLAN.md](AUDIT-0.6.0-TEST-PLAN.md).

## Local Windows build

Run from PowerShell on Windows x64:

~~~
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

The expected 0.7.0 Windows artifacts are:

~~~
apps/shell/release/FreeCode-DeepSeek-Harness-0.7.0-win-x64-setup.exe
apps/shell/release/FreeCode-DeepSeek-Harness-0.7.0-win-x64-portable.exe
apps/shell/release/FreeCode-DeepSeek-Harness-0.7.0-win-x64-setup.exe.blockmap
apps/shell/release/latest.yml
apps/shell/release/deepseek-harness-runtime-0.1.3-alpha.1-win32-x64.tar.gz
apps/shell/release/win-unpacked/FreeCode DeepSeek Harness.exe
~~~

Artifact names are generated from the package version and verified after
packaging; do not copy an old name into a new release.

## Runtime dependency policy

The 0.7.0 installer contains Electron, the Harness runtime, the opencode2api
gateway, native picker/runtime files and Tesseract. RTK, Caveman and
free-search binaries are not vendored: they stay optional PATH-resolved
helpers, and unresolvable MCP entries start disabled. The installed closure
enumerates version, architecture, source, license, hash and relative path in
`runtime-deps.json`, verified by `verify-runtime-dependencies.mjs`.

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
user data contract. 0.7.0 does not require an upgrade from 0.4.3.

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
[GitHub release 0.7.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/0.7.0);
full bilingual notes live in [release-notes-v0.7.0.md](../release-notes-v0.7.0.md).

For the Spanish guide, see [RELEASE.es.md](RELEASE.es.md).
