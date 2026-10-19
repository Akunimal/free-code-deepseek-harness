# Release and packaging

### Current release: v1.0.0 (Windows x64)

FreeCode DeepSeek Harness v1.0.0 runs the free OpenCode models through the bundled opencode2api gateway with no Tor: direct first, and a demand-driven egress proxy lane only when OpenCode Zen blocks the connection. Busy local ports are skipped, the DeepSeek API-key prompt is gone, `deepseek-v4.1-flash-free` is the preferred default, the selector shows a spinner while the free models load (this takes from a few seconds to about two minutes), and the reasoning effort starts at each model's own default. Engram and the Gentle AI mode were removed. Background process trees still use the verified `headless-host` helper. DSH `0.2.1-alpha.11` is a separate first-launch download, not bundled in setup/portable. See the [bilingual v1.0.0 release notes](../release-notes-v1.0.0.md).

**Release status:** the final Windows x64 setup and portable for v1.0.0 passed the full release gate on the final source, including the public empty-cache runtime download; do not substitute a local preload.

Inherited behavior remains: opencode2api v1.4.0 (FreeCode-patched v1.4.1 gateway), catalog fixes V094-21, composer fix V094-35, catalog-loading indicator V094-37, 13 Hermes-inspired CSS/ASCII backgrounds V094-38, context/effort metadata V094-39 and the active `profiles/web/cordis.patch.yml` catalog.

## Current baseline

Source and artifacts target v1.0.0. The separate immutable alpha.11 runtime is
published in the [runtime-0.2.1-alpha.11](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/runtime-0.2.1-alpha.11) pre-release before the real
public clean-cache gate; older desktop binaries and tags are not replaced. The
previous desktop release (v0.9.6) used alpha9 from v0.9.5. Windows x64 only is supported. New artifact hashes are recorded in
the notes after verification. Fresh output: `apps/shell/release-1.0.0-final-20261019/`.

## Local Windows build

Run from PowerShell on Windows x64. The ordinary gate is non-interactive at the
desktop UI boundary: it does not install or launch the FreeCode GUI. It does
start test-owned hidden DSH CLI/Electron-as-Node and fixture child processes in
scratch. It validates the existing pinned DSH runtime and downloads that exact
public runtime from a newly empty scratch cache; it does not rebuild the archive.

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-1.0.0-final-20261019'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-1.0.0-final-20261019
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

The gate runs tests, contracts, typechecks, build/prepackage validation, an
offline MCP integration smoke using repository-owned stdio fixtures and a
loopback mock provider, downloads the exact public v0.2.1-alpha.11 runtime into
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

The v1.0.0 Windows desktop artifacts are staged in the isolated final output
directory:

~~~
apps/shell/release-1.0.0-final-20261019/FreeCode-DeepSeek-Harness-1.0.0-win-x64-setup.exe
apps/shell/release-1.0.0-final-20261019/FreeCode-DeepSeek-Harness-1.0.0-win-x64-setup.exe.blockmap
apps/shell/release-1.0.0-final-20261019/FreeCode-DeepSeek-Harness-1.0.0-win-x64-portable.exe
apps/shell/release-1.0.0-final-20261019/latest.yml
apps/shell/release-1.0.0-final-20261019/win-unpacked/FreeCode DeepSeek Harness.exe
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

The v1.0.0 desktop installers contain Electron, the opencode2api gateway (sole
model gateway — freellmpool removed; no Tor), native picker/runtime files and
Tesseract. The DSH runtime
is intentionally excluded from setup/portable and shipped as a separate asset.
RTK, Caveman and free-search binaries are not vendored: they stay
optional PATH-resolved helpers, and unresolvable MCP entries start disabled. The
installed closure enumerates version, architecture, source, license, hash and
relative path in `runtime-deps.json`, verified by
`verify-runtime-dependencies.mjs`.

On first launch of published v1.0.0, a missing valid per-user cache triggers a download of the
exact pinned DSH runtime `0.2.1-alpha.11` for Windows x64 from the public runtime-0.2.1-alpha.11 pre-release,
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
user data contract. It never offers older DSH runtimes as available upgrades.

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

Current release and notes: [v1.0.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0),
[bilingual notes](../release-notes-v1.0.0.md). The separate alpha.11 runtime is
served from the [runtime-0.2.1-alpha.11](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/runtime-0.2.1-alpha.11) pre-release.
v0.9.6 and earlier tags, notes and desktop binaries remain immutable history.
See the [Spanish guide](RELEASE.es.md) and [policy](RELEASE-POLICY.md).
