# Phoenix + FreeLLMpool — FreeCode v1.0.1

## Goal, problem and authorization

Replace FreeCode's active `opencode2api` gateway and its per-machine `:8095`
dependency with a self-contained Phoenix model gateway backed by the pinned
FreeLLMpool implementation. A fresh Windows x64 install must recreate the
gateway from the shipped product, without `C:\LocalAI`, a Python installation,
user-side FreeLLMpool, or a service already listening on a local port.

The selector must put **Auto Phoenix** first and expose the curated,
FreeLLMpool-backed individual models after it. A concrete selection is a strict
pin: any upstream failure is returned for that model and must never silently
switch models. Only Auto Phoenix may route/fail over among enabled free routes;
once response streaming starts, neither model nor provider may change.

The user explicitly authorized replacing all active `opencode2api` behavior
with the Phoenix/FreeLLMpool system and setting this candidate to 1.0.1.
Earlier confirmation of local TDD and stacked-to-main delivery applies. The
current user additionally authorized building the v1.0.1 Windows installer
artifacts locally. This still does not authorize push, merge, tag, release,
installer execution/installation, or interaction with a running FreeCode
instance. Do not treat a successful local package build as clean-install proof
or release readiness; the public clean-cache runtime gate remains required.

## Workflow and delivery

- Direct inline only; no delegation.
- TDD: **red-green-refactor**, explicitly selected by the user. Primary runner:
  `pnpm` / Vitest; release-script contracts use `node --test`. Any Python-side
  contracts must run isolated against the bundled runtime or deterministic
  fixtures, never live provider endpoints.
- Branch: `codex/phoenix-freecode-v1.0.1`, created from `main` at
  `d0c6225432` (tag `v1.0.0`).
- Delivery strategy: reuse **stacked-to-main** as local commit organization
  only. Do not push/merge without a new explicit authorization.
- Forecast: approximately 1,200 authored changed lines across coordinated
  source, packaging, tests, and bilingual documentation (generated/vendored
  upstream source and compiled binaries excluded).
- Delivery slices (local only; no PRs/push authorized): PHX101-1 is the first
  slice (`4852974c8cf74fe69905d90d51f2f1e87fdd3359`); PHX101-2 is the second
  (`9489c65c06c2f15018c4dfc6354d635fab0e2a52`); PHX101-3 is the third
  (`71c3a3a`); PHX101-4 is the fourth slice (`c86cb1a832de7b0949087e4dc5cfdd7c913bbb7e`);
  PHX101-5 is the fifth slice (`78d7b7a`). PHX101-6 remains pending on this
  feature branch. The Kilo follow-up is split into PHX101-8a (catalog/source,
  tests, generated models and sidecar receipt; commit `3b7d975`) then PHX101-8b
  (bilingual docs and task evidence; commit `774580e`). Both stay local on this
  feature branch; no PR or remote action is authorized.
- Preserve pre-existing dirty Graphify outputs and untracked vendor artifacts;
  stage only files belonging to this feature.

## Scope and constraints

- Vendor the public MIT-licensed FreeLLMpool source at immutable commit
  `e4411650da95edf3002c6789ccd1c816aedae1d4` (upstream version 0.13.0) and
  ship a pinned, self-contained Windows x64 service binary plus its license and
  source/build receipt. Keep the bundled provider set limited to configured
  keyless/free routes; do not use personal credentials, local config, or the
  developer's `.venv`.
- Add a Phoenix adapter for selector alias, model inventory and OpenAI-compatible
  request forwarding; retain cancellation, health checks, bounded waits and
  `freecode-launcher` + verified `headless-host` for every background process.
- Replace runtime composition, model refresh/provider seeding, preflight,
  staging, dependency receipts, package/NSIS/AppImage layout checks and release
  contracts so the desktop no longer ships or starts `opencode2api`.
- Keep historical release notes truthful; update active product version/docs to
  v1.0.1 candidate in Spanish and English. Do not claim a release or clean
  install before its authorized production gate.
- Do not read local credentials, cookies, account files or logs. Do not probe
  external model endpoints, inspect/stop/restart/launch the user's running
  FreeCode instance, run the installer, or perform remote operations. The
  separately authorized local package build may use the existing dependency
  and binary caches; stop rather than initiate unapproved downloads.

## Authorized follow-up: Kilo anonymous catalog and quality order

