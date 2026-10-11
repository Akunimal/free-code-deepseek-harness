# Finish upstream sync and prevent PowerShell console flashes

## Goal

Complete the local `deepseek-harness` sync on `upstream-sync/20261008`, preserve all fork-owned overlays as an ordered patch stack, and ensure Win32-created `pwsh` children stay hidden and do not steal focus.

## Problem and root cause

In v0.9.1, native `CreateProcessW` and `CreateProcessAsUserW` creation paths supplied redirected stdio but omitted `STARTF_USESHOWWINDOW` and `SW_HIDE`. The outer Node `windowsHide` option cannot hide a grandchild created through native Win32. The imported upstream snapshot `15a4129ecf` contains the production fix and assertions for both creation paths.

## Scope and constraints

- Upstream snapshot: `deepseek-harness` `0.2.1-alpha.1`, commit `15a4129ecf332e3e1018f26ee50c49f3f0b2054d`.
- Local sync commit: `3b46b46ae9722a70cb3fb5e075aba7ebd00f0b5a` on `upstream-sync/20261008`; manifest `syncCommit` points to this commit.
- Preserve and replay the fork's ordered `patches/upstream/` overlays. This is a fork: no upstream push, PR, or merge is in scope.
- Do not reset, abort, clean, discard work, or stop/kill the user's running process. The user explicitly authorized local binary and installer compilation on 2026-10-10; notify the user immediately before beginning the installer/electron-builder stage and wait for their response. Do not run the installer, perform an NSIS install smoke, or create a tag/release before the user finishes their manual installation check and confirms.
- The candidate version is `0.9.2` (user clarification on 2026-10-10). The documented `pnpm build:desktop` pipeline creates new `0.9.2` setup/portable filenames under `apps/shell/release` and rebuilds `apps/shell/resources/freecode/dsh`; its runtime archive remains named for upstream runtime `0.2.1-alpha.1` and is regenerated. It does not launch the installer. The user first authorized individually named missing packages and then explicitly broadened that permission to all missing packages required by the frozen vendored lockfile, downloaded from `https://registry.npmjs.org` without credentials. Separately, the user authorized only Electron `35.7.5` headers from `https://electronjs.org/headers`, without credentials. Keep all package-manager work offline after warming the configured store; no other remote destination is authorized.
- TDD: Red-Green-Refactor, explicitly selected by the user. Runner: vendored Vitest; pnpm cannot resolve this sandbox workspace, so focused Vitest is invoked through local Node.
- Exact focused command (cwd `vendor/deepseek-harness`):
  `node -e 'process.env.TEMP=process.cwd();process.env.TMP=process.env.TEMP;process.env.TMPDIR=process.env.TEMP;const r=require("node:child_process").spawnSync(process.execPath,["node_modules/vitest/vitest.mjs","run","--config","vitest.config.ts","packages/subprocess/win32-process/tests/ordinary-process.spec.ts","packages/subprocess/win32-process/tests/process.spec.ts"],{encoding:"utf8",env:process.env,maxBuffer:32*1024*1024});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);process.exit(r.status??1);'`
- Graphify was queried before source inspection. `rtk graphify update I:\DeepSeek-Harness\free-code-deepseek-harness` was attempted after the edits but failed with `uv trampoline failed to canonicalize script path`; graph freshness is unconfirmed.
- Engram mirror `odd/pwsh-console-window-regression/tasks` is pending because the runtime did not register an authoritative session identity. Do not attempt agent-attributed memory writes until the host re-registers it.

## Acceptance criteria

- No unmerged index entries or active merge remain; imported upstream state and fork overlays are committed locally.
- The ordered patch stack replays idempotently on top of the imported snapshot.
- Tests assert `STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW` and `SW_HIDE` for ordinary and restricted-token Win32 creation.
- Focused tests are green. Any environment-blocked checks are recorded honestly. Installer compilation is authorized and tracked in `BUILD-1`; installation/release remain out of scope pending the user's manual check.
- The user-requested Windows desktop candidate (runtime/native binaries, NSIS setup, portable executable, and runtime archive) is built locally as `0.9.2`, but is not installed, tagged, or released. Keep the build local/offline unless the user explicitly authorizes a narrowly scoped dependency fetch.

## Delivery

- Strategy: `exception-ok`; this is a single local subtree sync, well beyond the advisory ~400-line review heuristic. No upstream delivery is authorized or needed.
- Forecast: upstream tree import is substantially over 400 changed lines; focused regression guards are under 150 authored lines.

