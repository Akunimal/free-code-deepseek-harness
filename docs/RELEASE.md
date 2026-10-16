# Release and packaging

### Current 0.9.4 candidate (alpha8)

The candidate targets `apps/shell/release-0.9.4-alpha8-20261016/`, with DSH 0.2.1-alpha.8 and opencode2api v1.4.0. It includes V094-37 catalog-loading feedback; V094-38 original Hermes-style animated backgrounds that hold the active pattern during generation and crossfade only on completion/stop; V094-39 per-model context and supported effort metadata; active-profile synchronization, documented inference routing and V094-35's localized model-block recursion fix. The non-interactive release gate passed; fresh setup and portable artifacts were built and statically verified. Exact sizes and hashes are in `release-notes-v0.9.4.md`. Alpha6/alpha7 desktop artifacts are superseded. Alpha8 is unpublished; the local candidate bundle includes its exact runtime archive, checksum and `Prepare-Local-Runtime.ps1` CHECK ONLY preflight. Before testing, close FreeCode yourself and explicitly run the cache-preparation option; this task did not install or launch FreeCode. Public-provider acceptance remains unverified. The active catalog is `profiles/web/cordis.patch.yml`. Alpha5/alpha6 desktop artifacts are superseded. No tag, upload or release is included.

This repository is the public Akunimal/free-code-deepseek-harness fork of
deepseek-ai/deepseek-harness. Product code lives outside the
vendor/deepseek-harness subtree where possible; upstream changes are replayed
through the ordered patch stack.

## Current baseline

The published v0.9.3 release is the current Windows x64 baseline:

- v0.9.3 Windows NSIS installer (~178.5 MB), installed and confirmed working by
  the user;
- v0.9.3 Windows portable executable (~178.2 MB / 169.9 MiB), built but not
  separately installation-tested;
- `latest.yml` plus the setup blockmap for the updater;
- pinned DSH `0.2.1-alpha.2` Windows x64 runtime tarball (~421.6 MB) and its
  `.sha256` file remain in the v0.9.2 release, separately from desktop installers.

Exact final Windows x64 assets, statically verified without execution:

- Setup: 178,543,845 bytes; SHA-256 `53dfde329731d19081204a82bbbafc4678f4c81b4588a22884ef49064f400cd5`.
- Portable: 178,169,861 bytes; SHA-256 `830eba7ca48d2ee56d2272dfa1d2d23684f5cc7507db55d7617dbc6ed8cd12d3`.

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

The current source tree is a candidate: **v0.9.4 is unpublished**; v0.9.3
remains the latest published Windows x64 release. Candidate changes include
opencode2api v1.4.0, Tor recovery, packaged backgrounds, Gentle AI, and the
V094-21 model-catalog/Tor fixes. Candidate notes are in
[release-notes-v0.9.4.md](../release-notes-v0.9.4.md).

Previous alpha5 attempts and hashes are preserved as history in the candidate
notes; do not install or publish them as this candidate.

## Local Windows build

Run from PowerShell on Windows x64. The ordinary gate is non-interactive at the
desktop UI boundary: it does not install or launch the FreeCode GUI. It does
start test-owned hidden DSH CLI/Electron-as-Node and fixture child processes in
scratch. It validates the existing pinned DSH runtime; it does not rebuild that
runtime archive.

```powershell
pnpm install --frozen-lockfile
pnpm package:runtime:release
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.4-alpha8-20261016'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.4-alpha8-20261016
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

The gate runs tests, contracts, typechecks, build/prepackage validation, an
offline MCP integration smoke using repository-owned stdio fixtures and a
loopback mock provider, verifies the v0.2.1-alpha.8 runtime SHA-256 in place,
and builds one exact NSIS package into an OS-temporary directory for static
validation. Smoke processes use scratch-only profile/cache/temp paths and the
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

The v0.9.3 Windows desktop artifacts are staged in the isolated final output
directory to preserve historical v0.9.2 files:

~~~
apps/shell/release-0.9.3-final/FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe
apps/shell/release-0.9.3-final/FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe.blockmap
apps/shell/release-0.9.3-final/FreeCode-DeepSeek-Harness-0.9.3-win-x64-portable.exe
apps/shell/release-0.9.3-final/latest.yml
apps/shell/release-0.9.3-final/win-unpacked/FreeCode DeepSeek Harness.exe
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

The v0.9.3 desktop installers contain Electron, the opencode2api gateway (sole
model gateway — freellmpool removed), the bundled Tor binaries (`tor.exe`,
`geoip`, `geoip6`), native picker/runtime files and Tesseract. The DSH runtime
is intentionally excluded from setup/portable and shipped as a separate asset.
RTK, Caveman and free-search binaries are not vendored: they stay
optional PATH-resolved helpers, and unresolvable MCP entries start disabled. The
installed closure enumerates version, architecture, source, license, hash and
relative path in `runtime-deps.json`, verified by
`verify-runtime-dependencies.mjs`.

For published v0.9.3, a launch without a valid per-user cache downloads the
exact pinned DSH `0.2.1-alpha.2` Windows x64 runtime from the v0.9.2 release,
verifies its published SHA-256 and Electron ABI, and caches it under
`<userData>/harness-runtime`. Later starts can use this validated cache
offline. That download requires network access; a download or compatibility
failure must keep the supervisor stopped and offer Retry/Close.

The v0.9.4 candidate instead requires alpha8, which is not published yet. Use
the verified local runtime/preflight for testing; publish its exact archive and
checksum before offering this setup as a clean-machine public release.

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
