# FreeCode 0.7.0 aggressive remediation roadmap

> COMPLETED 2026-09-23 — released as tag `0.7.0` + GitHub release with all
> binaries. This document is frozen as the execution contract that was
> followed; final status lives in [STATE-0.7.0.md](STATE-0.7.0.md).

Last updated: 2026-09-10

This is the execution contract for the next Windows x64 release. It is
written so that Mimo 2.5 or another coding agent can execute one phase at a
time, prove the result, commit it and push it without guessing what “fixed”
means.

The current published 0.6.0 release is the audit baseline. It opens and its
historical release gate passed, but that gate did not prove a complete runtime
closure, Spanish, event-level headless behavior, Git diagnostics or
adversarial provider streams. Version 0.4.3 is only the last known-good
operational recovery reference because it opens; it is not the source of truth
for this worktree and may lack current fixes.

## Non-negotiable scope

- Official release target: Windows x64 only.
- Linux and macOS are contributor/manual targets. Existing Linux artifacts
  require real Linux testing before anyone calls them usable; they are not
  0.7.0 release assets.
- Builds are local. Do not add or rely on a GitHub Actions release workflow.
- Do not require an upgrade from 0.4.3. The release gate is clean install,
  shortcut launch, first-run readiness and clean relaunch.
- Do not silently overwrite or retag 0.6.0. A 0.7.0 tag/release is forbidden
  until the final gate passes.
- Gemini2API remains removed. Independent LSP entries remain out of scope;
  Serena is the semantic MCP surface.
- All declared runtime dependencies must be present in the installed closure,
  or the declaration must be removed. “It downloads on the developer machine”
  is not evidence.
- No visible helper window is acceptable during normal operation. The only
  allowed visible windows are the main FreeCode window and a picker/browser
  explicitly requested by the user.
- A component is LOCKED only after the evidence required by this document is
  stored and reviewed. A green unit test alone never makes a component LOCKED.

## Evidence that drives this roadmap

The read-only findings are recorded in:

- docs/AUDIT-0.6.0-TEST-PLAN.md
- docs/STATE-0.6.0.md
- the published 0.6.0 runtime manifest and installed payload
- the worker log containing a truncated stream with done_seen=false and
  empty_reply=true
- the installed MCP configuration referencing external/bootstrap uvx
- the locale catalog that currently exposes zh/en but not es

Do not turn a claim in an older README, release note or state file into
evidence. Re-run the source and packaged tests.

## Execution protocol for every phase

### Branch and preservation rules

1. Start from a clean reviewable point. Do not use git reset --hard, git
   checkout --, broad deletion or a command that can erase user data.
2. Preserve existing user changes, including .serena. Never use git add -A.
   Stage only the explicit files belonging to the phase.
3. Use a dedicated branch:

       git switch -c codex/0.7.0-remediation
       git push -u origin codex/0.7.0-remediation

   If that branch already exists, inspect it and continue; never invent a
   different base without recording it in the state ledger.
4. At phase entry record:

       git status --short
       git diff --check
       git rev-parse HEAD
       git log -1 --oneline
       git tag --points-at HEAD

   Save the non-secret result under docs/evidence/0.7.0/. Do not save tokens,
   provider credentials, image data or full user logs.

### Required phase closeout

Every phase follows this exact loop:

1. Read the phase, its predecessor evidence and the current source.
2. Implement only the phase scope. If a new defect changes the order, update
   this roadmap/state file before coding further.
3. Run the phase tests on Windows PowerShell. Commands marked CREATE/UPDATE
   mean the implementation must add or extend that script before invoking it.
4. Run git diff --check and inspect the diff for unrelated changes.
5. Write a short evidence file with date, commit under test, commands, exit
   codes, artifact paths and the reason for every skip.
6. Update docs/STATE-0.7.0.md. Use VERIFIED only when the evidence is
   reproducible; use LOCKED only when the phase-specific lock criteria pass.