## Tasks

### SYNC-1 - Complete local upstream subtree sync

- [x] Resolve the imported subtree against upstream, including upstream deletions, then replay the fork overlays.
- [x] Update the patch manifest to upstream `0.2.1-alpha.1` and local sync anchor `3b46b46ae9722a70cb3fb5e075aba7ebd00f0b5a`.
- [x] Replay all 20 ordered patches; refresh overlapping patches so reverse/replay validation remains clean.
- [x] Confirm no unmerged index entries or active merge remain.
- [x] Create the local work-unit commit for the replayed fork state and this task evidence; do not push.
- Checks: `node scripts/apply-upstream-patches.mjs` twice (20 already-applied, zero failed both runs); `node scripts/verify-upstream-patch-stack.mjs`; `git ls-files -u`; `git diff --check`.
- Evidence/limitations: patch replay succeeded twice. The verifier reports all static/replay/whitespace checks green except its idempotency subprocess: pnpm tries an implicit install and fails with `EPERM` resolving the workspace realpath. Full `git diff --check` flags whitespace in serialized patch hunks; the vendored source and task/docs checks pass. No remote operation was performed.
- Commit evidence: `109a14ec22f44a6fc26162eb8f34a83255f63f57` (`chore(upstream): complete 0.2.1-alpha.1 sync with fork patches`).

### REG-1 - Guard hidden Win32 child windows

- [x] Confirm and retain hidden startup flags for both `CreateProcessW` and `CreateProcessAsUserW` routes.
- [x] TDD Red: temporarily remove `STARTF_USESHOWWINDOW`; three assertions fail (`257` expected, `256` received). Restore the production fix.
- [x] TDD Green: focused Vitest run passes 2 files / 19 tests. Both creation routes have hidden-flag regression assertions, so no additional duplicate test file is needed.
- [x] Re-run focused Win32 tests after patch replay: 2 files / 19 tests passed.
- [x] Record the local work-unit commit containing this behavior, regression proof, and sync docs.
- Checks: focused Vitest command above; ordered patch replay; graph freshness. No installer/build/package command.
- Evidence/limitations: separate OCR/content check passed 145 tests across 3 suites; the read-image suite had 28 failures from sandbox `EPERM` during temp-path `realpath`, unrelated to Win32 startup. `pnpm` and the patch-stack verifier's pnpm subprocess are blocked by the same sandbox realpath restriction.
- Commit evidence: `109a14ec22f44a6fc26162eb8f34a83255f63f57` (`chore(upstream): complete 0.2.1-alpha.1 sync with fork patches`).

### VER-1 - Prepare version 0.9.2 build metadata and offline lock state

- [x] Align root and desktop package metadata to the user-confirmed `0.9.2` and add the regression fix to the unreleased changelog.
- [x] Reconcile all vendored `node-pty` patch-hash references in `vendor/deepseek-harness/pnpm-lock.yaml` with the fork overlay.
- Checks: inspect both package versions; compare the patch's SHA-256 with all lockfile references; `git diff --check`.
- Evidence/limitations: both package manifests now say `0.9.2`; the active fork patch hash is `471b22cde81c7a04e9d89a1274a3d87c66fd8d420ed02c9b3e68bf435e803ccf`, and the stale `b40ae5…` references were replaced. Frozen install/build verification is tracked separately in BUILD-1 because local package content is missing.
- Commit evidence: `e55f3248c3c5d9196e610cbc3ccde2b070652445` (`chore(release): prepare 0.9.2 candidate`).

### BUILD-1 - Compile local Windows binaries and installer

