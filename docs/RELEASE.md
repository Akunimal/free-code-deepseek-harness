# Release and packaging

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

The current source tree is a candidate: **v0.9.4 is an unpublished candidate**;
v0.9.3 remains
the latest published Windows x64 release. Candidate changes cover opencode2api
v1.3.8, Tor ControlPort/bootstrap diagnostics and recovery, isolation of the
NSIS smoke profile, packaged conversation-background verification, and the
restored opt-in Gentle AI selector mode. Candidate notes are in
[release-notes-v0.9.4.md](../release-notes-v0.9.4.md).

The earlier alpha4 setup and portable were built and verified in
`apps/shell/release-0.9.4-candidate-refresh-20261014/`. The alpha4 setup was
executed after confirmation that FreeCode was closed; NSIS returned exit code 0.
Its normal post-install launch reported `No harness runtime asset for packaged
version 0.2.1-alpha.4 (win32-x64)`. The verified local alpha4 runtime was seeded
while the previous alpha3 cache was preserved as a backup. Startup, Tor and
backgrounds still await user verification for that installed build. These are
historical facts for the superseded alpha4 candidate. The current source pins
`0.2.1-alpha.5`; its local runtime archive and SHA-256 are verified
(`421,377,684` bytes; `26953ba93ab1daab8d837c2980f1f5f9c0a60f65677ac48fc973300f5b2229f2`).
A full tar listing succeeded and its embedded manifest reports alpha5, Electron
ABI 149 and the intended CLI entry. Stage verification also passed all 21
packaged headless-process contracts and found the conversation CSS/motion rules.
The refreshed setup/portable were generated and verified in
`apps/shell/release-0.9.4-alpha5-candidate-20261014/`; the full Windows release
gate passed, including the timed rendered-motion check and static NSIS compile.
Setup: `FreeCode-DeepSeek-Harness-0.9.4-win-x64-setup.exe` (178,630,999 bytes,
SHA-256 `3117054ba2ee29c6c9993e7f7cdd525262f8d39e4f037e037c411142659d8a08`).
Portable: `FreeCode-DeepSeek-Harness-0.9.4-win-x64-portable.exe` (178,255,861
bytes, SHA-256 `79e03080494efcd9fc9f06311b1b4f78238e57b97fd2ea00ba97baa5513f520b`).
The runtime archive is not published, so a clean install still needs that exact
asset attached to a release. The alpha4 cache cannot satisfy alpha5. The app has
not been restarted or retested, and the candidate setup was not executed. No
v0.9.4 tag or release has been created.

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
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.4-alpha5-candidate-20261014'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.4-alpha5-candidate-20261014
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

The gate runs tests, contracts, typechecks, build/prepackage validation, an
offline MCP integration smoke using repository-owned stdio fixtures and a
loopback mock provider, verifies the v0.2.1-alpha.5 runtime SHA-256 in place,
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
