# Remove OmniRoute and repair invalid pash tool calls

Repository locator: `odd/tasks/remove-omniroute-pash.md`.

## Objective and authorization
The user explicitly requested complete removal of FreeCode's OmniRoute integration and correction of intermittent `unknown tool "pash"`. Later authorized strengthening the actual system prompt so web research uses the embedded browser before DeepSeek API search. Work is local, direct inline, single agent. Do not inspect/stop/restart the active app, change its live caches/settings/history, run an installer, or publish/push/tag. Preserve unrelated local changes and historical release artifacts. Remove owned legacy data only in the next app's startup migration, not from this agent session.

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
- [x] `R4` Strengthened actual `tool:computer_use` system-prompt section through replayable overlay 169: browser-first for web/current evidence; search/fetch only after browser unavailable/blocked/failed, with disclosure. No forced browsing for offline tasks; retain authorization and untrusted-page boundaries. Scope and bridge-presence guards avoid misleading instructions outside FreeCode or restricted agents; no user persona replacement. Observed RED: original policy 3/3 failed, bridge-absence regression failed, manifest/runtime contracts 2/2 failed. GREEN: browser + existing web suite 83/83; focused TypeScript check; Node policy/docs contracts 10/10; earlier combined contracts 16/16. Full ordered overlay replay/idempotence/whitespace verified, final guard replay PASS for all 27 overlays. EN/ES policy/notes updated. Source pins alpha4; immutable alpha3 stage/archive preserved, so stage gate correctly fails until alpha4 is generated. Rollback: overlay 169, its manifest/tests/docs and source pin only. No runtime archive or installer generated.

### R2 bounded-reader follow-up
The initial stream cap was checked after ReadString could allocate an entire
oversized line. A 32 MiB counted-reader regression was RED (consumed all 32 MiB).
ReadSlice now rejects near 16 MiB before further allocation, preserves line
boundaries across chunks, and is GREEN with full offline Go tests/vet. All four
sidecar targets rebuilt/staged again after this correction. Commit `6376e37648`.
R2 consumer-boundary follow-up: inspection of the installed pi-ai SDK and DSH
translator showed that the first native Chat tool entry immediately emits
toolcall_start and freezes id/name. Removing only name could emit an invalid
empty identity. Observed RED for that exact first-event contract; now withhold
the whole pending entry and release complete identity with its first arguments,
preserving opaque metadata and bounding held headers. Full Go tests/vet and all
four rebuilt sidecars are GREEN. Commit `bb81a037f1`.

### R3 verification ledger
- PASS: workspace build and typecheck; Node contracts 39/39 plus runtime closure 9/9; stream 20/20, locale 16/16, offline MCP 12/12; process-launch inventory 2498 files / 35 sites / 2 documented GUI exceptions; pinned alpha3 digest unchanged; runtime closure clean; 323 vendor bundles fresh; Windows ACL applicable suite 19/19.
- Full workspace run FAILED: adapter 21/21; contract suite 105 passed, 5 failed, 12 foreign-platform skips. Four DSH CLI/readiness tests timed out with no output; Gentle AI import also timed out. Isolated rerun confirmed Gentle AI 13/13 but four CLI/readiness timeouts persisted. Do not call these failures merely load sensitivity without stronger evidence.
- Full shell run FAILED: 289 passed, 2 failed / 291 total; DSH CLI Electron-version probe and real CLI readiness timed out. A direct isolated Node CLI --version probe then passed (0.2.1-alpha.1); imports of commander/home-paths/app-boot also passed. Isolated shell smoke rerun passed 7/7, but real readiness took 80 seconds and CLI version 42 seconds. Test-owned child processes only; no installed instance stop/restart.
- Code graphs refreshed locally without LLM: shell 841 nodes; scripts 654; Go sidecar 962; ODD 122; web 1024 (final guard refreshed). Changed community labels are draft hubs; root aggregate and semantic documentary refresh remain pending, not claimed current. No previously excluded sensitive file scanned.
- Before R4, full prepackage verification PASSED, including 14/14 host native addons and 12 explicit foreign skips; pinned alpha3 untouched. Packaged offline MCP FAILED at 90-second DSH readiness; both owned MCP fixture initialize/list/call exchanges passed. Diagnostics preserved ONLY at `D:/Temp/freecode-mcp-offline-80764-I99knc`. Full packaging gate and installer/static artifact checks NOT RUN: installer build/launch outside this feature's scope. Review and remote delivery pending. Engram mirror prohibited until host registration.

## Acceptance
No OmniRoute feature, dependency, download, sidecar launch or detector endpoint in newly built product; legacy app-owned configuration is safely retired at next startup without harming unrelated settings. Invalid pash calls cannot become an undeclared executable tool; compatible declared bash calls preserve their normal sandbox/approval boundary and durable identity. Existing source/build gates remain enforced.

## Progress / next step
R1 commit: `d73a886`. Authored running count about 2,100 additions/deletions (17,739 generated lock lines excluded). The retirement module is the only retained reference to the removed app-owned route/cache names; tests/docs historical mentions do not enable a feature. No upstream overlay materializations were included in that commit.
R2 commit: `df674ee577` (859 authored additions/deletions). Running feature count about 2,960. The first cached whitespace check flagged Go unified-diff context (space marker before indentation tabs), not Go additions; R3 scopes that formatting attribute to this patch while keeping trailing/blank checks and strict git-apply whitespace validation. No vendor materializations or binaries were committed.
R1/R2 verified and committed (`d73a886`, `df674ee577`, `6376e37648`, `bb81a037f1`). R4 source commit: `14e04506c1`. Running authored count around 3,345 excluding generated dependency locks, before final evidence checkpoint; retain cached single-pr strategy, remote review/sizing not authorized. Existing local source/staged sidecars were already v1.3.8; old installed v1.3.5 log is not proof of current local version mismatch. Sidecar staging now preserves the pash correction without regenerating DSH.

Patch-format corrections do not suppress source checks: Go patch context uses a
scoped indentation attribute; overlay 169's blank context marker was normalized
to an empty context line accepted by git apply, removing its whitespace warning.
Source whitespace and strict replay checks remain enforced. R3 remains open:
these local source fixes are verified, not a green release/package receipt.

Next: generate the changed DSH alpha4 runtime locally before any installer, investigate/close remaining 30-second source CLI readiness and 90-second packaged MCP startup gate failures, then rerun release checks. The stage version failure alpha4 vs alpha3 is intentional stale-artifact protection, not a passed packaging gate. The installed active instance and its alpha3 cache/settings/history remain untouched. No push/tag/release/installer launch or new installer build occurred.

## Persistence
Engram mirror `odd/remove-omniroute-pash/tasks` pending: host runtime registration is unavailable and agent-attributed writes are prohibited. Local document is authoritative; no alternate session ID used.
