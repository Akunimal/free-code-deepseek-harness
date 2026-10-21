# Release and packaging

### Current source candidate: v1.0.1 (Windows x64)

v1.0.1 replaces the active OpenCode2API gateway with the bundled, pinned
Phoenix FreeLLMpool 0.13.0 Windows x64 executable. Phoenix ships with its MIT
license, model allowlist and source/build receipt; startup verifies its hash,
provenance and architecture. It does not require `C:\LocalAI`, local Python,
another FreeLLMpool installation or a pre-existing port/service. Auto Phoenix
is first in the selector. A concrete model stays strictly pinned; only Auto may
try another eligible free route before the first stream byte.

**Release status:** v1.0.1 is an unpublished local source candidate. Setup and
portable have not been built or installed, and the full release gate has not
run. The last published desktop release is the historical
[v1.0.0 release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0).
Do not present the candidate as installable or claim clean-install proof.
Candidate notes: [bilingual v1.0.1](../release-notes-v1.0.1.md).

## Current baseline

The source version is 1.0.1. The DSH runtime remains a separate immutable
`0.2.1-alpha.11` Windows x64 asset (ABI 149), downloaded on first start when
the per-user cache is absent. Its public clean-cache smoke remains mandatory.
Phoenix is bundled in the desktop payload and is locally receipt/hash checked;
it is not a separate first-run download. Output, once built, is isolated in
`apps/shell/release-1.0.1-candidate/`. No v1.0.1 setup/portable sizes or hashes
exist yet. Older release folders, tags and assets are historical and must not
be overwritten.

## Local Windows build

Run only on Windows x64. The required `pnpm release:gate` is non-interactive at
the desktop UI boundary: it does not install or launch the FreeCode GUI. It
does start test-owned hidden DSH CLI/Electron-as-Node, fixture children,
isolated Chromium and the exact staged/packaged `freecode-launcher` plus
verified `headless-host` helper in scratch.
It checks the pinned Phoenix payload, builds and verifies the desktop package,
and performs a real DSH first-run download from a new empty scratch profile via
the production bootstrap/updater. That DSH smoke verifies public GitHub
SHA-256, extraction, manifest, packaged Electron ABI and hidden CLI startup.
It does not rebuild the immutable DSH archive. Missing public asset/network or
any checksum/layout/ABI/startup failure blocks publication.

After the gate passes, build to a new output directory and validate those
exact artifacts:

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-1.0.1-candidate'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-1.0.1-candidate
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

`verify:desktop-release-assets` checks setup/portable PE headers, blockmap,
`latest.yml` version/path/size/SHA-512 and SHA-256 hashes. It does not execute
either artifact. `build:desktop` refuses to replace a non-empty output
directory unless explicit replacement is enabled. Preserve all previous and
historical artifacts.

The candidate directory is not present yet. Do not invent filenames or hashes;
record them in the bilingual notes only after a successful build and exact
artifact verification.

## Runtime dependency policy

The v1.0.1 desktop payload includes Phoenix, Electron, native picker/runtime
files and Tesseract. `apps/shell/resources/runtime-deps.json` records required
runtime versions, architecture, source, license, SHA-256, launch arguments and
relative paths. `freellmpool-staging.mjs` verifies the immutable source/toolchain
pin, build receipt and exact staged bytes before packaging. No OpenCode2API
binary, adapter, source tree or build pipeline is active or packaged.

The DSH runtime is excluded from setup/portable and fetched separately only on
first start. It uses the public `runtime-0.2.1-alpha.11` asset and SHA-256;
later starts reuse a verified per-user cache. A missing/invalid runtime or
failed first-run download must keep DSH stopped and offer Retry/Close. Ordinary
desktop packaging does not rebuild the runtime. Run
`pnpm package:runtime:release` only for an intentional DSH runtime version
change; published runtime versions are immutable.

RTK, Caveman and free-search remain optional PATH-resolved tools, not part of
the Phoenix provider runtime. Missing optional MCP tools start disabled rather
than blocking FreeCode startup.

## Windows-only publication

Windows x64 is the only supported release target. Linux, macOS and Windows
ARM64 artifacts are not official releases and have no claim of usability
without native testing. Do not mix Windows and WSL `node_modules`.

There is no GitHub release workflow. Pushes do not build or publish installers.
Publication is a separate manual action after the release gate, exact artifact
verification, bilingual note review and explicit authorization. A workstation
installer smoke is not part of the normal gate; interactive install/launch/
uninstall validation belongs only in an explicitly disposable Windows VM/account.

## Updater and upstream changes

The app updater is not a substitute for the release gate. It keeps the Send-
shaped down-arrow control, checks on startup and schedule, shows tray/native
download/install progress and preserves user data. It never offers older DSH
runtimes as upgrades.

The source-only upstream workflow is:

```text
freeze evidence
  -> update/fetch vendor/deepseek-harness
  -> pnpm apply:upstream-patches
  -> verify manifest and replay
  -> tests/typecheck/build/package
```

See [the release policy](RELEASE-POLICY.md), [headless containment](HEADLESS-DESKTOP.md),
and [upstream patching](UPSTREAM-PATCHING.md).

## Version history

The published [v1.0.0 release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0)
and [its notes](../release-notes-v1.0.0.md) are historical. v1.0.1 remains
unpublished until all mandatory gates pass and the user authorizes publication.
See the [Spanish guide](RELEASE.es.md) and [policy](RELEASE-POLICY.md).