The user asked to include Kilo no-auth free models, rank selectable models by
quality before latency, and remove every Nemotron model. Snapshot checked
2026-10-21 from the [official free catalog](https://kilo.ai/landing/free-models),
the [Kilo leaderboard](https://kilo.ai/leaderboard), and [anonymous-access
documentation](https://kilo.ai/docs/gateway/authentication); do not probe Kilo
or any model endpoint. Preserve the immutable vendored FreeLLMpool source and
apply a FreeCode-owned catalog policy so no enabled route or hidden dynamic Kilo
alias can route to Nemotron. Keep Auto Phoenix first. Use the existing bundled
FreeLLMpool capability mapping (benchmarks where known, its name heuristic
otherwise) for the remaining catalog and the official Kilo Code-agent usage
rank as a weaker cross-catalog proxy for direct Kilo routes; measured probe
latency is only a tie-breaker. Kilo's usage rank is dynamic and not directly
comparable to the FreeLLMpool capability scale; keep its provenance and
limitations explicit in code/docs.

The official Kilo snapshot has three direct free models that are not Nemotron:
MiniMax M3.1 Flash (Code rank #14; [model card](https://kilo.ai/models/minimax-minimax-m3-1-flash-free)),
Poolside Laguna S 2.1 (#98; [model card](https://kilo.ai/models/poolside-laguna-s-2-1-free)),
and Dots3 Note Preview (#99; [model card](https://kilo.ai/models/dots-studio-dots-3-note-preview-free)).
Kilo documents anonymous access for free routes with a 200 requests/hour/IP
limit. Keep only those explicit Kilo routes; disable dynamic `openrouter/free`
and `kilo-auto` aliases because their provider selection can change
independently of this allowlist. The pinned vendor source remains byte-for-byte
unchanged.

- TDD mode: **red-green-refactor**, explicitly selected earlier by the user;
  `pnpm`/Vitest for shell behavior and `node --test` for catalog/release-script
  contracts. The globally resolved pnpm shim is broken on this machine; use
  `C:\Users\inti_\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd`
  (pnpm 11.25.0) for the same configured Vitest runner.
- Scope: local source, tests, active ES/EN docs, generated Phoenix catalog,
  deterministic Phoenix payload rebuild/restage and Graphify freshness only.
  No installer execution, app launch, provider request, push, tag or release.
- Branch: reuse `codex/phoenix-freecode-v1.0.1`; keep unrelated dirty Graphify
  and vendor artifacts unstaged.
- Delivery: use the already-selected **stacked-to-main** strategy. The first
  forecast was ~350 authored changed lines; the observed total is ~700, so split
  the coherent source/test/catalog work (PHX101-8a) from its bilingual docs and
  task evidence (PHX101-8b), keeping both commits adjacent on this feature
  branch. No push, PR, merge, tag, or release is authorized.

## Authorized follow-up: remove non-responders from the selector

On 2026-10-21, the user authorized up to three direct, minimal, unauthenticated
Kilo completions. MiniMax M3.1 Flash and Laguna S 2.1 returned HTTP 200 with
non-empty text; Dots3 Note Preview returned HTTP 200 without
`choices[0].message.content`. No more provider calls are authorized by that
grant. The user clarified that models which do not answer must leave the
selector automatically. Existing `probeModels` trusts HTTP 200 alone, so a
blank/malformed success can currently remain selectable. Change the strict
responder contract to require a parseable OpenAI chat completion with at least
one actual answer (non-empty text/refusal, or a structured tool call). Every
failed current probe—including a timeout/transport failure, HTTP rejection, or
invalid/empty 200—must remove the model from the selector immediately. Prior
success may remain diagnostic metadata only, never selectable; a later valid
probe restores the model automatically. Do not probe providers or touch a
running app while implementing this.

- TDD: **red-green-refactor**, Vitest through the same bundled pnpm fallback;
  write regressions first for empty/malformed HTTP-200 bodies, valid responses,
  immediate removal after empty and transport failures, later re-addition on
  recovery, and production wiring with live per-model probes enabled.
- Scope: production refresh wiring in `index.ts`, `model-refresher.ts`, tests,
  and bilingual/contract documentation describing selector eligibility. At
  exploration, the production call set `probeModels: false`, so body validation
  alone would not have changed the installed selector; PHX101-9 turns on live
  per-model probing. No more network requests, package/installer build or
  launch, push, tag, or release.
- Delivery: one local conventional-commit work unit on
  `codex/phoenix-freecode-v1.0.1`; all earlier commits remain local.

### PHX101-9 checklist

- [x] PHX101-9: Require a valid non-empty chat completion before a model is
  marked responding or kept in the selector; immediately remove every model
  whose current probe fails, retain prior success only for diagnostics, restore
  recovered models, cover production wiring and the contract in TDD, and align
  active documentation.
  Commit identity: `c10d74e`.

### PHX101-10 checklist

- [x] PHX101-10: Rebuild the updated v1.0.1 Windows setup and portable artifacts
  from current source; run the package's headless/resource checks and exact
  static release-asset verification, and record hashes. Neither artifact was
  executed and no FreeCode instance was launched/inspected/stopped. The user
  will test locally; no tag or release until that test succeeds. The user
  authorized pushing to `Akunimal/free-code-deepseek-harness` `main` with the
  current `gh` session. After a ref-lock race, the authenticated GitHub API
  confirmed `main` at `122bea761e69371a39e6ce1a004021296b0655c3`; no force push
  or tag/release was used. Integrity-pin work-unit commit: `31e4b08`.

## Authorized follow-up: v1.0.1 publication, bilingual docs, and per-model context

The user requests a v1.0.1 local build for their own testing, bilingual
README/release notes explaining the OpenCode2API-to-Phoenix replacement and
pool routing, and an audit because Phoenix models appear to all report 256K
context. The user explicitly clarified: do not publish yet; compile locally
first so they can test everything. This turn authorizes local source/docs/tests
and desktop build only. It does not authorize push, tag, release, installer
execution/installation, or interaction with a running FreeCode process. The
public clean-cache runtime gate remains mandatory before any later publication.

Initial source audit found the likely context cause: FreeLLMpool's OpenAI
`/models` response returns IDs and capability evidence but not context-window
metadata; FreeCode's model refresher only accepts declared `context_window`/
`context_length`; `llm-pi-ai` therefore applies its generic 262,144-token
`DEFAULT_CONTEXT_WINDOW` to every unannotated route. That number is a fallback,
not verified per-model data. Add model-specific context values only where
reviewed upstream model/provider documentation supports them, preserve a
truthful documented fallback for dynamic/undocumented aliases, and test both
known values and unknown fallback behavior. Do not probe model endpoints.

- TDD: **red-green-refactor**, selected by the user; shell behavior uses
  Vitest via the bundled pnpm fallback documented above; release/docs
  contracts use `node --test`. No provider endpoint calls.
- Scope: Phoenix context metadata enrichment and its tests; active English and
  Spanish READMEs, v1.0.1 local-candidate notes/changelog, release policy,
  release guides and roadmap; local desktop build and exact artifact
  verification. Publication is
  explicitly deferred until the user tests the local artifacts and separately
  authorizes remote operations; do not run the publication gate or remote work
  in this task.
- Delivery strategy: reuse **stacked-to-main**. Forecast ~350 authored changed
  lines excluding generated artifacts. Keep unrelated dirty Graphify/vendor
  files unstaged; refresh Graphify after edits but never stage its output.

### PHX101-11 checklist

- [x] PHX101-11a: Add evidence-backed per-model context capacities for known
  Phoenix routes, keep unknown/dynamic aliases explicitly on the documented
  framework fallback, and protect parsing/enrichment/fallback in regression
  tests. Sources must distinguish model-native context from provider-specific
  route caps.
- [x] PHX101-11b: Align bilingual README/release notes/changelog/policy/release
  guides/roadmap with the OpenCode2API retirement, bundled Phoenix/FreeLLMpool
  architecture, strict concrete pin versus Auto-only fallback behavior, model
  pool health/ranking/context behavior, actual local v1.0.1 artifacts and
  truthful unpublished status. Release-version docs contract passed 13/13.
  Work-unit commit: `9ae6061af2`.
- [ ] PHX101-11c (package/checks complete; Graphify freshness pending): Run local
  checks, rebuild setup/portable from the edited source,
  statically verify the exact local artifacts, update Graphify, and record
  evidence. Do not run or install either artifact; hand them to the user for
  testing. The clean-cache DSH proof remains a later publication gate.
- [ ] PHX101-11d: Deferred: after the user tests the local build and explicitly
  re-authorizes publication, run the mandatory public clean-cache gate and
  remote operation workflow. No push, tag or release is authorized now.

## Acceptance criteria and checks

1. A clean packaged profile starts only the shipped FreeLLMpool Phoenix service
   through the verified headless process broker; it needs neither external
   Python nor `C:\LocalAI` nor a pre-existing gateway process.
2. The Phoenix catalog is deterministic and begins with Auto Phoenix, followed
   by allowed concrete model IDs sourced from the pinned provider catalog.
   No account-key/paid provider is exposed by default.
3. Model-pin contract: one concrete selection reaches only its exact upstream
   provider/model; failure is returned without fallback. Auto is the sole mode
   that can try another eligible route, and only before downstream stream bytes
   are committed. Client errors do not poison route health.
4. Packaging/preflight rejects missing, wrong-architecture, stale, or
   unverified Phoenix payloads and rejects any active package manifest that
   includes the retired opencode2api executable.
5. Targeted RED/GREEN tests, shell typecheck/Vitest, applicable `node --test`
   contracts, package-resource/headless checks, `git diff --check`, and a fresh
   Graphify update complete. Installer execution, public upstream health,
   production clean-cache DSH gate, publication and remote state remain pending
   unless separately authorized and executed. The authorized local installer
   build is tracked separately in PHX101-7 and is not clean-install proof.

## Tasks

- [x] PHX101-1: Pin and vendor FreeLLMpool source/license, define the safe
  Phoenix catalog/build receipt, and produce/verify a self-contained Windows
  x64 gateway artifact. Prove standalone startup and model inventory with an
  isolated local smoke. Commit: `4852974c8cf74fe69905d90d51f2f1e87fdd3359`.
- [x] PHX101-2: Replace the opencode2api runtime sidecar with the contained
  Phoenix/FreeLLMpool lifecycle, health/readiness reporting and shutdown;
  update the Harness endpoint without disturbing active DSH settings or
  unrelated user providers. Commit:
  `9489c65c06c2f15018c4dfc6354d635fab0e2a52`.
- [x] PHX101-3: Add Phoenix model inventory/selector behavior and strict-pin vs
  Auto-only failover contracts, including no mid-stream route change, request
  cancellation and model-load status. Commit: `71c3a3a`.
- [x] PHX101-4: Replace all active opencode2api staging, dependency pin,
  preflight, packaging, NSIS/AppImage and process-launch contracts; remove
  obsolete active gateway assets/scripts while preserving historical release
  evidence. Commit: `c86cb1a832de7b0949087e4dc5cfdd7c913bbb7e`.
- [x] PHX101-5: Set root/shell to v1.0.1, align active ES/EN documentation and
  changelog/release contracts, add bilingual candidate notes, and run applicable
  local checks. Commit: `78d7b7a`.
- [ ] PHX101-6: Refresh the Graphify graph after removing the old gateway and
  the Kilo/catalog follow-up; verify freshness without overwriting unrelated
  pre-existing Graphify/vendor work. Normal and `--force` attempts previously
  stalled after extraction. The latest direct update also extracted the source
  but did not complete the graph write; the graphify command reported changed
  communities and requested an LLM label refresh. Graphify freshness is still
  pending; do not stage the pre-existing graph output changes.
- [x] PHX101-7: Build v1.0.1 setup and portable into the documented isolated
  candidate directory, statically verify both artifacts, blockmap and metadata,
  and record their hashes without touching a live FreeCode instance. The setup
  was later launched once at the user's request, but successful installation
  remains unverified. Do not publish or call the build clean-install proof.
  Commit: `78ef608` (bundle-freshness pin); package evidence follows below.
- [x] PHX101-8: Curate Kilo anonymous free routes without Nemotron-capable
  dynamic aliases, add quality-first ordering in both the persisted catalog and
  selector (latency only as a tie-breaker), protect the exact policy in TDD
  contracts, rebuild/restage the Phoenix sidecar from the existing local
  toolchain, align active ES/EN docs, and commit the work unit. Graphify
  freshness is tracked separately by PHX101-6. Do not build or run the app
  installer unless separately requested. Source/test/resource slice committed
  as `3b7d975`; bilingual docs/task evidence slice committed as `774580e`.
- [x] PHX101-10: Rebuild and statically verify the current v1.0.1 setup and
  portable artifacts for the user's local test; do not execute either artifact
  or publish. Integrity-pin work-unit commit: `31e4b08`; build evidence recorded
  below.

## Progress and recovery

### Exploration evidence

- Current app v1.0.0 still starts `apps/shell/src/main/opencode2api.ts` from
  `runtime.ts`, advertises its URL from `index.ts`, probes its model list via
  `model-refresher.ts`, and requires/stages its binary in preflight and release
  scripts.
- The prior local Phoenix router has alias `phoenix`, but its old implementation
  depends on FreeLLMpool already listening at `127.0.0.1:8095` and silently
  cascades from a failed concrete selection. It cannot be copied as-is.
- The pinned FreeLLMpool project has a built-in OpenAI-compatible proxy, a
  keyless default catalog (including Pollinations, OVHcloud and Kilo routes),
  explicit `provider/model` targeting, and MIT license. Its source requires
  Python 3.11+, with `httpx` as its only declared runtime dependency. This host
  currently has Python 3.14.2, PyInstaller 6.20.0 and httpx 0.28.1.
- Earlier graph exploration queried `graphify-out/graph.json` before source
  reads and identified runtime, model-refresher, provider-seeder, preflight,
  resource path, staging, dependency pin, and package-layout contracts as the
  affected seam.

### Current state

PHX101-1 is implemented, locally verified and committed as
`4852974c8cf74fe69905d90d51f2f1e87fdd3359`. The pinned source is vendored,
the bundle contains only the four approved keyless/free providers and enabled
concrete model IDs plus Auto, and a self-contained Win x64 executable has a
hash-bound staging receipt. The clean-profile service smoke ran the exact
staged executable through the verified `headless-host`/`freecode-launcher`,
returned authenticated `/v1/models` with 34 allowed IDs, and closed its
test-owned process/profile. It made no external provider requests. The
  pre-existing graph/vendor working-tree entries remain untouched.

PHX101-2 replaces the optional OpenCode sidecar/proxy-rotation path with a
required, hash-verified Phoenix gateway. DSH receives only its per-run API key;
model seeding uses the exact packaged allowlist with Auto first, preserves
unrelated providers/defaults, migrates the previous managed route to Auto, and
fails startup closed if the Phoenix payload is absent. The model refresher no
longer consumes stale opencode2api capability caches. The Phoenix supervisor's
failed readiness restart now retries instead of giving up after the first bad
restart.

PHX101-3 found and fixed the catalog regression: FreeLLMpool's `/v1/models`
lists only concrete provider routes, so the packaged `auto` router mode vanished
on the first refresh. Phoenix refresh now synthesizes `auto` from the verified
allowlist and keeps it first. A deterministic Python behavioral contract runs
the pinned FreeLLMpool router against fake transports to protect exact concrete
pins, Auto pre-stream fallback only, post-start stream commitment, cancellation
cleanup and non-health client errors. The shell's catalog-loading IPC/state
contract was also reverified.

PHX101-5 aligns root/shell package metadata to 1.0.1; updates the English and
Spanish READMEs, architecture, release procedures/policy, roadmap, issue ledger,
translation baseline and changelog; adds truthful bilingual candidate notes;
and updates release/documentation contracts from old OpenCode Free wording to
Phoenix strict-pin/Auto semantics. At that point, documentation correctly said
that no v1.0.1 setup/portable or public empty-cache proof had run. The work is
committed locally as `78d7b7a`; no push, tag, release or installer action was
performed.

### Verification log

- PHX101-4 TDD red: Phoenix payload/preflight tests initially failed because
  the previous preflight still required OpenCode2API and accepted a stale
  gateway in its place; the runtime pin helper and package contract also still
  required the retired dependency. The replacement contract was added before
  implementation and failed until the active source/vendor/build paths were
  removed and Phoenix became the required hash-bound runtime.
- PHX101-4 green: targeted Phoenix/preflight/resource/dependency tests passed
  40/40; release/NSIS/staging/router Node contracts passed 28/28; release
  contract tests passed 9/9; full shell suite passed 55 files / 377 tests;
  shell typecheck passed; staging verification passed; runtime dependency
  verifier passed 28/28 and offline MCP verifier passed 13/13. The first
  typecheck exposed implicit `any` in the rewritten dependency contract test;
  the test manifest was typed and typecheck then passed. `git diff --check`
  passed. Work-unit commit: `c86cb1a832de7b0949087e4dc5cfdd7c913bbb7e`.
- No setup/installer was built or executed, no app instance was inspected or
  changed, and no external provider endpoint was probed.

- PHX101-1 TDD red: builder test first failed because there was no exported
  minimized PyInstaller argument contract; catalog/allowlist tests first
  failed because the model-ID manifest was absent; smoke-helper tests first
  failed because the isolated gate did not exist.
- PHX101-1 green: `node --test` on the four Phoenix/builder test files — 12/12
  passed; catalog source check passed; pinned sidecar built with PyInstaller
  6.20.0/Python 3.14.2; PE receipt SHA-256
  `68f051e03334d5e073f9e5608dce581a26834fbb92ecddac3b9f4eb299d3fe24`.
- PHX101-1 isolated Windows service smoke: passed with 34 allowlisted model
  IDs using empty state and a per-test random key; no model/provider request
  sent upstream.
- PHX101-2 TDD red/green: runtime composition tests first failed because the
  runtime never started Phoenix and continued after a missing gateway; now
  Phoenix starts before DSH, its ephemeral key is passed only to DSH, and a
  Phoenix startup error fails closed. Gateway restart-readiness regression
  first failed (only two launch attempts) and now passes with bounded retries.
- PHX101-2 targeted Vitest: 5 suites / 56 tests passed across Phoenix gateway,
  runtime composition, seeder, refresher, and Harness profile migration.
- PHX101-2 full shell gate: `pnpm --filter @freecode/shell typecheck` passed;
  `pnpm --filter @freecode/shell test` passed 57 files / 381 tests, including
  live isolated DSH profile-HMR and headless-helper tests.
- PHX101-2 diff check passed. Pre-existing Graphify outputs and vendor
  artifacts remain unstaged and untouched.
- PHX101-3 TDD red: Phoenix refresh test failed because Auto was absent from
  the FreeLLMpool-style concrete-only `/v1/models` fixture.
- PHX101-3 green: synthetic Auto now leads both persisted catalog and DSH
  provider settings; targeted refresher/state/IPC/startup tests passed 44/44.
  FreeLLMpool behavioral routing contracts passed 4/4 against deterministic
  fake transports; release-plan contract included the new test. Shell
  typecheck and `git diff --check` passed.
- PHX101-5 RED/GREEN: release version/doc tests were expanded first and failed
  against stale source versions, missing v1.0.1 notes and outdated OpenCode
  model-label assertions. After documentation/version alignment,
  `node --test scripts/release-version-docs.test.mjs` passed 12/12 and the
  focused contract suites passed 12/12 (`docs.contract.test.ts` 3/3,
  `release.contract.test.ts` 9/9); `git diff --check` passed.
- PHX101-6 Graphify: the standard update and repeated `--force` updates
  re-extracted approximately 6.2k files but stalled after AST extraction and
  did not replace `graph.json`. One run reported 4,581 saved labels versus
  4,565 communities and requested label refresh; MCP graph stats remained
  122,918 nodes / 263,625 edges / 4,581 communities. Only task-owned CLI runs
  were interrupted; no unrelated process or user's app was touched. Graph
  refresh is pending and must be reported as a freshness failure until verified.
  On 2026-10-21, another direct `graphify update` extracted 6,177 files and
  reported 21 syntax-error files plus 913 unsupported/unclassified files. It
  then reported 4,581 saved labels vs. 4,520 communities and requested
  `graphify label`; it stalled without writing any graph output. SHA-256 checks
  confirmed the pre-existing dirty Graphify files were unchanged, and no
  Graphify/vendor files were staged. This direct update was stopped; no LLM
  labeling or remote model call was authorized or made.
- PHX101-7 package: the first prepackage attempt correctly rejected a stale
  `native-command` source-hash pin. Rebuilt only that upstream host package and
  refreshed its tracked hash; the freshness gate then passed for all 323
  packages. The full `pnpm build:desktop` completed with its adversarial
  headless-window/descendant/Job tests, Phoenix staging, 28/28 runtime dependency
  checks, production-bundle background render/transition/reduced-motion proof,
  process-launch inventory, and 14/14 Electron ABI-compatible native addons.
  `verify:desktop-release-assets` passed on the exact output without executing
  either binary. Setup: `FreeCode-DeepSeek-Harness-1.0.1-win-x64-setup.exe`,
  211,656,469 bytes, SHA-256
  `60e62b7dc78daeb47a47cbb53ed08d03cef661948c77b462a561063c16c1acce`;
  portable: `FreeCode-DeepSeek-Harness-1.0.1-win-x64-portable.exe`,
  211,281,345 bytes, SHA-256
  `695cd3ff7f5e0645ada140feae3d788d5091b81a15aeb1fc463cb0679a70ea0a`.
  The setup blockmap (222,667 bytes) and `latest.yml` also passed static checks.
  `node --test scripts/release-version-docs.test.mjs` passed 12/12 and
  `git diff --check` passed. Neither artifact was run/installed; the public
  clean-cache DSH first-run gate and full `release:gate` remain pending. No app
  instance or user process was inspected or touched.
- After the user explicitly confirmed FreeCode was closed and asked to execute
  the setup, the v1.0.1 setup was launched once. The PowerShell wrapper failed
  while reading `ExitCode` before it could confirm completion; it was not
  relaunched, and successful installation is unverified. Do not claim the
  setup completed or inspect/stop/restart any FreeCode process.
- PHX101-8 TDD RED: new catalog tests failed because the pinned source still
  exposed dynamic Kilo aliases and four Nemotron models, and the selector still
  sorted by latency. New gateway/bootstrap contracts also accepted a
  Nemotron ID and both Kilo dynamic aliases. The initial configured `pnpm`
  shim was missing its global `pnpm.mjs`; reran Vitest through the bundled
  fallback pnpm 11.25.0. Targeted shell tests observed 4 expected failures / 41
  passes, and Node contracts observed 3 expected failures / 4 passes. A later
  regression test also went red because the saved catalog retained upstream
  order even while settings used quality order; sorting the exact allowlist
  before probing corrected both outputs.
- PHX101-8 GREEN: catalog/runtime Node contracts passed 7/7; targeted shell
  refresher/gateway tests passed 45/45; the complete shell suite passed 55
  files / 381 tests; shell typecheck and production shell build passed. Full
  contract tests passed 81 with 12 skipped, release-version docs passed 12/12,
  and `git diff --check` passed. The root `pnpm typecheck` command failed
  because its script resolves the broken global pnpm shim; the affected shell
  package typecheck passed directly via the bundled pnpm 11.25.0 fallback.
- PHX101-8 build proof: Phoenix FreeLLMpool 0.13.0 rebuilt and staged from the
  existing local toolchain; `freellmpool-staging.mjs --verify` and
  `phoenix-catalog.mjs --verify` passed. The isolated loopback Phoenix smoke
  started the staged binary through `freecode-launcher`/`headless-host`, read
  all 24 model IDs from `/v1/models`, and shut down its test-owned process.
  It made no external inference requests and did not touch the user's app.
  No installer, public clean-cache DSH test, or release gate was run.
- PHX101-9 TDD RED: the changed transport-failure contract failed because a
  previously verified route was still serialized into selector settings after
  its current probe failed. The catalog-outage test also failed on `/models`
  HTTP 503 before it could probe the shipped exact allowlist. The bilingual
  docs contract failed because neither README/release note specified body
  validation or eviction/recovery.
- PHX101-9 GREEN: production refresh now probes each Phoenix model; only a
  parseable non-empty HTTP 200 chat completion (text, refusal, or structured
  tool call) remains selectable. Empty/malformed 200s, transport errors and
  HTTP rejections are evicted immediately; prior success is diagnostic only.
  A later valid refresh restores the route. If `/models` itself is unavailable,
  the packaged exact allowlist is probed instead of leaving stale settings.
  Catalog status now reports degraded when any primary candidate fails.
- PHX101-9 tests: focused refresher/runtime/profile integration passed 44/44;
  full shell suite passed 55 files / 385 tests; shell typecheck passed; full
  contract suite passed 82 with 12 skips; release-version docs passed 12/12;
  targeted bilingual docs contract passed 1/1 and `git diff --check` passed.
  Test response fixtures now return actual usable completions rather than empty
  `{}` bodies. Work-unit commit: `c10d74e`.
- PHX101-9 made no provider/network calls and did not launch/install FreeCode.
  The required `graphify update` scanned 6,171 files but did not refresh its
  manifest/graph output (21 syntax-error files were reported; graph stats stayed
  at 122,918 nodes / 263,625 edges). The graph mtime predates the updated source;
  PHX101-6 remains pending, and no Graphify or vendor artifact was staged. A
  later required update re-extracted 1,500/6,169 uncached files before it was
  interrupted to avoid leaving a long-running graph process; freshness remains
  unverified.
- PHX101-10 first build attempt correctly stopped at `verify-runtime-dependencies`
  because the runtime dependency pin still named the prior Phoenix binary hash.
  `freellmpool-staging.mjs --verify` confirmed the current binary against its
  immutable-source build receipt; `refresh-runtime-dependency-pins.mjs` then
  refreshed only the stale Phoenix SHA-256 (the DSH pin was unchanged). The
  focused dependency check passed 28/28 before the full build rerun.
- PHX101-10 package: `pnpm build:desktop` passed on current source into the new
  isolated `apps/shell/release-1.0.1-local-20261021/` directory. Prepackage
  checks passed: 323 vendor bundles fresh, runtime manifest/dependencies,
  hidden-window/descendant/Job adversarial tests on both staged and packaged
  helpers, 23 headless-runtime contracts, conversation-bundle and rendered
  background transition/ASCII animation/reduced-motion proof, process-launch
  inventory, Electron 44.0.0 bootstrap, and 14/14 host-applicable native addons.
  The exact static asset verifier passed without executing artifacts. Setup:
  `FreeCode-DeepSeek-Harness-1.0.1-win-x64-setup.exe`, 211,657,457 bytes,
  SHA-256 `89b538c511d574b5f2bcf0db0faea6c884eca72e92d40816dcaca38b46e93a1c`;
  portable: `FreeCode-DeepSeek-Harness-1.0.1-win-x64-portable.exe`, 211,282,319
  bytes, SHA-256 `ed592f667c82d47925969c12dee43e426127f1d0d348824dfc4b1f45712d391c`.
  Blockmap (223,193 bytes) and `latest.yml` also verified. No installer/app was
  run; the public clean-cache DSH first-run gate and `release:gate` remain pending
  for publication. Work-unit commit: `31e4b08`.

### Next step

PHX101-11a/b source, tests and bilingual documentation are complete. The local
v1.0.1 build is at
`apps/shell/release-1.0.1-local-20261021-context-audit/`; the setup and portable
passed the exact static verifier and were not launched or installed. Setup:
211,659,287 bytes, SHA-256
`5925394ded845d41d7107416f78368a296d06bf383f224225a818cee19034b51`; portable:
211,284,149 bytes, SHA-256
`6fe824e64b54a3b3356335738b1978b43fb6038debb46739984afbe9df00088b`. Blockmap:
223,280 bytes, SHA-256
`9bf113056143ce9222aff547d3d78cca18fca468cfff6f3aa79847edb9712a19`.
Full shell suite passed 55 files / 386 tests; release-version docs passed
13/13; build prepackage checks passed, including 323 fresh vendor bundles,
headless adversarial and runtime tests, rendered conversation background proof,
Electron 44/Node 24 ABI 149 bootstrap and 14/14 host-applicable native addons.
`verify:desktop-release-assets` passed. An initial build command hit the known
broken global pnpm shim; rerunning with the bundled pnpm directory prepended to
PATH completed successfully.

The mandated Graphify refresh was attempted after edits and re-extracted all
6,175 uncached files (21 vendor syntax errors reported), then consumed multiple
minutes and ~4.5 GB RAM without updating `graph.json`, `manifest.json` or the
report. Only that task-owned Graphify process tree was interrupted; no FreeCode
or unrelated process was touched. Graphify freshness remains pending. The
public clean-cache DSH first-run proof and `release:gate` remain intentionally
unrun because the user wants to test locally before publication. Do not push,
tag, release, or run either artifact until the user returns with test results
and separately authorizes those next steps.

## Authorized follow-up: recover a verified pinned model across catalog refresh

The user reports that MiniMax had just refreshed and displayed its context,
then a turn failed after a tool step with `UNKNOWN_MODEL`. They explicitly
request investigation and repair. The immediate defect is that strict health
refresh removes descriptors from the same provider registry used by subsequent
steps of an existing turn. Health availability and configured route identity
must be independent: failed probes hide a route from new selector choices,
while exact allowlisted routes remain resolvable for pinned turns and recovery.
Never switch a concrete pin to another model. A later valid probe restores
selector visibility with its context and reasoning metadata intact.

TDD remains red-green-refactor (Vitest in shell and vendor); direct inline,
existing feature branch and stacked-to-main local commit strategy apply.
Forecast: ~500 authored changed lines split into two coherent work units plus
local packaging evidence. Local source/tests/docs/runtime/build are authorized;
no app-instance access, install, provider requests, push, tag or publication.

- [x] PHX101-12a: Add model selector visibility independently of exact-model
  resolution in the pi-ai provider; regress hidden model resolution, actual
  requests and visibility recovery under live configuration; document and
  capture the vendor patch.
  RED observed: hidden model still appeared in `listModels`; GREEN: 98/98
  catalog/config/dynamic-config tests, plus the pi-ai package TypeScript build.
  The live-config regression sends an actual local request before and after
  hiding the same route, then restores selector visibility and metadata.
  Work-unit commit: `e740b8f` (54 source/test/doc lines plus its replay patch).
- [x] PHX101-12b: Keep Phoenix's exact allowlist configured through failed
  probes, change only selector visibility, preserve concrete defaults and
  metadata, start with unavailable choices hidden, and prove failure/recovery
  against an isolated real Host using a test-owned local upstream.
- [x] PHX101-12c: Run applicable checks, rebuild the affected runtime and local
  candidate artifacts, update Graphify and record exact evidence. Do not
  execute the installer or publish; the user tests locally.
- [x] PHX101-12d: User additionally requests Auto-only recovery to another
  model with context compaction first when feasible, otherwise complete history
  forwarding. Inspect the actual compaction/Auto paths, implement any necessary
  repair and deterministically test history/tool continuity, without changing
  a concrete pin or switching after downstream stream bytes were committed.
  Inspection found the inherited 65,536-token compaction headroom exceeded
  Auto's conservative 32,768 context, disabling proactive compaction. The new
  Auto-only policy uses 4,096 headroom/summary tokens. RED reproduced the invalid
  budget; GREEN policy test, 110 compaction/Loader tests, and 5 deterministic
  router behaviors pass (including full/compacted history and tool results
  preserved across Auto failover). Pinned selection is never switched.

### PHX101-12 verification complete

- Shell RED reproduced removing a freshly verified MiniMax route, switching its
  default and losing its context/effort when a later catalog omitted it.
  GREEN: 56 refresher/seeder/recovery tests. Shell typecheck passed.
- Vendor build completed. Both patch 183 and 184 pass ordered replay,
  idempotency, manifest and whitespace verification with the bundled pnpm.
- Runtime packaging: `package:runtime` built and materialized the offline
  `0.2.1-alpha.12` DSH stage into `apps/shell/resources/freecode/`, refreshed
  runtime dependency pins, passed 23 headless runtime contracts, and updated
  `runtime-manifest.json` to alpha.12.
- Full shell test suite: `pnpm --filter @freecode/shell test` passed 58 files / 393
  tests, including the real Host multi-step tool recovery proof, profile HMR, and
  supervisor smoke with isolated process teardown.
- Routing contracts: `scripts/phoenix-router-contracts.test.mjs` passed 1/1
  protecting history/tool preservation across Auto fallback.
- Documentation contracts: `node --test scripts/release-version-docs.test.mjs`
  passed 13/13.
- Shell typecheck and `git diff --check` passed.
- Candidate build: `apps/shell/release-1.0.1-local-20261021-recovery/` was built
  via `pnpm build:desktop`. Static asset verifier (`verify:desktop-release-assets`)
  passed without executing either binary:
  - Setup: `FreeCode-DeepSeek-Harness-1.0.1-win-x64-setup.exe` (211,664,279 bytes;
    SHA-256 `4d9062b3b62b930c4c539b3f44139c2824056729f4d8f27ba116622d736591f4`).
  - Portable: `FreeCode-DeepSeek-Harness-1.0.1-win-x64-portable.exe` (211,289,141
    bytes; SHA-256 `849b3e8ebac7af5bf014eb7296d7a4dda3693360ff0d528bc52b5aa1b8bd26dd`).
  - Setup blockmap (223,228 bytes; SHA-256
    `e075fad134dc1ca7421b05122a709a7e5e9e2e03e4ddd1ea130cef5e9bf36d85`) and
    `latest.yml` verified.
  Neither artifact was launched or installed; both are handed to the user for testing.
- Graphify update: `graphify update .` completed (121,656 nodes, 258,904 edges,
  4,654 communities); graph outputs remain unstaged per policy.

## Relevant files

- `apps/shell/src/main/runtime.ts` — desktop runtime composition and DSH gateway URL.
- `apps/shell/src/main/index.ts` — startup/provider initialization and catalog lifecycle.
- `apps/shell/src/main/model-refresher.ts` — current model discovery/probe behavior.
- `apps/shell/src/main/provider-seeder.ts` — app-managed DSH provider migration.
- `apps/shell/src/main/preflight.ts`, `resource-paths.ts` — installed resource contract.
- `apps/shell/src/main/freecode-launcher.ts`, `headless-host-policy.ts` — mandatory
  hidden Windows process containment seam.
- `scripts/phoenix-router-contracts.py`, `scripts/phoenix-router-contracts.test.mjs` — deterministic FreeLLMpool pin, Auto failover, stream and cancellation contracts.
- `scripts/build-freellmpool.mjs`, `scripts/freellmpool-staging.mjs`,
  `scripts/runtime-dependency-pins.mjs`, `scripts/package-runtime.sh` — current
  Phoenix provenance and package contracts; old OpenCode2API staging was removed.
- `docs/ARCHITECTURE.md`, `docs/RELEASE-POLICY.md` and active EN/ES release docs —
  architecture and product/distribution claims to reconcile.