7. Stage explicit paths, commit with the exact phase message below, verify the
   commit, then push:

       git add <explicit phase paths>
       git commit -m "<phase commit message>"
       git show --stat --oneline HEAD
       git diff HEAD^ HEAD --check
       git push origin codex/0.7.0-remediation

8. Record the commit SHA, pushed ref and test evidence in the state ledger.
   A failed phase is not committed or pushed as complete. Fix it or leave the
   phase UNVERIFIED and report the blocker.

Never report “phase complete” with only a prose summary. The minimum report is:
phase number, commit SHA, pushed branch/ref, tests and exit codes, evidence
path, remaining risks and the next phase.

## Phase 0 — Freeze evidence, documentation and the release contract

Status at roadmap creation: local documentation work in progress; not yet
committed.

### Objective

Make the repository tell the truth before source changes begin. Align both
project README files, both current release guides, the 0.6 audit, the 0.7
state ledger and this roadmap. Keep the existing uncommitted user changes
visible and do not include .serena in a product commit.

### Required changes

- README.md and README.es.md must agree on:
  - 0.6.0 being a published Windows baseline;
  - 0.4.3 being recovery reference only;
  - Linux/macOS being untested manual targets;
  - missing RTK and external/bootstrap MCP closure in 0.6.0;
  - Spanish, windows, Git and stream issues still being gates;
  - upstream update then ordered patches;
  - the 0.7.0 roadmap/state links.
- docs/RELEASE.md and docs/RELEASE.es.md must no longer describe v0.2.2 as
  current or claim that 0.6.0 is fully self-contained.
- Add a stale-claim check that fails on current docs if they claim an absent
  executable is bundled, a polling probe proves zero windows, or an old
  version is current without an explicit historical label.
- Keep old release notes as historical documents; do not rewrite history.

### Tests and evidence

Run:

    git diff --check
    node --test scripts/mcp-config.test.mjs
    rg -n "v0\.2\.2|fully self-contained|RTK.*optional|0\.6\.0.*LOCKED" README.md README.es.md docs/RELEASE.md docs/RELEASE.es.md

The rg command is an inspection, not an automatic pass: every match must be
reviewed and either corrected or explicitly labeled historical.

### Lock criteria

Both current-language README files and both current release guides point to the
same 0.7 state/roadmap, contain no contradictory current claims, and
git diff --check is clean.

### Commit and push

Commit:

    docs(0.7.0): phase 0 align release docs and define gates

Push the phase branch and record the SHA in STATE-0.7.0.md.

## Phase 1 — Make upstream synchronization fail closed and modular

### Objective

Guarantee that future upstream updates can be applied as:

    freeze evidence
      -> fetch/update vendor/deepseek-harness
      -> replay ordered FreeCode patches
      -> verify upstream commit and patch manifest
      -> test/typecheck/build/package

No product feature may survive only as an untracked direct edit in
vendor/deepseek-harness.

### Required changes

- Audit scripts/update-upstream-local.mjs, scripts/apply-upstream-patches.mjs,
  patches/upstream/ and docs/UPSTREAM-PATCHING.md.
- Add a machine-readable patch manifest with patch order, owner, source seam,
  contract tests, expected upstream paths and whether a patch is vendor-only.
- Make the applier reject:
  - an unknown patch file;
  - a missing ordered patch;
  - a patch touching outside vendor/deepseek-harness;
  - a partial application;
  - a stale upstream commit without an explicit refresh record.
- Add an idempotence check: applying the same ordered stack twice produces the
  same tree and exits successfully.
- Add a replay check from a clean upstream snapshot. Do not solve a conflict
  by editing vendor directly and leaving the patch stack unchanged.
- Represent the Spanish fix, runtime dependency contract and any upstream UI
  seam as new focused patches or documented shell overlays.
- Keep FreeCode-owned MCP catalog, process launcher and packager modules
  outside the upstream subtree where possible.

### Tests and evidence

Run:

    pnpm apply:upstream-patches
    pnpm apply:upstream-patches
    pnpm test:contract
    pnpm typecheck
    node scripts/verify-upstream-patch-stack.mjs

