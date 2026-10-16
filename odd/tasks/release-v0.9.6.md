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

## Relevant files

- `package.json`, `apps/shell/package.json` — desktop source version.
- `scripts/release-version-docs.test.mjs` — active/historical release contracts.
- `README.md`, `README.es.md`, `docs/RELEASE*`, `docs/ROADMAP.md`,
  `docs/KNOWN-ISSUES.md`, `CHANGELOG.md`, `release-notes-v0.9.6.md` — release docs.
- `odd/tasks/headless-desktop-containment.md` — prior native fix and local test.
- `apps/shell/release/` — immutable alpha9 archive/checksum (ignored binaries).
- `apps/shell/release-0.9.6-final-20261016/` — new final output, not older setup.
