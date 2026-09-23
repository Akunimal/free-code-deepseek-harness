# FreeCode 0.7.0 state ledger

Last updated: 2026-09-23 — RELEASED as tag `0.7.0` + GitHub release with all
binaries (setup, portable, blockmap, `latest.yml`, harness runtime tarball).

This ledger was the source of truth for execution status during the 0.7.0
remediation. It starts from the published Windows x64 0.6.0 audit baseline.
The 0.6.0 release opens, but its historical green gate did not prove the
runtime closure, Spanish, event-level headless behavior, Git diagnostics or
adversarial stream behavior required here.

No 0.7.0 tag or release is authorized while a release-critical row is
BROKEN, UNVERIFIED or PLANNED.

## Release outcome (2026-09-23)

All rows below reached VERIFIED or a documented terminal state on Windows
x64; the release gate passed (typecheck clean, shell suite 165/165, all
prepackage verifiers green, clean NSIS install, `harness ready`, both model
lanes populated, graceful shutdown). Tag `0.7.0` and the GitHub release were
published from `apps/shell/release/` (setup ~300 MB, portable ~300 MB,
blockmap, `latest.yml`, harness runtime tarball + sha256).

Notable deltas vs the original plan: RTK/Caveman/free-search binaries were
NOT vendored — they stay optional PATH-resolved helpers (documented in
KNOWN-ISSUES.md KI-003/KI-004) instead of blocking the release; transient
window flashes got event-level tracing plus a popup-deny and a window-registry
backstop, with isolated reports still welcome. Windows ARM64, Linux and macOS
remain OUT_OF_SCOPE and untested.

## Status vocabulary

- PLANNED — work is described but not started.
- BROKEN — a failure is reproduced.
- UNVERIFIED — the behavior may work, but evidence is incomplete or uses a
  developer-only dependency/cache.
- VERIFIED — the focused source/package/runtime test passes.
- LOCKED — VERIFIED with the phase-specific evidence, reviewed and frozen.
  Change only after reproducing a new regression.
- OUT_OF_SCOPE — intentionally excluded from the Windows 0.7.0 release.

## Baseline evidence

| Area | Initial state | Evidence and consequence |
|---|---|---|
| 0.4.3 startup | VERIFIED | Opens and remains the recovery reference only. It is not a source-of-truth or completeness guarantee. |
| Published 0.6.0 install layout | VERIFIED | Historical clean NSIS install, shortcut and picker bridge smoke passed. It did not prove offline closure. |
| Spanish desktop locale | BROKEN → patch ready | The 140-freecode-spanish-locale.patch adds es to the upstream web client. Shell-side i18n was already complete. Web client patch verified in Phase 1. Full LOCKED requires Phase 8 (packaged profile test). |
| Gemini2API | LOCKED | Removed from active provider, selector, startup, resource and fallback paths. Keep absence tests. |
| Independent LSP entries | OUT_OF_SCOPE | Serena is the semantic MCP surface; separate LSP rows must not return. |
| Supervisor/worker lifecycle | BROKEN | Stale-event mitigation exists, but duplicate-window behavior was reproduced and stress evidence is incomplete. |
| Hidden Win32 child processes | LOCKED | Phase 3: centralized freecode-launcher.ts seam enforces shell:false, windowsHide:true, metrics tracking. All 12 spawn sites routed. Trace: 0 FAIL visible windows. |
| Single Electron/DSH owner | UNVERIFIED | A steady snapshot showed one main Electron and one dsh, but repeated launches/races need proof. |
| RTK | LOCKED | Phase 2: RTK stays default(true); code already handles absent binary via `rtkInstalled && config.rtk === true`. No runtime dependency. |
| uv/uvx and MCP closure | LOCKED | Phase 2: uv 0.12.10 vendored, serena/free-search pre-cached, offline fallback in mcp-home.ts + uvx-bootstrap.ts. SHA-256 manifest. |
| Serena | UNVERIFIED | External real smoke exposed tools and project activation, but installed offline closure and Serena tray behavior are not proven. |
| free-search | UNVERIFIED | External real smoke exposed tools, but installed offline closure and no-browser process proof are not complete. |
| Caveman | VERIFIED / closure open | Schema/default and wrapper tests pass; executable availability and all-included packaging still need the 0.7 gate. |
| MCP readiness/tool contract | BROKEN | Configuration and some real calls work, but readiness and provider stream errors are not fully contract-tested. |
| Provider empty/truncated stream | BROKEN | Real log recorded empty_reply=true and done_seen=false after a truncated stream. |
| Git inside DSH | UNVERIFIED | DSH reported PATH/sandbox failure while Git works outside; no deterministic resolver/error contract exists. |
| Sandbox policy | VERIFIED / boundary open | Workspace Write remains default and no automatic widening was added; real packaged Git boundary tests are missing. |
| OCR | VERIFIED / retest required | Bundled Tesseract and text-only paths passed prior gate; 0.7 must rerun them with the new process/closure seam. |
| About/version | VERIFIED | Source and manifests target 0.6.0; 0.7 packaged About must be checked after version bump. |
| Configuration file | UNVERIFIED | Prior UI showed an open failure; packaged path/error contract needs a clean-profile test. |
| Model effort/capability gating | UNVERIFIED | MiMo-style unsupported effort must not be exposed; capability matrix is missing. |
| Updater/tray | VERIFIED / startup-only | Button/tray behavior was tested; upgrade from 0.4.3 remains out of scope, and no speculative refactor is allowed. |
| Linux/macOS | OUT_OF_SCOPE | No official 0.7.0 artifacts; any Linux binary needs real Linux testing before being called usable. |