The last script is CREATE if absent. It must emit the upstream commit, patch
order, changed-path policy, idempotence result and a non-secret diff summary.

### Lock criteria

An upstream refresh followed by two patch applications is deterministic,
vendor-scoped and fail-closed. The locale/packaging contracts fail when their
patch is omitted or no longer applies.

### Commit and push

    build(0.7.0): phase 1 make upstream patch replay fail closed

## Phase 2 — Close the Windows runtime dependency bundle

### Objective

Make the installed application work with a controlled empty external PATH and
with network access blocked. Package every executable and import-time dependency
that the product declares, including RTK, uv/uvx if retained, Serena,
free-search, Tesseract, the OpenCode worker and native helpers.

### Required changes

- Define one manifest schema containing for every payload item:
  name, version, architecture, source commit/archive, license, SHA-256,
  relative installed path, launch contract and whether it can access network.
- Package RTK at an absolute path under resources/freecode. Do not resolve it
  only from the user's PATH. Verify rtk --version, architecture, license and
  hash during build and installed smoke.
- Package Caveman's executable/runtime if the enabled setting depends on one,
  or remove the executable claim and make the setting explicitly unavailable.
  The default must never say active when the binary is absent.
- Choose one offline MCP design and document it:
  1. self-contained Windows server executables; or
  2. a vendored uv/Python environment with locked wheels/cache and absolute
     launch paths.
  A servers.json row containing uvx --from git+https://... is not an offline
  closure.
- Include every Serena/free-search import and helper required at runtime.
  Build-time network is allowed only before packaging; installed first run
  must not download a server.
- Reject USERPROFILE paths, mutable per-user uv caches, pip install, uv tool
  install and runtime git+https downloads in the packaged gate.
- Include a license inventory for RTK, uv/Python packages, MCP servers and
  bundled native tools.
- Keep Tesseract and the picker bridge checks in the same manifest.

### Tests and evidence

Create/update:

    node scripts/verify-runtime-dependencies.mjs
    node scripts/verify-offline-mcp.mjs

Run each against the staged runtime and installed NSIS/portable runtime:

    pnpm package:runtime
    node scripts/verify-runtime-dependencies.mjs --path <staged-runtime>
    node scripts/verify-offline-mcp.mjs --path <staged-runtime> --block-network

The test must run with PATH set to a temporary directory containing no Git,
rtk, uv, uvx, Python or Tesseract. It must prove that the managed MCP tools
initialize, list schemas and execute one safe real tool without downloading.

### Lock criteria

The manifest is complete, hashes/licenses match, RTK runs from the payload,
Serena/free-search run offline, no external uvx path appears in the installed
config, and the same results hold for both portable and NSIS installs.

### Commit and push

    build(0.7.0): phase 2 close Windows runtime dependency bundle

## Phase 3 — Centralize every hidden Win32 process launch

### Objective

Eliminate the root cause class behind one-second windows instead of adding
another isolated windowsHide flag. There must be one auditable Windows launch
seam for DSH, OpenCode workers, MCP servers, uv/uvx/Python, OCR, RTK and Git
diagnostics.

### Required changes

- Create or extend a FreeCode-owned Win32 process launcher. It must use argv
  without a shell, CREATE_NO_WINDOW, STARTF_USESHOWWINDOW/SW_HIDE and an
  explicit sanitized environment.
- Attach managed children to a Job Object so the root can enumerate and close
  the complete tree. Record root PID, parent PID, generation, requestId,
  executable identity and close reason.
- Route HarnessSupervisor, the worker pool, MCP transport, uv bootstrap,
  Serena/free-search, OCR, RTK and Git through the seam. No direct SDK spawn
  path may bypass it.
- Keep ConPTY only for a terminal the user explicitly requested to see.
  MCP, OCR, RTK, Git, workers and server helpers never use a PTY.
- Keep shell:false and windowsHide:true as defense in depth, not as the only
  guarantee.
