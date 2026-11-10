# Repository coding and release rules

## Clean-install proof for external runtimes

When a desktop release downloads a runtime separately on first launch, never
claim that a fresh installation works and never publish the release until the
mandatory release gate has completed a real clean-cache first-run smoke. The
required evidence is a public clean-cache runtime smoke, not an offline cache hit.
The smoke must start from a newly created empty app profile and runtime cache, use
the same production bootstrap/updater and packaged Electron ABI as the release,
fetch the exact public GitHub runtime asset, verify its SHA-256, extraction
layout, manifest and ABI, then start the downloaded CLI hidden and successfully.
The test must fail closed if the public asset, network, checksum, manifest, ABI
or CLI startup is unavailable or mismatched.

Mocks, unit tests alone, static hashes, a local/preloaded runtime cache, a
successful setup exit code, or a runtime copied into the test profile are not
evidence of a working first install. Keep the smoke as a mandatory release-gate
step and protect its Electron environment, empty-cache setup, hidden child
process and public download with a regression contract. If the smoke cannot
complete, state exactly what is unverified and hold publication; do not soften
the gate or describe a local cached install as a clean-install pass.

Keep every smoke profile/cache and child process isolated and test-owned. Do
not inspect, stop, restart, install over, or otherwise interfere with a user's
running FreeCode instance to perform release validation.

## Windows headless process policy

All shell-owned background Windows processes must use `freecode-launcher` and
the verified GUI-subsystem `headless-host` helper. Keep private-desktop creation
and suspended-process Job attachment mandatory; never add a direct-spawn
fallback, environment opt-out, or process-name window hider. Explicit human GUI
actions use the authenticated Electron broker, not the background desktop.
Packaging must execute the adversarial native window/descendant and Job-lifetime
tests against the exact staged and packaged helper, alongside runtime GUI-broker
compatibility checks. Source-string contracts alone do not satisfy this policy.
See [Windows desktop containment](docs/HEADLESS-DESKTOP.md) for scope and limits.

## Release versioning and build workflow

A version number identifies a release candidate, not a build. Test builds never
get a version number of their own.

### App version

The app version lives in `package.json` and `apps/shell/package.json`. Both
files always hold the same value.

- A version is published when its `v<version>` tag exists on `origin`. Check
  with `git ls-remote --tags origin "v<version>"`.
- If the current version is published, the first change after it bumps the
  patch number once (+1, for example 1.0.2 -> 1.0.3). That number is the
  candidate for the whole release cycle.
- If the current version is not published, keep it. Every further test build,
  fix or rebuild reuses the same number. Never bump an unpublished version, and
  never bump only to produce an installer.
- The candidate is always exactly the last published version +1 patch. Never
  skip a number. If the repository holds a higher unpublished number, set it
  back to last published +1 before building. A version installed on a
  developer machine is not a reason to keep a number.
- Tell the builds of one candidate apart by output directory, not by version:
  `FREECODE_RELEASE_OUTPUT=release-<version>-local-<label>`.

### DSH runtime pin

The runtime pin lives in `apps/shell/harness-runtime.json`. It follows the same
rule on its own track.

- A runtime is published when its `runtime-<version>` tag exists on `origin`.
  A published runtime is immutable.
- A change that only touches the desktop shell never changes the pin.
- If runtime code changes and the pinned runtime is published, bump the pin
  once. That number is the runtime candidate until it is published.
- If the pinned runtime is not published, rebuild it under the same version.
  Delete its stale local archive in `apps/shell/release/` first, because
  `package-harness-update.mjs` never overwrites an archive. Then prepare the
  local runtime cache again, because the bootstrap reuses any cache that
  satisfies the pin and would keep the old files.

### Mandatory release flow

1. **Local build**: The agent applies the version rules above, then builds the
   test setup and portable binaries
   (`FreeCode-DeepSeek-Harness-<version>-win-x64-setup.exe`) into a new local
   output directory. When the pinned runtime is unpublished, the agent adds its
   archive to that directory and runs `node scripts/local-candidate-bundle.mjs
   <directory>`, which writes `Prepare-Local-Runtime.ps1`.
2. **User local verification**: The user installs and tests the generated build
   locally. The agent never tags or publishes prematurely.
3. **User approval (OK)**: The agent waits for the user's explicit OK.
4. **Publish**: After the user's OK, the agent publishes the runtime pre-release
   first when the pin changed, runs the clean-install release gate, writes the
   bilingual release documentation (`release-notes-v<version>.md`, `README.md`,
   `README.es.md` in English and Spanish), creates the git tag (`v<version>`)
   and finalizes the release.
