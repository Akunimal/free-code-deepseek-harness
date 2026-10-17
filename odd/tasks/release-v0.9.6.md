# Release v0.9.6

## Objective, problem and authorization

Publish the user-tested Windows desktop containment and harness audit fixes as a
new v0.9.6 release, not as replacement v0.9.5 binaries. An unchanged version
would not update existing installations and its tag would identify older source.
The user explicitly confirmed the proposed complete scope: push to `main`, tag
and public release `v0.9.6` in `Akunimal/free-code-deepseek-harness`, using the
current `gh` session, with setup, portable, immutable DSH alpha9 and EN/ES docs.

The installed local headless candidate was confirmed working by the user.
Do not inspect, stop, restart, install over or launch that application. All gate
profiles, caches and child processes must be isolated and test-owned. Do not
change upstream, rewrite published tags or overwrite old desktop artifacts.

## Workflow and delivery

- Direct inline ODD; no delegation or secondary LLMs.
- TDD: red-green-refactor, from the user's explicit session choice. Release
  documentation contracts use `node --test`; workspace checks use pnpm/Vitest.
  Assembly/publication use real artifact and public bootstrap checks, not mocks.
- Branch: `codex/v0.9.5-clean-runtime-bootstrap`; `origin/main` is an ancestor.
- Delivery: reuse the authorized auto-chain / stacked-to-main strategy. Forecast
  approximately 900 authored additions/deletions for coherent release/docs work;
  generated outputs excluded. Work-unit commits precede the authorized main push.
- Preserve unrelated Graphify changes and untracked investigation files. Stage
  only explicit release files; no bulk add, clean or reset.

## Acceptance and mandatory checks

- Root/shell version 0.9.6; runtime pin remains immutable `0.2.1-alpha.9`.
- Bilingual READMEs, active release guides and notes agree; historical releases
  retain their actual hashes/status. No clean-install or publication claim before
  observed evidence. Final asset names, sizes and SHA-256 are recorded in EN/ES.
- Publish the new alpha9 archive/checksum as dependency assets on existing
  v0.9.5 without clobbering any existing asset, then pass the full `pnpm
  release:gate`, including the production public empty-cache first-run smoke.
  No desktop v0.9.6 release if that smoke fails. Reuse the verified runtime stage;
  do not reinstall dependencies or regenerate the immutable archive.
- Build fresh 0.9.6 NSIS + portable with publishing disabled. Execute exact
  staged/packaged native adversarial containment and Job-lifetime tests and GUI
  broker compatibility checks; verify PE, updater metadata, blockmap and hashes.
- Refresh Graphify after final documentation/source edits. Report warnings or
  failures, all skipped/pending checks, and signature/platform limitations.
- Push fast-forward main and tag the exact source commit. Verify remote main,
  tag, public release asset names/sizes/digests and final release URL. Do not
  rewrite old tags or treat a locally preloaded cache as public first-run proof.

## Tasks

- [x] REL096-1: Reconcile the successful HDC-5 test receipt, add observed RED
  release contracts, align version and active EN/ES documentation, pass GREEN,
  and commit the coherent source/documentation unit.
- [ ] REL096-2: Verify/upload the immutable public alpha9 dependency assets;
  run the entire isolated release gate and record actual clean-cache proof.
- [ ] REL096-3: Build and verify fresh final setup + portable, record exact
  hashes/limits in bilingual notes, complete applicable checks and Graphify,
  and commit final release evidence.
- [ ] REL096-4: Push the authorized commits to main, create v0.9.6 tag and public
  release with final binaries/metadata, verify remote identities and digests,
  and record publication evidence in a closing work-unit commit.

## Progress and recovery

### Resume point — 2026-10-16

**Continue this feature from this file; do not restart from the conversation.**
Current branch: `codex/v0.9.5-clean-runtime-bootstrap`; latest committed work:
`b75e44a7ab` (`test(release): isolate registry contracts from ignored developer caches`).
The local version/docs commit is `8cf2539e56`; release-policy correction is
`e2ade64bcd`.

