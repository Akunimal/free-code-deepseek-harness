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
Earlier confirmation of local TDD and stacked-to-main delivery applies. This
authorizes local implementation and work-unit commits only: no push, merge,
tag, release, installer execution, or interaction with a running FreeCode
instance is authorized by this task.

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
  (`71c3a3a`). PHX101-4 and PHX101-5 remain later slices on this feature branch.
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
  FreeCode instance, run the installer, or perform remote operations.

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
   Graphify update complete. Installer build/run, public upstream health,
   production clean-cache DSH gate, publication and remote state remain pending
   unless separately authorized and executed.

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
- [ ] PHX101-4: Replace all active opencode2api staging, dependency pin,
  preflight, packaging, NSIS/AppImage and process-launch contracts; remove
  obsolete active gateway assets/scripts while preserving historical release
  evidence.
- [ ] PHX101-5: Set root/shell to v1.0.1, align active ES/EN documentation and
  changelog/release contracts, run applicable local checks, update Graphify,
  and close with a Conventional Commit.

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

### Verification log

- Pending: PHX101-4 onward.

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

### Next step

PHX101-3 behavior is verified locally; its work-unit commit identity is
recorded in the task checklist. Next, begin PHX101-4: retire every active
OpenCode2API staging, dependency, preflight, packaging and process-launch path
while keeping historical release evidence truthful.

## Relevant files

- `apps/shell/src/main/runtime.ts` — desktop runtime composition and DSH gateway URL.
- `apps/shell/src/main/index.ts` — startup/provider initialization and catalog lifecycle.
- `apps/shell/src/main/model-refresher.ts` — current model discovery/probe behavior.
- `apps/shell/src/main/provider-seeder.ts` — app-managed DSH provider migration.
- `apps/shell/src/main/preflight.ts`, `resource-paths.ts` — installed resource contract.
- `apps/shell/src/main/freecode-launcher.ts`, `headless-host-policy.ts` — mandatory
  hidden Windows process containment seam.
- `scripts/phoenix-router-contracts.py`, `scripts/phoenix-router-contracts.test.mjs` — deterministic FreeLLMpool pin, Auto failover, stream and cancellation contracts.
- `scripts/opencode2api-staging.mjs`, `scripts/runtime-dependency-pins.mjs`,
  `scripts/package-runtime.sh` — current sidecar provenance/package contracts.
- `docs/ARCHITECTURE.md`, `docs/RELEASE-POLICY.md` and active EN/ES release docs —
  architecture and product/distribution claims to reconcile.
