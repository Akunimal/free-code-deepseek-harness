# Remove OmniRoute and repair invalid pash tool calls

Repository locator: `odd/tasks/remove-omniroute-pash.md`.

## Objective and authorization
The user explicitly requested complete removal of FreeCode's OmniRoute integration and correction of intermittent `unknown tool "pash"`. Work is local, direct inline, single agent. Do not inspect/stop/restart the active app, change its live caches/settings/history, run an installer, or publish/push/tag. Preserve unrelated local changes and historical release artifacts. Remove owned legacy data only in the next app's startup migration, not from this agent session.

## Evidence and design constraints
- The installed app logs report the optional runtime prepared and fallback state `primary`; the last isolated free inference was HTTP 403. Runtime installation is not inference availability.
- Read-only inspection of the current session found assistant stream calls already named `pash`, followed by matching call/result IDs and UNKNOWN_TOOL results. Registry and sidecar source define `bash`, not `pash`; the bridge passes unknown names through unchanged. Do not claim historical log corruption or rewrite sessions.
- Resolve the exact invalid name at a request-aware protocol boundary only when the downstream client declares `bash` and does not declare `pash`. No fuzzy matching, undeclared/phantom tool execution, permission bypass, argument rewriting, ID regeneration or inference retry. Cover streamed and non-streamed paths and fragmented names before selecting implementation.
- No direct upstream source edits: fork behavior in the Go vendor belongs to a reproducible overlay; preserve existing DSH overlay materialization.
- Removing OmniRoute must preserve OpenCode's strict 200-only catalog, slow-model probe budget and bounded recovery retries. Preserve unrelated user providers/defaults. Remove download/server/detection IPC, packaging/dependency inputs, notices and current documentation promises; historical records remain historical.

## Testing and delivery
TDD RED -> GREEN -> REFACTOR, explicitly chosen earlier by the user. Runners: shell pnpm/Vitest, Node test for scripts/contracts, scoped Go tests for the sidecar. Test homes/caches/servers are isolated and test-owned.
Feature branch: `codex/v0.9.4-opencode2api-tor-hardening`.
Delivery: retain the version's cached `single-pr` strategy for local work units; no remote delivery is authorized. Forecast: roughly 2,000 authored deletions/changes, excluding generated dependency lock/runtime artifacts. Review/PR sizing remains pending if remote delivery is later requested; no size-only code reduction.

## Tasks
- [x] `R1` Removed download/server/fallback/detector/IPC/types and pinned package/dependency closure. Current EN/ES policy/notes updated; old feature documents/artifacts remain historical. Added next-start, nonblocking retirement with owned-route/default restoration, unrelated selection preservation, validated settings, resumable cache deletion and junction refusal. Clean shell build prevents stale emitted JavaScript; builder excludes stale manifests. Evidence: initial Node removal RED and missing migration module RED; GREEN 32/32 migration/seeder/refresher tests and 10/10 removal/doc contracts. Shared-types build, shell build/typecheck and diff check passed. Real migration ran ONLY in temporary test homes, never installed app data. Rollback: this removal/migration/packaging/docs unit only. Commit identity pending below.
- [ ] `R2` Reproduce `pash` at protocol boundaries and implement exact declared-tool-only canonicalization through a replayable Go overlay. Test actual/undeclared pash, missing bash, fragments, IDs/arguments, all supported response shapes and error/stream behavior; scoped/full sidecar checks and local work-unit commit.
- [ ] `R3` Run applicable complete local checks and graph refresh, record failures/skips/pending checks and commit identities. No installer build/launch or active app mutation. Explain that the active installed build is unchanged.

## Acceptance
No OmniRoute feature, dependency, download, sidecar launch or detector endpoint in newly built product; legacy app-owned configuration is safely retired at next startup without harming unrelated settings. Invalid pash calls cannot become an undeclared executable tool; compatible declared bash calls preserve their normal sandbox/approval boundary and durable identity. Existing source/build gates remain enforced.

## Progress / next step
R1 verified; commit this coherent removal unit, then implement the request-aware pash bridge regression/overlay (R2). No live instance changes or installer operations occurred. Full checks/graph freshness still pending R3.

## Persistence
Engram mirror `odd/remove-omniroute-pash/tasks` pending: host runtime registration is unavailable and agent-attributed writes are prohibited. Local document is authoritative; no alternate session ID used.
