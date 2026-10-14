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
- [x] `R2` Request-aware canonicalization implemented in replayable Go overlay, using original downstream tools before anonymous synthetic shaping. Native SSE metadata stays intact; ambiguous prefixes, restricted tool choices, extended/late-changing names and torn frames fail safely. RED observed for missing helper and actual regular/rotation document/stream names; GREEN full offline Go tests + vet, with protocol/transcoded/rotation/HTTP fixtures (no request replay). Overlay replay is idempotent and rejects drift. Additional RED/GREEN for stale desktop staging; receipt pins Go source/patch/version and binary bytes. All four targets built offline with embedded OS/arch/v1.3.8 verified; Windows copy staged and fingerprint verified. Node contracts 39/39. Rollback: protocol overlay, its apply/build/staging gates, tests and notes only. Commit identity recorded in progress after commit.
- [ ] `R3` Run applicable complete local checks and graph refresh, record failures/skips/pending checks and commit identities. No installer build/launch or active app mutation. Explain that the active installed build is unchanged.

## Acceptance
No OmniRoute feature, dependency, download, sidecar launch or detector endpoint in newly built product; legacy app-owned configuration is safely retired at next startup without harming unrelated settings. Invalid pash calls cannot become an undeclared executable tool; compatible declared bash calls preserve their normal sandbox/approval boundary and durable identity. Existing source/build gates remain enforced.

## Progress / next step
R1 commit: `d73a886`. Authored running count about 2,100 additions/deletions (17,739 generated lock lines excluded). The retirement module is the only retained reference to the removed app-owned route/cache names; tests/docs historical mentions do not enable a feature. No upstream overlay materializations were included in that commit.
R1 verified and committed. R2 verified; local work-unit commit followed by R3 complete checks/graph refresh. Existing local staged and source binaries both contained v1.3.8; the old installed v1.3.5 log is historical evidence, not proof of a current local version mismatch. Staging guard prevents a rebuilt sidecar being omitted when DSH is not regenerated. No live instance changes or installer operations occurred.

## Persistence
Engram mirror `odd/remove-omniroute-pash/tasks` pending: host runtime registration is unavailable and agent-attributed writes are prohibited. Local document is authoritative; no alternate session ID used.
