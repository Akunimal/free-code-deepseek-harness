# Release and packaging

### Current release: v0.9.5 (Windows x64)

The public `v0.9.5` release contains the NSIS setup, portable executable and updater metadata. It fixes the Pool Status close button and proves first-launch DSH alpha8 retrieval from an empty scratch profile/cache using the production bootstrap/updater, public GitHub asset, SHA-256, extraction/layout, manifest, packaged Electron ABI and hidden CLI startup. The DSH runtime remains a separate download; its immutable asset is in the v0.9.4 release. v0.9.5 carries forward opencode2api v1.4.0, V094-37 catalog feedback, V094-38 Hermes-inspired animated backgrounds, V094-39 per-model metadata, profile synchronization, inference routing, V094-21 catalog/Tor corrections and V094-35 composer recursion fix. Exact current assets/hashes are in the bilingual [v0.9.5 release notes](../release-notes-v0.9.5.md); v0.9.4 release notes remain historical. The active catalog is `profiles/web/cordis.patch.yml`.

This repository is the public Akunimal/free-code-deepseek-harness fork of
deepseek-ai/deepseek-harness. Product code lives outside the
vendor/deepseek-harness subtree where possible; upstream changes are replayed
through the ordered patch stack.

## Current baseline

The published v0.9.5 release is the current Windows x64 baseline:

- v0.9.5 Windows NSIS installer (see release notes for exact size/hash);
- v0.9.5 Windows portable executable (see notes for exact size/hash),
  statically verified but not separately installation-tested;
- `latest.yml` plus the setup blockmap for the updater;
- pinned DSH `0.2.1-alpha.8` Windows x64 runtime tarball (~421.5 MB) and its
  `.sha256` checksum are separate assets in the immutable v0.9.4 runtime
  release, separately from the
  desktop installers.

The v0.9.5 setup and portable were packaged and statically verified; this
release process did not install or launch them. The user previously installed
v0.9.4 and confirmed it works. The mandatory clean-cache runtime smoke passed;
exact current hashes are in the v0.9.5 release notes.
Windows x64 is the only tested and supported release target. Windows ARM64, Linux
and macOS are NOT tested and NOT supported; no artifacts are published for
them.

0.4.3 is a historical recovery reference, not a compatibility guarantee or the
source of truth for current code. Release validation uses the current v0.9.5
package and its pinned runtime bootstrap.

The 0.7.0 roadmap is closed; its ledger is
[docs/STATE-0.7.0.md](STATE-0.7.0.md). The full read-only findings are in
[docs/AUDIT-0.6.0-TEST-PLAN.md](AUDIT-0.6.0-TEST-PLAN.md).

The source and public release are aligned at **v0.9.5**. It fixes the Pool
Status close route and requires public clean-cache runtime proof; inherited
model/Tor/background behavior and its alpha history remain documented in the
v0.9.4 notes.

Previous alpha5–alpha8 attempts and hashes are preserved as history; use only
the v0.9.5 desktop assets and the public pinned DSH runtime asset in v0.9.4.

## Local Windows build

Run from PowerShell on Windows x64. The ordinary gate is non-interactive at the
desktop UI boundary: it does not install or launch the FreeCode GUI. It does
start test-owned hidden DSH CLI/Electron-as-Node and fixture child processes in
scratch. It validates the existing pinned DSH runtime and downloads that exact
public runtime from a newly empty scratch cache; it does not rebuild the archive.

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.5-final-20261016'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.5-final-20261016
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

The gate runs tests, contracts, typechecks, build/prepackage validation, an
offline MCP integration smoke using repository-owned stdio fixtures and a
loopback mock provider, downloads the exact public v0.2.1-alpha.8 runtime into
an empty scratch profile/cache through production bootstrap/updater code,
verifies SHA-256, extraction, manifest, packaged Electron ABI and hidden DSH
CLI startup, then builds one exact NSIS package into an OS-temporary directory
for static validation. Smoke processes use scratch-only profile/cache/temp paths and the
MCP smoke does not inherit maintainer credentials or execute third-party
servers. Cleanup targets only the test-owned DSH PID tree and scratch directory;
it never enumerates or terminates unrelated processes. The gate never calls
`package:runtime:release`, runs the setup, launches the FreeCode GUI, or modifies
the active user's shortcuts/registry.
The final build command creates both Windows targets in a fresh, versioned
directory. `verify:desktop-release-assets` checks the exact setup and portable
PE headers, blockmap, `latest.yml` version/path/size/SHA-512, and reports the
artifacts' SHA-256 hashes. Neither executable is launched by this check.
These commands are local and do not use GitHub Actions; missing required
resources fail the gate rather than being silently skipped.