The second full mandatory release gate is still running in the existing
test-owned hidden session **30697** (last checked live; do not start a competing
gate). Its runner/log are `D:/Temp/freecode-v0.9.6-gate-2026-10-16T22-26-51-081Z.json`
and `.log`. Last observed progress: workspace Vitest suite, including DSH
supervisor lifecycle cycles and Tor integration, after the exact helper passed
the native adversarial containment smoke. No gate receipt/final result yet.
First action in the next session: inspect this log/receipt for completion and
whether the run is still active. Only a receipt with exit code 0 and the real
`first-run-runtime-download: PASS` closes the gate; failure must be diagnosed
and the **entire** gate rerun. The first attempt failed at workspace tests and
is preserved in the earlier progress below. Never claim a clean-install pass
from it.

Public immutable alpha9 archive + checksum are now attached to v0.9.5; GitHub
API reports the archive digest matches local SHA-256. No v0.9.6 desktop release,
tag or push has occurred. Continue REL096-2, then build fresh 0.9.6 setup and
portable only after the full gate passes. Do not launch an installer or touch
the user's active FreeCode instance. Existing artifact build/evidence helper:
`D:/Temp/freecode-release096-final-proof.mjs`; isolated runner:
`D:/Temp/freecode-release096-run.cjs`.

- Read the actual headless feature file and reconciled current user acceptance:
  HDC-5 work-unit commit is `91e0267d17`; the user subsequently confirmed it works.
- Authorized current-session fetch confirms origin is the named HTTPS fork;
  main is behind this feature branch by 16 local audit/containment commits.
- Authorized release inventory found no public alpha9 asset on any release;
  v0.9.6 tag/release was absent. Existing v0.9.5 desktop assets remain untouched.
- Canonical alpha9: 421,541,194 bytes, SHA-256
  `7c1d8cb1b53e2a88a7549941afacf423a1345353b9c3aa6fd53d95d3f49c4ca5`.
- Initial tooling reads using `rtk proxy Get-Content` failed because a PowerShell
  cmdlet is not an executable; corrected to an explicit PowerShell/Node reader.
  The old external Graphify skill path is absent; deterministic Graphify MCP
  graph query is available and was used before reading source. No gate failed
  or was waived by those read-only tooling errors.
- REL096-1 RED observed: package version was 0.9.5 and v0.9.6 notes were absent;
  the expanded active-document checks also rejected the old version/pin/output.
  Historical test regexes initially needed their original case-insensitive flag;
  corrected the assertions, not the immutable historical notes.
- REL096-1 GREEN: all 10 release-version/documentation tests passed. Root/shell
  now agree on 0.9.6; active EN/ES docs identify alpha9, native containment and
  the real public bootstrap requirement. Candidate banners explicitly keep
  clean-cache proof and final artifact checks pending. Historical release notes
  are unchanged. `git diff --check` passed (only pre-existing Graphify CRLF
  normalization warnings). Lockfile importers have no package-version field and
  no dependency changed, so no install or lockfile rewrite is needed.
- Documentation preparation had one temporary-script quoting syntax error
  before executing any writes; corrected and read back the resulting files.
- Next: commit this source/docs unit, then publish only new alpha9 dependency
  assets and execute the full mandatory isolated gate.
- REL096-1 work-unit commit: `8cf2539e56`, 1,250 authored additions/deletions
  including the new task and notes; no generated artifacts. The documented
  auto-chain / stacked-to-main choice remains effective above the heuristic.
  The higher count is the coherent bilingual active-document alignment plus
  replacement of obsolete version-specific assertions with current/historical
  contracts, not product scope growth. Historical notes/hashes are unchanged.
- REL096-2 dependency upload completed with the authorized `gh` session:
  alpha9 tarball and its 122-byte checksum were appended to public v0.9.5,
  without `--clobber`. GitHub's asset digest matches the local archive exactly;
  checksum-asset SHA-256 is
  `901db23e59131e3a9bd8c005787b2621d89df812d92737650370d996c7db8a07`.
- The first full gate detected a documentation regression in the existing
  release contract: the rewritten policy prefix had lost its explicit
  "Releases are manual" declaration. Restored it in both languages without
  changing the contract or any runtime behavior. Publication stays blocked;
  run the full gate again after this failed attempt finishes.