- [x] Reuse the existing v0.9.1 artifacts, local caches, and documented `pnpm build:desktop`/`scripts/package-runtime.sh` pipeline before requesting any downloads. The v0.9.1 vendor path did not contain the current `packages/client/ui-sidebar-documentpreview` package.
- [x] Fetch only the two explicitly authorized package specs (`@testing-library/dom@10.4.2` and `chrome-devtools-frontend@1.0.1638082`) into the configured store from `https://registry.npmjs.org`; no other package was downloaded.
- [x] Run root `pnpm build` with pnpm/npm offline; shell/workspace TypeScript and preload bundle build passed.
- [x] Quarantine and preserve the deleted `settings-file` package's ignored generated build output after proving it was the `tsdown` glob's stale workspace input; the full Host tsdown build then passed.
- [x] Complete `pnpm package:runtime` with package installs offline and the configured store `I:\.pnpm-store\v11`; only the explicitly authorized Electron `35.7.5` header fetch may use network. Do not run the release gate because it executes an installer smoke.
- [x] Reconcile the native rebuild gate with the synced upstream runtime's actual closure: the `0.2.1-alpha.1` lockfile/source contains no `fs-ext`, but `rebuild-runtime-native.mjs` previously failed before `@electron/rebuild` when the optional addon was absent. The extra node-gyp/ABI probe remains when the addon is present; tests cover both presence and absence.
- [x] Make the runtime-stage copy work without Windows symlink privilege: the first full runtime retry passed dependency install, materialization, closure, and native rebuild, but `fs.cpSync` failed while recreating `benchmarks/node_modules/@deepseek-ai/cordis` (`EPERM`). TDD added a regression test and omitted only the benchmark workspace dependency subtree from the packaged copy.
- [x] Verify runtime closure, manifest, native ABI, vendor bundle hashes, and NSIS hook configuration after the successful runtime build.
- [x] Notify the user before the electron-builder/installer stage; the user gave explicit go-ahead on 2026-10-11. Install/tag/release remain unauthorized until their manual installation check.
- [ ] Verify the generated `0.9.2` NSIS setup, portable EXE, runtime archive and SHA-256, runtime manifest, and NSIS prepackage checks; keep all outputs local for the user's manual install.
- [ ] Record build outcomes and artifact locations. Do not install, tag, or publish.
- Checks: root `pnpm build` passed with pnpm/npm offline. Host tsdown passed after quarantining stale generated output. A full frozen vendored install completed after the user's broad dependency authorization. The first runtime pass rebuilt upstream Host/Client/Web but used pnpm's sandbox-default store and stopped at `@testing-library/dom@10.4.2`; the retry set `PNPM_CONFIG_STORE_DIR=I:\.pnpm-store\v11` and kept pnpm offline. The successful runtime build completed with zero package downloads, materialized 338 workspace packages, passed closure verification, rebuilt native dependencies (none found; no Electron header fetch needed), copied `apps/shell/resources/freecode/dsh`, and packaged Tesseract. TDD RED reproduced the `benchmarks/node_modules` copy inclusion failure; GREEN passed `node --test scripts/runtime-closure.test.mjs scripts/rebuild-runtime-native.test.mjs` (9/9). Post-build: `verify-nsis-hooks.mjs` clean; `verify-vendor-bundles-fresh.mjs` confirms 323 packages fresh; runtime manifest valid; closure clean; `verify-native-abi.mjs` passed (14/26 addons load under Electron; 12 foreign-platform/native load failures were non-ABI warnings). The generated FreeCode resource tree is about 2.0 GB. The 0.9.2 installer/portable/runtime archive and hashes remain pending because the user explicitly requested a pause before electron-builder. Graphify update and source queries fail with `uv trampoline failed to canonicalize script path`. Do not run `smoke:nsis`, `smoke:nsis:upgrade`, or `release:gate`.
- Evidence/limitations: the v0.9.1 tag used upstream runtime `0.1.3-alpha.1`; its vendor lock pinned `@testing-library/dom@10.4.1`, omitted `chrome-devtools-frontend`, and the old tag lacks `packages/client/ui-sidebar-documentpreview/package.json`. The current sync advances to `0.2.1-alpha.1`, adds `@testing-library/dom@10.4.2` and `chrome-devtools-frontend@1.0.1638082`, and includes `pdfjs-dist@6.3.289` under the newly synced document-preview package. This dependency delta explains why the v0.9.1 cache was insufficient; it is not a package that must be downloaded on every release. The documented release flow remains `pnpm build:desktop`; `scripts/package-runtime.sh` does a frozen install and rebuilds vendor Host/Client/Web plus the runtime closure, while the existing v0.9.1 `builder-debug.yml` records the electron-builder NSIS cache path. Existing 0.9.1 setup/portable artifacts are present locally. No matching 0.9.1 build invocation was found in searched PowerShell history, so the exact historical shell invocation is not proven beyond the checked-in pipeline. The user individually authorized `@testing-library/dom@10.4.2`, `chrome-devtools-frontend@1.0.1638082`, `@types/semver@7.8.0`, `pdfjs-dist@6.3.289`, `yauzl@3.4.0`, `node-addon-require-builtin@0.1.6`, `@electron/get@5.1.0`, and `cos-nodejs-sdk-v5@3.0.0`, then authorized all remaining missing frozen-lockfile packages from npmjs without credentials. The frozen install passed; both runtime retries kept package installs offline and reported zero package downloads. The user separately authorized the Electron 35.7.5 headers host for native ABI compilation. In the successful dependency/materialization pass, the upstream lockfile and tracked source had no `fs-ext` dependency/use while the old 0.9.1 built runtime carried an undeclared `fs-ext@2.1.1`; the current script's unconditional preflight was therefore stale for the synced upstream closure. No installer stage has started.
- Runtime retry outcome (2026-10-11): the first packaging copy failed at `scripts/copy-runtime-stage.mjs` while `fs.cpSync` attempted to create the `benchmarks/node_modules/@deepseek-ai/cordis` workspace link (`EPERM`). A local link-creation probe confirmed this Windows environment cannot create a directory link. TDD RED then failed because the copied fixture retained `benchmarks/node_modules`; GREEN passed after the copy filter excluded only that benchmark dependency subtree. The next full offline runtime retry succeeded: 1,477 packages from the warmed store, zero package downloads, 338 workspace packages materialized, runtime closure clean, `@electron/rebuild` found no native modules and skipped the absent optional `fs-ext`, 336 workspace packages copied to the 2.0 GB runtime payload, and Tesseract copied. Verification passed for NSIS hooks, 323 vendor package bundle hashes, runtime manifest, runtime closure, and Electron ABI (14/26 load; 12 foreign-platform/non-ABI warnings). No installer/electron-builder stage has started; no Electron headers were downloaded because the synced closure had no native modules.
- Runtime work-unit commit: `652a6a6df3308cc0e7e1cedbb819c32eec8c2a99` (`fix(build): package synced runtime without benchmark links`); FreeCode runtime outputs are generated/ignored, not source deliverables. Installer artifacts remain pending the user's pre-build go-ahead.