The v0.9.5 Windows desktop artifacts are staged in the isolated final output
directory:

~~~
apps/shell/release-0.9.5-final-20261016/FreeCode-DeepSeek-Harness-0.9.5-win-x64-setup.exe
apps/shell/release-0.9.5-final-20261016/FreeCode-DeepSeek-Harness-0.9.5-win-x64-setup.exe.blockmap
apps/shell/release-0.9.5-final-20261016/FreeCode-DeepSeek-Harness-0.9.5-win-x64-portable.exe
apps/shell/release-0.9.5-final-20261016/latest.yml
apps/shell/release-0.9.5-final-20261016/win-unpacked/FreeCode DeepSeek Harness.exe
~~~

Historical v0.9.4 artifacts remain preserved in their original output folder:

~~~
apps/shell/release-0.9.4-final-20261016/FreeCode-DeepSeek-Harness-0.9.4-win-x64-setup.exe
apps/shell/release-0.9.4-final-20261016/FreeCode-DeepSeek-Harness-0.9.4-win-x64-setup.exe.blockmap
apps/shell/release-0.9.4-final-20261016/FreeCode-DeepSeek-Harness-0.9.4-win-x64-portable.exe
apps/shell/release-0.9.4-final-20261016/latest.yml
apps/shell/release-0.9.4-final-20261016/win-unpacked/FreeCode DeepSeek Harness.exe
~~~

Artifact names are generated from the package version and verified after
packaging; do not copy an old name into a new release. `build:desktop` refuses
to replace a non-empty target unless the caller explicitly enables replacement.
Never force-delete or overwrite historical outputs. The interactive
`smoke:nsis` install/runtime test is excluded from the regular gate because it
changes per-user state and launches processes; it is permitted only in a
disposable Windows VM/account with the explicit opt-ins documented in
[the release policy](RELEASE-POLICY.md).

## Runtime dependency policy

The v0.9.5 desktop installers contain Electron, the opencode2api gateway (sole
model gateway — freellmpool removed), the bundled Tor binaries (`tor.exe`,
`geoip`, `geoip6`), native picker/runtime files and Tesseract. The DSH runtime
is intentionally excluded from setup/portable and shipped as a separate asset.
RTK, Caveman and free-search binaries are not vendored: they stay
optional PATH-resolved helpers, and unresolvable MCP entries start disabled. The
installed closure enumerates version, architecture, source, license, hash and
relative path in `runtime-deps.json`, verified by
`verify-runtime-dependencies.mjs`.

On first launch of published v0.9.5, a missing valid per-user cache triggers a download of the
exact pinned DSH runtime `0.2.1-alpha.8` for Windows x64 from the public v0.9.4 runtime release,
verifies its published SHA-256 and Electron ABI, and caches it under
`<userData>/harness-runtime`. Later starts can use this validated cache
offline. That download requires network access; a download or compatibility
failure must keep the supervisor stopped and offer Retry/Close.

The runtime asset is published separately from the desktop installers. Its
GitHub SHA-256 digest and the bundled manifest/ABI are verified before it is
cached; download/compatibility errors leave DSH stopped and offer Retry/Close.

## Windows-only publication

No Linux, macOS or Windows-ARM64 artifact is an official release asset, and
none of those platforms was tested by the maintainer. Contributors may
build on a native host, but a binary generated outside its target platform
is not evidence of usability and must not be advertised without real
testing on that platform. Do not mix Windows and WSL node_modules;
reinstall dependencies for the active operating system.

The repository has no release workflow. Pushes do not build or publish
installers. Publication is a manual action after the non-interactive local gate,
static verification of exact artifact hashes, bilingual note review and
state-ledger lock. A workstation installer smoke is not a required gate; use a
disposable VM only if an interactive smoke is specifically needed.

## Updater and runtime updates

The application updater is not a substitute for a release gate. It must keep
the Send-shaped downward-arrow control, check at startup and on its scheduled
interval, show tray/native progress during download/install and preserve the
user data contract. v0.9.5 also prevents older DSH runtimes from appearing as
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
[GitHub release v0.9.5](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.5);
full bilingual notes live in [release-notes-v0.9.5.md](../release-notes-v0.9.5.md).
The separate immutable DSH alpha8 runtime asset remains in the
[v0.9.4 release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.4).

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
