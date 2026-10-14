# Release policy

Releases are manual and target Windows x64. This policy describes the real
desktop/runtime boundary used by v0.9.3; it does not authorize touching a
maintainer's running FreeCode instance.

The current source version is v0.9.4 candidate; it remains unpublished until
its validation is complete. The v0.9.3 assets and hashes below remain historical
published evidence and must not be overwritten.

The v0.9.4 candidate intentionally changes the DSH conversation background and
therefore pins a new runtime, `0.2.1-alpha.3`, in the tracked
`apps/shell/harness-runtime.json`. Regenerate its runtime before packaging;
the stage-manifest gate rejects an old alpha2 stage. Alpha2 archives remain
immutable. OmniRoute 3.8.51 is a separate verified first-launch download, not
an installer dependency tree. Unpublished runtime assets are not downloadable
yet: local testing must explicitly arrange verified local runtimes before
launch; never describe an unavailable remote asset as ready.

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
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.4-candidate'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.4-candidate
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

`release:gate` runs the workspace tests/contracts/typechecks, build and
prepackage checks, an offline MCP integration smoke backed only by
repository-owned stdio fixtures and a loopback mock provider, checks the pinned
runtime asset, and builds one NSIS package under an OS-temporary directory. The
gate is non-interactive at the desktop UI boundary, not literally process-free:
it starts test-owned hidden DSH CLI/Electron-as-Node and fixture child
processes. The MCP smoke uses only repository fixtures, a loopback endpoint and
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