- Remove cmd.exe, start, PowerShell interactive wrappers and terminal
  intermediaries from normal helper launch.
- Make failures return structured launch errors instead of opening a console
  to display diagnostics.

### Event-level diagnostic test

Update scripts/verify-installed-runtime.mjs or add
scripts/windows-window-trace.mjs. Polling MainWindowHandle every 75 ms is not
enough. The trace must:

1. enumerate Win32 windows with EnumWindows;
2. attribute each handle with GetWindowThreadProcessId, parent PID and root
   FreeCode PID;
3. record create/visible/destroy events or the smallest reliable event trace;
4. identify executable, class, title, PID and ancestor chain;
5. fail for a visible conhost, cmd, PowerShell, uv, Python, Tesseract, RTK,
   Git, MCP or worker window unless explicitly requested;
6. save a sanitized JSON trace for failed runs.

### Tests and evidence

Run:

    pnpm test
    pnpm test:contract
    node scripts/windows-window-trace.mjs --cycles 50 --fault-injection

Add unit/integration tests for each launch caller and a Windows-only test that
proves the trace does not confuse an unrelated external console with a child.

### Lock criteria

Fifty normal cycles, twenty DSH crash/exit races, twenty MCP failure/reconnect
cycles and twenty close-during-operation cycles show zero visible helper
windows, zero orphaned managed children and no bypassed launch seam. Keep the
trace artifacts and process-tree summary.

### Commit and push

    fix(0.7.0): phase 3 centralize hidden Win32 process launching

## Phase 4 — Serialize lifecycle and enforce one application/session owner

### Objective

Close the remaining supervisor race after the launch seam is correct:
restart/exit/stop must never create duplicate DSH roots, duplicate worker
pools or a second Electron instance.

### Required changes

- Audit apps/shell/src/main/harness-supervisor.ts,
  packages/opencode-adapter/src/pool.ts and apps/shell/src/main/index.ts.
- Keep a generation token on every spawn, exit, error, restart and stop event.
  Old-generation events must be no-ops.
- Ensure restart cancels every pending respawn timer/promise before spawning
  the replacement. There is one in-flight spawn per service.
- Await process-tree termination, not a fixed sleep. A timeout must produce a
  diagnostic and force a Job Object close.
- Use one Electron single-instance lock and route a second invocation to the
  existing instance or exit without creating a window.
- Bound boot retries. Five failures must show one actionable in-app failure,
  not five consoles and not an infinite respawn loop.
- Apply the same ownership model to MCP reconnect and OpenCode worker pools.

### Tests and evidence

Add/update:

    supervisor restart during exit
    stop with pending respawn
    five consecutive boot failures
    kill-tree completion
    second Electron invocation
    restart during MCP initialization

Run:

    pnpm test
    pnpm test:contract
    node scripts/windows-window-trace.mjs --cycles 50 --supervisor-races

The tests must assert maximum one live Electron owner, one DSH generation and
one pool generation per session, not only a final process count.

### Lock criteria

All race tests pass under fault injection, process trees close within the
bounded timeout, and the event trace contains no stale-generation spawn.

### Commit and push

    fix(0.7.0): phase 4 serialize lifecycle and single-instance ownership

## Phase 5 — Repair Git resolution and sandbox diagnostics

### Objective

Stop reporting every Git failure as a vague sandbox restriction. The packaged
runtime must know whether Git is absent, unresolved, denied by policy, outside
the workspace or actually failing.

### Required changes

- Implement a deterministic resolver used by the real tool environment:
  packaged Git if the product includes it, otherwise a validated system Git
  path. The policy must be explicit in the runtime manifest and release docs.
- Never claim Git is bundled if it is only found on the developer PATH.
- Before the first Git operation, validate:
  git --version
  git -C <canonical-project> rev-parse --show-toplevel
  git -C <canonical-project> status --porcelain
  git -C <canonical-project> diff --check
- Emit requestId, canonical cwd, resolved executable, version, sandbox mode,
  exit code, timeout and an error class without logging tokens or file content.