- First full gate exited 1 at `workspace-tests`: 117 contract tests passed,
  two failed and 12 pre-existing opt-in tests were skipped. The second failure
  required a developer's ignored `.atl/skill-registry.md` to contain a particular
  generator header. That cache is not a tracked release input and had a different
  legitimate generator; do not forge its provenance or overwrite it. Expand this
  task's test-maintenance scope to use test-owned temporary registry fixtures,
  retain byte/mtime non-mutation assertions, and add missing-file coverage. No
  product/runtime behavior or gate requirement changes. Corrective policy unit:
  `e2ade64bcd`; the failed gate transcript/receipt are under
  `D:/Temp/freecode-v0.9.6-gate-2026-10-16T22-22-15-733Z.*`.
- Registry/policy focused GREEN: 2 files / 18 tests passed, including exact
  registry bytes/mtime preservation and missing-file non-creation. The developer's
  ignored registry was not changed. Repeat the entire gate, not just these tests.
- Second full gate `D:/Temp/freecode-v0.9.6-gate-2026-10-16T22-26-51-081Z.*`
  finished with exit 1 at 22:30:03Z. All 54 other workspace files passed (381
  tests). `tests/native-abi-verifier.test.ts` failed at collection: its top-level
  probe, `electron.exe` with `ELECTRON_RUN_AS_NODE=1`, printed libuv
  `PostQueuedCompletionStatus: (6)` (invalid handle) and exited non-zero. Gate
  stopped before the public first-run smoke; no clean-install claim.
- Diagnosis: not reproducible. The same file passed standalone, through
  `headless-host.exe`, and in a full `apps/shell` vitest run via the helper
  (55 files / 384 tests, `D:/Temp/abi-diagnose-workspace-193513.log`). No source
  or test change made. Treated as a transient native-process startup failure in
  the gate chain; the rerun below decides it. If it recurs, add probe diagnostics
  (`error`, `signal`, handle/env state) before any retry logic.
- Third full gate started 22:36:29Z with the same isolated runner:
  `D:/Temp/freecode-v0.9.6-gate-2026-10-16T22-36-29-517Z.{log,json}`.
  Result: exit 1 at 22:45:02Z. `workspace-tests` passed (55 files / 384 tests),
  so the native ABI flake did not recur. `workspace-contract-tests`,
  typechecks, vendor regressions, stream/locale/offline-MCP contracts passed.
  Stopped at `windows-acl-tests`: 15 of 19 in
  `vendor/deepseek-harness/packages/sandbox/sandbox-windows-acl/tests/runner.spec.ts`
  failed. The plan step also names `failure-paths.spec.ts`, which does not exist,
  so vitest ran only `runner.spec.ts`.
- windows-acl diagnosis (not yet fixed; both causes reproduced):
  1. Fixture defect: specs spawn the literal `pwsh`, which is absent here
     (only Windows PowerShell 5.1). Availability probe `resolvePwshPath()` falls
     back to 5.1, so the suite is not skipped. Result: `CreateProcessAsUserW`
     Win32 2, exit 127.
  2. Containment-context defect: with `pwsh` replaced by the resolved 5.1 path
     (temporary spec, removed), all 14 remaining failures are exit
     `0xC0000142` (STATUS_DLL_INIT_FAILED) with empty stderr when run inside
     `headless-host.exe`. The same spec passes 19/19 outside the helper. The
     helper creates its private desktop with a NULL security descriptor
     (`apps/shell/native/headless-host/main_windows.go`) and sets it as child
     `StartupInfo.Desktop`, so Low-integrity confined children cannot initialise
     USER32. The gate runner wraps everything in the helper by design
     (`D:/Temp/freecode-release096-run.cjs`).
  Fixing cause 1 in `vendor/` may change the immutable runtime source fingerprint
  (`0.2.1-alpha.9` pin), so it needs an explicit decision. Cause 2 is a
  containment decision (desktop DACL for restricted SIDs versus excluding this
  step from the helper wrapper) and needs review. No gate was rerun after the
  failure and no source was changed in this pass.
