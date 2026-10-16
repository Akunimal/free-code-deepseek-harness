# Release policy

### Current 0.9.4 candidate (alpha8)

The alpha8 runtime and its archive/checksum are verified locally; opencode2api v1.4.0 uses `profiles/web/cordis.patch.yml`. The full non-interactive release gate passed, and fresh setup/portable artifacts were built and statically verified; exact hashes are in `release-notes-v0.9.4.md`. The candidate includes visible catalog refresh status (V094-37), original Hermes-inspired animated backgrounds that stay stable during generation and transition after completion/stop (V094-38), per-model context/reasoning capabilities (V094-39), the V094-35 composer recursion fix, live profile synchronization and V094-21 model-catalog/Tor fixes. Alpha6/alpha7 desktop artifacts are superseded. Alpha8 remains unpublished; the local candidate bundle includes the exact runtime archive and a CHECK ONLY preflight. This task did not install or launch FreeCode. Public-provider acceptance remains unverified; alpha5/alpha6 desktop artifacts are superseded. No tag, upload or release is included.

Releases are manual and target Windows x64. This policy describes the real
desktop/runtime boundary used by v0.9.3; it does not authorize touching a
maintainer's running FreeCode instance.

The v0.9.4 candidate includes the V094-35 model-block recursion repair, so the tracked `apps/shell/harness-runtime.json` pin is 0.2.1-alpha.8. Alpha6 is an immutable historical archive and predates that code. The alpha8 runtime archive was regenerated and verified locally (421,507,898 bytes; SHA-256 `bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6`). It is not published. The full gate and final setup/portable build passed; the exact artifact hashes are in the bilingual release notes. The old alpha4/alpha6 caches do not satisfy the alpha8 pin. Never describe an unuploaded archive as a downloadable release asset. OmniRoute remains removed: no fallback, download, server or detection endpoint is shipped. Only obsolete app-owned configuration and verified caches are retired at next startup; unrelated providers and sessions are preserved.

The verified desktop artifacts are in the unique output directory
`apps/shell/release-0.9.4-alpha8-20261016/`; do not reuse or overwrite
the superseded alpha5 candidate directory.

After changing opencode2api source or its active fork overlay, rebuild with
`bash scripts/build-opencode2api.sh`. It also stages the new Windows sidecar
without regenerating DSH. Prepackage verification rejects missing receipts,
changed source fingerprints or stale binary bytes; it never silently stages
an unverified old build. Runtime packaging refreshes version/hash pins only for
locally built opencode2api and DSH outputs; optional PATH-fallback tools may be
absent, while required runtime assets must exist and match their pinned hashes.

The desktop package gate checks the actual DSH conversation CSS after runtime
materialization, after copying into `resources/freecode/dsh`, and before
electron-builder. It also renders those emitted rules in isolated headless
Chrome/Edge from a data URL and samples both ambient transforms over timed
frames; each must move at least 8 CSS pixels in 1.65 seconds. Reduced motion
must stop both animations without dimming either wash. Set FREECODE_CHROME_PATH
if Chromium is not installed at a standard Windows location. This test uses a
disposable browser profile and does not launch FreeCode or reuse a user browser
profile. Tor's loopback SOCKS proxy is checked locally every 10 seconds
when unhealthy; remote proxies retain the slower external health-check cadence.
Tor daemon failure diagnostics exposed to the UI must remain bounded and redact
cookie/password/token-like values. NSIS runtime smoke must isolate APPDATA,
LOCALAPPDATA, USERPROFILE, HOME and temporary roots: Chromium's
`--user-data-dir` alone does not redirect Electron `app.getPath('userData')`.
Without the private profile, the smoke can leave Tor config pointing into its
deleted temporary install tree.

## Release contents and pinned runtime

The v0.9.3 desktop release contains the NSIS setup, portable executable,
setup blockmap and `latest.yml`. The separate DSH runtime has an independent
version: v0.9.3 reuses the exact `0.2.1-alpha.2` Windows x64 runtime
published with v0.9.2. The release gate verifies its local SHA-256 and the
packaged runtime manifest; it never rebuilds, removes or replaces that archive.
Ordinary `build:desktop` packaging also does not run `package:runtime`.