- Use distinct classes:
  executable-not-found, path-not-resolved, sandbox-denied,
  not-a-repository, git-failed and timeout.
- Ensure the UI/model receives the class and the next action. Do not widen
  sandbox permissions automatically.
- Test both Workspace Write and danger-full-access; the latter must not hide a
  bad resolver.

### Tests and evidence

Create/update scripts/git-runtime-contract.mjs and run it against:

- Git on PATH;
- Git only at a known absolute path;
- an empty PATH;
- a valid repository;
- a non-repository folder;
- a corrupt/inaccessible repository;
- a workspace write allowed case;
- an outside-workspace denied case;
- a packaged installed runtime.

Run the existing test suites plus the real installed contract. Preserve only
structured outcomes, not private repository contents.

### Lock criteria

Every fixture produces the expected class; a real installed DSH request can
run Git when policy allows it; sandbox denial is never mislabeled as missing
Git and missing Git is never mislabeled as sandbox denial.

### Commit and push

    fix(0.7.0): phase 5 diagnose Git and sandbox failures

## Phase 6 — Make MCP, Serena, free-search and Caveman real default contracts

### Objective

The UI must not say “ready” because a JSON row exists. Serena and free-search
must be available by default from the packaged closure, Serena must activate
the selected project, Caveman must be configurable and injected once, and no
independent LSP rows may reappear.

### Required changes

- Keep the managed catalog versioned and separate from upstream.
- On project selection, canonicalize the project path, start/attach Serena,
  call activate_project, then expose the project tool roster.
- Enforce readiness:

      spawn -> initialize -> tools/list -> schema validation
        -> registration -> one safe tool call

- Make activation and the first Serena call serialized per project. Switching
  projects invalidates the old activation and cannot leak its tools.
- Expose Settings → Plugins → MCP with enable/disable toggles, connection
  state, server path, registered tools, last error and exact config-file
  action. Preserve unrelated user config rows.
- Surface Serena's own tray integration/configuration when the packaged Serena
  runtime supports it. Do not confuse FreeCode's tray with Serena's tray.
- Keep free-search HTTP-first and do not open a browser for search. Browser
  opening is explicit.
- Keep Caveman enabled by default only when its executable/runtime passed the
  Phase 2 manifest test. Add a dedicated tab if the existing settings card
  cannot show active path, toggle, status and last error. Inject its preset
  once and persist enable/disable.
- Remove or reject independent LSP catalog entries.
- Classify every MCP call with requestId, server, tool, attempt, status,
  duration and bounded error. Retry only known transient failures and never
  repeat non-idempotent effects without a contract.
- RTK must not appear “active” merely because a PATH executable exists; use the
  packaged path and record whether it actually ran.

### Tests and evidence

Run:

    pnpm test:mcp
    pnpm test:mcp:real
    node scripts/verify-offline-mcp.mjs --block-network
    pnpm test
    pnpm test:contract

Add real assertions for Serena tools/list, activate_project, one safe tool,
free-search search/fetch, provider tool roster, Caveman default/toggle/
persistence and zero LSP rows. A failure after spawn must be visible and
bounded, not an infinite reconnect.

### Lock criteria

With empty PATH and blocked network, the installed app exposes real Serena and
free-search tools, activates a selected project, keeps the correct tool roster,
shows tray/status state and leaves no browser/helper window. Caveman and RTK
settings reflect actual executable availability.

### Commit and push

    fix(0.7.0): phase 6 harden MCP Serena Caveman and tool contracts

## Phase 7 — Harden provider streams, tool-call continuation and OCR

### Objective

Make the observed empty/truncated stream an impossible silent success and
preserve the already working OCR behavior under packaging and failure tests.

### Required changes

- Turn the observed fixture into a replay:

      HTTP 200 -> partial chunks -> no DONE -> empty text
      -> done_seen=false -> empty_reply=true