- Follow-up (same day, after the user chose "ajustar DACL"): the security-
  descriptor attempt was reverted because it changed nothing. The private
  desktop got SDDL `D:(A;;GA;;;SY)(A;;GA;;;OW)(A;;0x000000c7;;;<logon SID>)`,
  with a Go unit test (GREEN). Under the rebuilt helper, the 14 node/pwsh
  confined children still exit `0xC0000142`, the same as before. The same
  confined `node -e 0` exits 0 outside the helper. Dropping `CREATE_NO_WINDOW`
  (0x08000000) from the helper's `CreateProcess` flags also did not fix it.
  Attempt patch: `D:/Temp/headless-desktop-dacl-attempt.patch`. Native
  sources are back to HEAD and the helper was rebuilt from HEAD.
  Still open at that point: the failing component is inside the helper's
  containment chain. No gate has been relaunched since gate 3.
- BISECT RESULT (diagnostic copies only in `D:/Temp/helper-bisect/variants/`,
  repo and resources untouched; spawn harness = vitest `spawnSync`, not a
  direct shell run):
  - baseline HEAD helper: confined `node -e 0` = `0xC0000142`; confined `cmd /c exit 0` = 0.
  - no AssignProcessToJobObject: node still fails. Job is not the cause.
  - no inherited stdio (no USESTDHANDLES, bInheritHandles=false): node still fails. Stdio is not the cause.
  - child on the interactive desktop (no private desktop): node = 0. The private desktop is required to reproduce.
  - node.exe imports user32.dll (GetProcessWindowStation, GetUserObjectInformationW, GetMessageA, ...); cmd.exe does not. USER32 init in a Low-integrity WRITE_RESTRICTED child fails on the private desktop.
  - logon-SID DACL alone (0xc7 or GA), or Everyone 0xc7, without a label: still fails. DACL is not sufficient.
  - Low mandatory label alone (`S:(ML;;NW;;;LW)`), no logon ACE: still fails.
  - Low label + logon ACE GA: node = 0. Low label + logon ACE 0xc7: node = 0.
  - Low label + SY GA + logon 0xc7 (no OW ACE): node = 0. This is the minimal functional set.
  - Root cause: the private desktop keeps the default Medium integrity label. A Low-IL restricted child cannot write to it, so USER32 init fails. The desktop DACL also has to admit the restricting logon SID.
  - Validation of that variant: Go native tests PASS (6 integration tests; `TestWindowFixture` is a fixture and skips). `runner.spec.ts` = 19/19 with PowerShell resolved; under the real literal `pwsh` it is 9 of 10 failing with exit 127 (fixture issue only, still open).
  - Security review, not yet approved. The change lowers integrity isolation on the private desktop: Low-IL processes gain write-level rights (0xc7 for the logon session: read objects, create windows and menus, enumerate, write objects). Excluded: SWITCHDESKTOP, hook control, journal record/playback, WRITE_DAC/WRITE_OWNER, DELETE. The owner ACE is removed. Residual risk: same-session processes that learn the random 128-bit desktop name, or enumerate desktops on WinSta0, can create windows there. Not tested empirically. Alternatives considered: per-run restricting SID (needs coupling to sandbox SIDs), or keeping Medium and avoiding USER32 in children (not viable for node).
  - No repo change made. Gate not relaunched. Needs approval for (a) the label-based helper change and (b) the `pwsh` fixture decision.