Only an intentional DSH runtime change may bump the runtime manifest and invoke
`pnpm package:runtime:release`. A published runtime version is immutable; ship a
new runtime version and checksum instead of overwriting an existing archive.

## Non-interactive workstation checks

On Windows x64, run the repository's required gate, then build the release
artifacts into a new, isolated output directory and verify that exact directory:

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.4-alpha8-20261016'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.4-alpha8-20261016
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

Test workspaces run sequentially so simultaneous cold DSH CLI probes do not
compete for filesystem initialization. Probe timeouts and assertions are not
relaxed; archive creation and large staging copies must finish before the gate.

`release:gate` runs the workspace tests/contracts/typechecks, build and
prepackage checks, an offline MCP integration smoke backed only by
repository-owned stdio fixtures and a loopback mock provider, checks the pinned
runtime asset, and builds one NSIS package under an OS-temporary directory. The
gate is non-interactive at the desktop UI boundary, not literally process-free:
it starts test-owned hidden DSH CLI/Electron-as-Node, isolated headless
Chromium for the CSS renderer, and fixture child processes. The MCP smoke uses
only repository fixtures, a loopback endpoint and
scratch HOME/profile/cache/temp paths; it does not download or execute
third-party MCP packages or inherit maintainer credentials. Cleanup targets
only its recorded DSH child PID tree and unique scratch paths; it does not
enumerate or kill unrelated processes. The gate statically verifies that exact
package's PE header, versioned `latest.yml`, SHA-512, blockmap and runtime
manifest. It does not rebuild the DSH runtime. Despite the test-owned children,
it does not install or launch the FreeCode GUI, or touch the active user's app,
shortcuts or registry.

`verify:desktop-release-assets` is a static check: it validates the exact setup
and portable PE files, setup blockmap and updater metadata, and reports SHA-256
hashes. Neither executable is launched. `build:desktop` refuses a non-empty
output directory unless replacement is explicitly enabled; keep previous and
historical release folders intact.

The user confirmed the v0.9.3 NSIS installation works on Windows x64. The
portable executable was built and statically validated, but was not separately
installation-tested. Do not present static artifact checks as an install test.

## Optional interactive installer smoke

`pnpm --filter @freecode/shell smoke:nsis` installs, starts, and uninstalls an
application copy. NSIS can change per-user shortcuts and registration, and the
app launch creates processes and windows. This smoke is therefore **not** part
of `release:gate` and must never run on a maintainer workstation or alongside a
user's active instance. Use only a disposable Windows VM/account, with the exact
setup selected explicitly:

```powershell
$env:FREECODE_ALLOW_INTERACTIVE_NSIS_SMOKE = '1'
$env:FREECODE_NSIS_SMOKE_ENV = 'disposable-vm'
$env:FREECODE_NSIS_SETUP_PATH = 'C:\path\to\exact\FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe'
pnpm --filter @freecode/shell smoke:nsis
```

The smoke refuses to proceed without both disposable-environment opt-ins and
an exact version-matching setup path. Do not set those variables on a normal
workstation. Preserve user data and never kill unrelated processes.

## Manual publication

After the local gate and artifact verification pass, review the bilingual
release notes and recorded hashes, then publish only to the authorized fork.
The repository has no release workflow; do not add one or consume GitHub Actions
quota. Keep English and Spanish release notes aligned. Linux, macOS and Windows
ARM64 are not tested release targets.

The optional RTK integration remains user-installed and is not a bundled
dependency; the application must continue to work when `rtk` is absent.

External MCP-server interoperability is not part of the workstation gate:
third-party server packages may execute arbitrary code and require network
access. Validate such servers only in an explicitly disposable environment,
with test-only credentials and scratch data; do not forward a maintainer's
profile, caches, tokens, or environment to them.

See [the Spanish policy](RELEASE-POLICY.es.md) for the equivalent procedure.