- Distinguish:
  - valid empty result containing a tool call;
  - invalid empty result with no tool call/content;
  - finish_reason=tool_calls requiring continuation;
  - finish_reason=stop with empty text;
  - recoverable network error;
  - HTTP success with incomplete protocol;
  - timeout and user cancellation.
- Never turn a missing completion marker into success.
- Bound retries, expose provider/tool error class to the model and UI, and
  preserve request correlation across continuation.
- Do not retry side-effecting tools without idempotency.
- Preserve image bytes for vision models.
- For text-only models, run bundled Tesseract for direct attachments and
  read_image. Reject missing binary, corrupt image, timeout, empty OCR and
  excessive output explicitly. Do not insert [image omitted...] silently.
- Keep OCR path validation, traversal protection, language/PSM allow-list,
  output limits, hash cache and redaction.

### Tests and evidence

Create/update:

    node scripts/stream-contract.mjs
    pnpm test
    pnpm test:contract

The fixture suite must cover all state transitions above, tool-call
continuation, bounded retry, cancellation and UI failure rendering. The OCR
suite must run with Tesseract present and absent, corrupt image, timeout,
empty output, excessive output, direct attachment, read_image, vision and
text-only model.

### Lock criteria

The exact observed log fixture fails visibly and deterministically; no empty
successful assistant response is produced; tool continuation works; OCR
packaging and all failure boundaries pass.

### Commit and push

    fix(0.7.0): phase 7 reject incomplete provider streams and bound OCR

## Phase 8 — Restore Spanish and lock desktop capability/UI contracts

### Objective

Restore the Spanish desktop locale as a modular, upstream-replayable change
and verify every UI contract that was reported during the audit without
refactoring verified behavior for style.

### Required changes

- Add a focused ordered upstream patch for Spanish:
  LOCALE_IDS zh/en/es, actual es dictionary, selector metadata, settings
  persistence, native menu/tray/preload exposure and packaged bundle content.
- Add a contract that fails if a future upstream sync silently reduces the
  catalog.
- About must equal app.getVersion() and the packaged binary must report 0.7.0.
- Hide reasoning effort controls for models that do not support them. MiMo's
  binary thinking option must not be mislabeled as generic effort.
- Configuration File must resolve a valid existing path or return one
  actionable error; it must not show a false success.
- Serena/MCP tab and Caveman tab/card must show actual status, toggle and
  errors.
- Keep Workspace Write as default and distinguish sandbox errors.
- Keep the update button visually identical to Send with a down arrow. Verify
  startup/every-six-hour checks and tray notifications during download/install,
  but do not make an upgrade from 0.4.3 part of the release gate.
- Keep the directory picker native bridge and recovery copy pointing to 0.4.3
  as the last stable reference in incomplete-install errors.

### Tests and evidence

Create/update:

    node scripts/verify-locale-contract.mjs
    pnpm test
    pnpm test:contract
    pnpm typecheck

Include source, renderer, settings persistence, native menu/tray, preload,
packaged bundle and clean-profile tests. Add a capability matrix fixture for
model supports-vision, supports-effort and supports-thinking.

### Lock criteria

Spanish survives upstream refresh/replay and appears in a clean packaged
profile; About/version, picker, configuration file, model controls, Caveman,
Serena, updater visual/tray and sandbox error contracts pass without altering
already verified unrelated behavior.

### Commit and push

    fix(0.7.0): phase 8 restore Spanish and lock desktop capability contracts

## Phase 9 — Clean install, portable and offline end-to-end gate

### Objective

Prove the artifact a user receives, not only the source tree or a developer
machine with cached tools.

### Required changes

- Build clean Windows x64 NSIS and portable artifacts from the phase branch.
- Install NSIS into a new temporary directory and launch only the real shortcut.
- Verify shortcut target and WorkingDirectory.
- Verify payload manifest, picker bridge, RTK, uv/servers, Serena,
  free-search, Caveman, Tesseract, Git policy and absence of Gemini/LSP.
- Select a project, activate Serena, list/call one Serena tool, execute one
  free-search tool, run one RTK-eligible command, run one OCR path and run
  the Git contract.