## Progress and next step

Root cause is fixed by the imported native startup-info flags, and both creation routes are protected by a proven Red-Green regression test. The local work-unit commit is `109a14ec22f44a6fc26162eb8f34a83255f63f57`; version metadata and vendor patch hashes for `0.9.2` are in `e55f3248c3c5d9196e610cbc3ccde2b070652445`. Runtime/native build hardening is committed locally as `652a6a6df3308cc0e7e1cedbb819c32eec8c2a99`. No merge is active, no unmerged paths remain, and all 20 fork patches apply idempotently through the direct local Node runner. Root `pnpm build` and upstream Host/Client/Web builds passed. The final offline runtime build succeeded with the correct `I:\.pnpm-store\v11` store and zero downloads, copied the runtime closure/Tesseract, and generated approximately 2.0 GB under `apps/shell/resources/freecode`; closure, manifest, vendor-bundle freshness (323 packages), NSIS hooks, and native ABI checks passed. The native rebuild helper treats `fs-ext` as optional in sync with upstream `0.2.1-alpha.1`, with its explicit rebuild/load ABI probe retained when the package exists. A second TDD regression check now excludes only `benchmarks/node_modules` from the runtime copy to avoid symlink-privilege failures. The user was notified and explicitly authorized electron-builder on 2026-10-11; begin the installer/portable/runtime archive generation locally, then stop before install/tag/release and return artifacts for the user's manual check. No user process has been killed. Graphify freshness is unconfirmed (`uv trampoline failed to canonicalize script path`), the Engram mirror is pending due missing authoritative runtime identity. Leave installation/tag/release to the user.

## Relevant files

- `vendor/deepseek-harness/packages/subprocess/win32-process/src/process.ts` - native Win32 process startup flags.
- `vendor/deepseek-harness/packages/subprocess/win32-process/tests/ordinary-process.spec.ts` - ordinary `CreateProcessW` hidden-window assertions.
- `vendor/deepseek-harness/packages/subprocess/win32-process/tests/process.spec.ts` - restricted-token `CreateProcessAsUserW` hidden-window assertions.
- `patches/upstream/` - ordered fork-owned overlays and their manifest.
- `docs/UPSTREAM-SYNC.md` and `docs/UPSTREAM-PATCHING.md` - local sync and replay policy.