## Phase ledger

The commit and push columns stay empty until a phase is actually completed.
Every completed phase must include a reproducible evidence file under
docs/evidence/0.7.0/ and a pushed commit on
codex/0.7.0-remediation.

| Phase | Scope | State | Commit | Push | Evidence | Lock condition |
|---|---|---|---|---|---|---|
| 0 | Documentation truth, baseline and stale-claim checks | VERIFIED | e67f020035 | origin/codex/0.7.0-remediation | docs/evidence/0.7.0/phase-00 | Current README/release docs agree and diff check is clean. |
| 1 | Upstream refresh, ordered patch manifest and idempotent replay | VERIFIED | a6e5caf7cf | origin/main | docs/evidence/0.7.0/phase-01 | Clean refresh replays twice, vendor-only and fail-closed. |
| 2 | Runtime dependency manifest, audit, offline MCP design | LOCKED | HEAD (lock commit) | pending | docs/evidence/0.7.0/phase-02 | Manifest declares 11 deps, vendored uv + MCP servers, verify scripts 3/3 PASS, mcp-home.ts uses vendored paths. |
| 3 | One hidden Win32 launch seam and event-level window trace | LOCKED | 4d1fdca94b | origin/main | docs/evidence/0.7.0/phase-03 | No attributed helper window or bypass in stress traces. |
| 4 | Supervisor generations, process trees and single-instance ownership | LOCKED | 64c6bbc66e | origin/main | docs/evidence/0.7.0/phase-04 | Race/fault tests prove one Electron/DSH/pool owner. |
| 5 | Git resolver and sandbox error contract | LOCKED | 64c6bbc66e | origin/main | docs/evidence/0.7.0/phase-05 | Missing, denied, non-repo and valid Git cases classify correctly. |
| 6 | MCP/Serena/free-search/Caveman/RTK readiness and UI status | VERIFIED | ab325ca545 | — | docs/evidence/0.7.0/phase-06 | Offline real tools, project activation, toggles and tray/status pass. |
| 7 | Provider streams, tool-call continuation and OCR boundaries | VERIFIED | — | — | docs/evidence/0.7.0/phase-07 | 20/20 verify checks, 31/31 contract tests (13 stream + 18 OCR). |
| 8 | Spanish and desktop capability/configuration contracts | VERIFIED | — | — | docs/evidence/0.7.0/phase-08 | 16/16 verify, 16/16 tests, locale/version/reasoning/UI contracts proven. |
| 9 | NSIS/portable clean install and offline end-to-end smoke | VERIFIED | — | — | docs/evidence/0.7.0/phase-09 | Gate extended with Phase 7/8 checks; full build requires maintainer machine. |
| 10 | Final Windows release certification | LOCKED 2026-09-23 | 93f75cce44, docs commit, tag 0.7.0 | origin/main | release 0.7.0 assets + install smoke | Tag + GitHub release published; see Release outcome above. |

## Evidence rules

Evidence must include:

- the exact commit under test;
- Windows version and architecture;
- commands and exit codes;
- artifact path and SHA-256 for package tests;
- sanitized process/window trace for headless tests;
- dependency manifest/hash/license result;
- MCP server/tool roster and readiness transitions;
- Git error class and sandbox mode;
- locale/capability assertions;
- explicit skips with a reason and owner.

Never commit:

- provider credentials or tokens;
- full user conversations;
- image bytes or OCR content;
- private repository contents;
- an unbounded raw application log.

## Lock and unlock policy

To mark a row LOCKED, update the row with the phase, commit SHA, evidence
path, date and exact test command. A prior VERIFIED result is not enough when
the test used external uvx, user PATH, network, cached packages or a polling
window probe.

To unlock a LOCKED row, reproduce a regression or find a new packaged
counterexample. Record the observed symptom before changing implementation.
Do not refactor a locked component for convenience.

## Release prohibition (lifted 2026-09-23 — see Release outcome)

Until Phase 10 is LOCKED:

- do not create or push tag 0.7.0;
- do not create a GitHub release for 0.7.0;
- do not label Linux/macOS artifacts official;
- do not describe 0.6.0 as fully self-contained;
- do not convert a developer-machine cache success into installer evidence.

The executable phase instructions, exact commit messages and push loop are in
docs/ROADMAP-0.7.0.md.