- Block network after packaging and repeat first-run/MCP/tool smoke.
- Close, relaunch and uninstall. Verify no managed children or leftovers
  remain. Run equivalent portable smoke with data beside the executable.
- Treat any visible child window, empty path, external dependency, duplicate
  Electron or orphan process as a hard failure.

### Tests and evidence

Run the complete Windows sequence:

    pnpm install --frozen-lockfile
    pnpm apply:upstream-patches
    pnpm test
    pnpm test:contract
    pnpm typecheck
    pnpm build:vendor
    pnpm build:shell
    pnpm package:runtime
    pnpm --filter @freecode/shell package
    pnpm --filter @freecode/shell smoke:nsis
    pnpm release:gate

Extend scripts/release-gate.mjs so it cannot skip the new dependency,
locale, Git, stream, offline-MCP or event-level window gates because a
developer resource is missing. Missing required resources are failures, not
skips. Save artifact names, SHA-256, installed path, process/window traces and
test exit codes under docs/evidence/0.7.0/.

### Lock criteria

Fresh NSIS and portable installations both pass the full smoke with controlled
PATH and blocked network. The picker, shortcut, project, MCP, RTK, Caveman,
OCR, Git, tray and shutdown behavior pass, and the process/window trace is
clean.

### Commit and push

    test(0.7.0): phase 9 gate clean Windows packaging offline

## Phase 10 — Final certification and publication

### Objective

Publish only the evidence-backed Windows 0.7.0 artifacts.

### Final checklist

- All prior phase commits exist on codex/0.7.0-remediation and are pushed.
- docs/STATE-0.7.0.md marks only evidenced components LOCKED.
- Gemini2API remains absent; independent LSP rows remain absent.
- Spanish is present and persisted.
- RTK and every declared runtime dependency are in the manifest and installed
  closure.
- Serena and free-search work offline and expose real tools.
- Caveman's default reflects the packaged executable.
- One Electron owner, one DSH generation and zero visible helper windows.
- Git errors are classified and sandbox is not widened automatically.
- Provider/tool streams reject the reproduced empty/truncated case.
- OCR direct/read_image paths and all boundaries pass.
- picker bridge, shortcut, About/version, config file and tray/updater checks
  pass.
- No Linux/macOS asset is labeled official without separate real-host testing.
- README.md, README.es.md, docs/RELEASE.md, docs/RELEASE.es.md,
  docs/STATE-0.7.0.md and this roadmap agree.

### Release commands

Run the final gate again from the exact commit intended for the tag. Record
all output and hashes. Do not create the tag before the clean install is
complete.

    git status --short
    git diff --check
    pnpm release:gate
    git tag 0.7.0
    git push origin 0.7.0
    gh release create 0.7.0 <Windows-only-assets> --title "FreeCode 0.7.0" --notes-file release-notes-v0.7.0.md

If any command fails, do not tag or publish. Fix the phase that owns the
failure, repeat its gate and then repeat this final gate. Never delete a tag or
release as a substitute for fixing a failing artifact; if an already published
candidate must be withdrawn, record the exact remote state and use the
repository's approved recovery procedure.

### Commit and push

    release(0.7.0): phase 10 certify Windows release

The tag/release operation is a separate final action after this commit is
pushed and verified. Upload only the Windows NSIS and portable artifacts plus
their checksums and truthful release notes. Mention the 0.6.0 Spanish and
dependency-closure regressions as historical context; do not claim Linux
testing that did not happen.

## Definition of done

0.7.0 is done only when a clean Windows user with no developer PATH tools, no
per-user uv cache and no network during first run can install, open, select a
project, see Serena/Caveman/MCP status, execute real tools, use OCR/Git, close
and relaunch without a single helper window flashing or an extra app instance.
The same evidence must be reproducible from the pushed commit and the
published Windows artifacts.

If an agent cannot produce the evidence, the item remains UNVERIFIED. It is
better to stop before the tag than to convert a partial local cache success
into another release regression.