- APPROVED by the user (label Low + logon ACE 0xc7, no owner ACE). Applied in
  `apps/shell/native/headless-host/main_windows.go` (not committed):
  - Private desktop SDDL: `D:(A;;GA;;;SY)(A;;0x000000c7;;;<logon SID>)S:(ML;;NW;;;LW)`. Logon SID is read from the helper's own token (SE_GROUP_LOGON_ID); the desktop is created fail-closed if it cannot be read.
  - RED: `TestPrivateDesktopDACLGrantsLogonSessionOnlyDesktopRightsAtLowIntegrity` failed on the assertion (old SDDL had `OW` and no label). GREEN after the change.
  - Go tests (`go test -v`, full): PASS for containment-fails-closed, Job teardown, watchdog scope, private desktop root/descendant, stdio/argv/env, and the window-fixture test skips by design.
  - Helper rebuilt with `scripts/build-headless-host.mjs`; `headless-host.json` source `3a7f7852...`.
  - `runner.spec.ts` under the real helper: 9 passed, 10 failed, 0 × `0xC0000142`. All 10 failures are the literal `pwsh` fixture issue (9 × exit 127, 1 × null).
  - `scripts/headless-containment-gate.test.mjs` and `scripts/build-headless-host.test.mjs` pass (exit 0). `scripts/verify-headless-desktop.mjs` PASS.
  - Residual risk accepted per approval: same-logon-session Low-IL processes that learn the desktop name can create windows and write objects there. Not tested empirically.
  - `pwsh` fix chosen by the user's instruction (option B): `runner.spec.ts` now spawns `resolvePwshPath()`, the same resolution the probe and the executor use. Under the real helper: 19/19 PASS, 0 × `0xC0000142`.
  - Gate plan correction: `windows-acl-tests` named `failure-paths.spec.ts`, which does not exist, so vitest silently ran only `runner.spec.ts`. It now names the four real `*-failure-paths.spec.ts` (103 tests PASS under the helper).
  - Runtime pin check: `apps/shell/harness-runtime.json` (`0.2.1-alpha.9`) unchanged. `scripts/verify-pinned-runtime-asset.mjs` verifies SHA-256 `7c1d8cb1…c4ca5` against the manifest; archive untouched. The vendor spec is a test file, not part of the runtime archive.
  - Contract tests of gate step 1 (`release-gate-contract-tests`): 62/62 PASS.
  - Commits on `codex/v0.9.5-clean-runtime-bootstrap`: `debe96c0a4` (native private desktop integrity fix + Go test + docs), `00a95a868e` (vendor runner.spec on resolved pwsh), `3c8617a74b` (gate plan failure-path specs).
  - Gate 4 (`D:/Temp/freecode-v0.9.6-gate-2026-10-16T23-37-50-906Z.*`) exit 1 at `workspace-tests`: 4 `contract.test.ts` cases timed out. Diagnosed as transient: the same file PASS 5/5 under the helper afterwards (23 s), and `dsh web --help` was 3-4 s on repeat runs. No code change.
  - Gate 5 (`D:/Temp/freecode-v0.9.6-gate-2026-10-16T23-48-25-335Z.*`) exit 0 on `08b9731b0c`. Includes ACL 122/122, workspace 384/384, contracts, packaging and `first-run-runtime-download: PASS` (public empty cache, hidden CLI exit 0).
  - Final build attempt 1 (`D:/Temp/freecode-v0.9.6-build-2026-10-17T00-16-11-149Z.*`) exit 1 in `prepackage:verify` at `verify-conversation-render` (one canvas 0 px). Standalone it passed 3/3 under the helper (26 s). Retry (`D:/Temp/freecode-v0.9.6-build-2026-10-17T00-19-45-642Z.*`) exit 0.
  - Final artifacts in `apps/shell/release-0.9.6-final-20261016/` (publishing disabled, `--publish never`): setup 179,612,122 B, portable 179,236,984 B, blockmap 190,053 B, `latest.yml` 395 B. SHA-256 and sizes are in [release-notes-v0.9.6.md](release-notes-v0.9.6.md).
  - Packaged helper SHA-256 `2906380678…` = staged helper. Native containment and Job-lifetime tests pass against the packaged file. NSIS static output verified.
  - Docs updated from "pending" to verified: release notes, README(.es), docs/RELEASE(.es), CHANGELOG.
  - Next: Graphify refresh (report only, do not stage pre-existing `graphify-out` changes), commit evidence, push `main`, tag `v0.9.6`, public release, then a closing commit with publication evidence.

## Relevant files

- `package.json`, `apps/shell/package.json` — desktop source version.
- `scripts/release-version-docs.test.mjs` — active/historical release contracts.
- `README.md`, `README.es.md`, `docs/RELEASE*`, `docs/ROADMAP.md`,
  `docs/KNOWN-ISSUES.md`, `CHANGELOG.md`, `release-notes-v0.9.6.md` — release docs.
- `odd/tasks/headless-desktop-containment.md` — prior native fix and local test.
- `apps/shell/release/` — immutable alpha9 archive/checksum (ignored binaries).
- `apps/shell/release-0.9.6-final-20261016/` — new final output, not older setup.
