# Release policy

### Current release: v0.9.6 (Windows x64)

**Candidate status:** v0.9.6 is not published yet. Public clean-cache proof and final setup/portable verification are pending; do not substitute a local preload.

## Mandatory fresh-install proof

Before any runtime-dependent release is called ready or published, `pnpm
release:gate` must pass `first-run-runtime-download`. This is not a mocked
download or a cache-hit: it creates a new isolated profile and empty runtime
cache, uses the production bootstrap/updater and packaged Electron ABI, obtains
the exact public GitHub runtime asset, verifies SHA-256, extracted layout,
manifest and ABI, then starts the downloaded DSH CLI hidden with `--help`.
Missing network access, the public asset, a digest, or any validation/startup
step blocks the release. Static package/hash checks, unit mocks, a preloaded
cache, or setup exit code cannot substitute. The smoke owns only its temporary
profile/cache and hidden CLI child; it does not install or launch FreeCode or
inspect, stop, or restart unrelated processes.

## Windows containment and runtime

v0.9.6 requires the GUI-subsystem `headless-host`, a private desktop and Job
assignment while the child is suspended, with no direct-spawn fallback.
Explicit GUI actions use the authenticated broker. Native adversarial window,
descendant and Job-lifetime tests run against the exact staged and packaged
helper; source strings are not sufficient. See [scope/limits](HEADLESS-DESKTOP.md).

The current pin is `0.2.1-alpha.9` (ABI 149), 421,541,194 bytes, SHA-256
`7c1d8cb1b53e2a88a7549941afacf423a1345353b9c3aa6fd53d95d3f49c4ca5`.
It is appended as a dependency asset to v0.9.5 before the gate; no prior asset
is replaced. v0.9.4 published alpha8 and v0.9.2 alpha2; both remain history.
OmniRoute remains removed. Preserve user sessions and providers. Fresh output:
`apps/shell/release-0.9.6-final-20261016/`; final sizes/hashes are recorded in
the [bilingual notes](../release-notes-v0.9.6.md).

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

The v0.9.6 desktop release contains the NSIS setup, portable executable,
setup blockmap and `latest.yml`. The separate DSH runtime has an independent
version: v0.9.6 downloads the exact `0.2.1-alpha.9` Windows x64 runtime from
the public v0.9.5 runtime dependency release, which also provides its SHA-256 checksum. The release gate
verifies the pinned local archive and packaged runtime manifest; it never
rebuilds, removes or replaces that immutable archive. Ordinary `build:desktop`
packaging also does not run `package:runtime`.

Only an intentional DSH runtime change may bump the runtime manifest and invoke
`pnpm package:runtime:release`. A published runtime version is immutable; ship a
new runtime version and checksum instead of overwriting an existing archive.

## Non-interactive workstation checks

On Windows x64, run the repository's required gate, then build the release
artifacts into a new, isolated output directory and verify that exact directory:

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.6-final-20261016'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.6-final-20261016
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

The user confirmed the v0.9.4 NSIS installation works on Windows x64. The
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
$env:FREECODE_NSIS_SETUP_PATH = 'C:\path\to\exact\FreeCode-DeepSeek-Harness-0.9.6-win-x64-setup.exe'
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
