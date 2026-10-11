# Graph Report - shell  (2026-10-11)

## Corpus Check
- 67 files · ~50,743 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 713 nodes · 1351 edges · 34 communities (33 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `776dbe7a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main/index.ts
- ref_node_fs
- model-refresher.ts
- ref_node_path
- ipc.ts
- package.json
- harness-updater.ts
- lifecycle-manager.ts
- git-resolver.ts
- embedded-browser.ts
- mcp-home.ts
- gentle-ai.ts
- HarnessSupervisor
- tor-manager.ts
- vitest
- freecode-launcher.ts
- McpReadinessTracker
- properties
- properties
- caveman-resolver.ts
- harness-supervisor.ts
- rdd.ts
- version
- tsconfig.json
- runtime-deps.json
- serena-headless-launcher.py
- runtime-deps.schema.json
- properties
- gentle-ai-resolver.ts
- arch
- id
- path
- sha256
- keytar.d.ts

## God Nodes (most connected - your core abstractions)
1. `vitest` - 28 edges
2. `HarnessSupervisor` - 24 edges
3. `t()` - 21 edges
4. `launchHiddenSync()` - 20 edges
5. `LifecycleManager` - 18 edges
6. `createEmbeddedBrowser()` - 17 edges
7. `launchHidden()` - 16 edges
8. `TorManager` - 16 edges
9. `createShellRuntime()` - 14 edges
10. `registerIpc()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `resolveCavemanBinary()` --calls--> `launchHiddenSync()`  [EXTRACTED]
  src/main/caveman-resolver.ts → src/main/freecode-launcher.ts
- `resolveRtkBinary()` --calls--> `launchHiddenSync()`  [EXTRACTED]
  src/main/caveman-resolver.ts → src/main/freecode-launcher.ts
- `copy()` --calls--> `t()`  [EXTRACTED]
  src/main/embedded-browser.ts → src/main/i18n.ts
- `runGentleAi()` --calls--> `launchHidden()`  [EXTRACTED]
  src/main/gentle-ai.ts → src/main/freecode-launcher.ts
- `runGentleAiDoctor()` --calls--> `launchHidden()`  [EXTRACTED]
  src/main/gentle-ai.ts → src/main/freecode-launcher.ts

## Import Cycles
- None detected.

## Communities (34 total, 1 thin omitted)

### Community 0 - "main/index.ts"
Cohesion: 0.06
Nodes (59): ext_packages_opencode_adapter_dist_index_js, i_deepseek_harness_free_code_deepseek_harness_packages_opencode_adapter_dist_index_default_pool_size, electron, BackendState, shouldNotifyBackendState(), createDialogBridge(), DialogBridge, readBody() (+51 more)

### Community 1 - "ref_node_fs"
Cohesion: 0.06
Nodes (34): ref_keytar, ref_node_fs, ref_node_net, buildHarnessExtraEnv(), DialogBridgeEnv, HarnessInstance, bootstrap(), IpcDeps (+26 more)

### Community 2 - "model-refresher.ts"
Cohesion: 0.06
Nodes (43): js-yaml, ALWAYS_EXPOSED_MODELS, CatalogModel, endpointUrl(), listModelIds(), loadGatewayReasoningFlags(), ModelCatalog, ModelRefreshError (+35 more)

### Community 3 - "ref_node_path"
Cohesion: 0.06
Nodes (36): ref_node_os, ref_node_path, ref_node_stream, pino, AppLogger, createAppLogger(), RotatingDestination, RotatingLoggerOptions (+28 more)

### Community 4 - "ipc.ts"
Cohesion: 0.06
Nodes (39): ext_packages_shared_types_dist_index_js, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_detectedroute, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_embeddedmcpstate, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_freecodeapi, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleaidoctor, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleairunrequestschema, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleairunresponse, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleaistatus (+31 more)

### Community 5 - "package.json"
Cohesion: 0.05
Nodes (38): dependencies, electron-updater, @freecode/opencode-adapter, @freecode/shared-types, js-yaml, pino, zod, description (+30 more)

### Community 6 - "harness-updater.ts"
Cohesion: 0.09
Nodes (24): checkHarnessRelease(), createHarnessUpdater(), GitHubRelease, GitHubReleaseAsset, harnessAssetName(), harnessPlatform(), HarnessUpdateInfo, HarnessUpdaterAdapter (+16 more)

### Community 7 - "lifecycle-manager.ts"
Cohesion: 0.09
Nodes (12): acquireSingletonLock(), GenerationTracker, healthProbe(), HealthProbeResult, isProcessAlive(), LifecycleManager, LifecycleManagerConfig, LifecycleSnapshot (+4 more)

### Community 8 - "git-resolver.ts"
Cohesion: 0.14
Nodes (24): classifyGitError(), findInPath(), getGitVersion(), GIT_ENV_CACHE, GitCommandResult, GitError, GitErrorClass, GitResolveResult (+16 more)

### Community 9 - "embedded-browser.ts"
Cohesion: 0.11
Nodes (21): Action, allowedUrl(), BrowserPublicState, BrowserTab, ChromeCopy, copy(), createEmbeddedBrowser(), handleChromeCommand() (+13 more)

### Community 10 - "mcp-home.ts"
Cohesion: 0.13
Nodes (25): ref_node_url, BASE_SERVER_DEFINITIONS, defaultConfig(), definitions(), __dirname, EMBEDDED_MCP_CONFIG_VERSION, EmbeddedMcpConfig, embeddedMcpEnvironment() (+17 more)

### Community 11 - "gentle-ai.ts"
Cohesion: 0.11
Nodes (16): killProcessTree(), GENTLE_AI_INPUT_CAP, GENTLE_AI_MIN_TIMEOUT_MS, GENTLE_AI_OUTPUT_CAP, GENTLE_AI_PRESET_INVARIANTS, GENTLE_AI_TIMEOUT_MS, GentleAiDoctorCheck, GentleAiDoctorResult (+8 more)

### Community 12 - "HarnessSupervisor"
Cohesion: 0.17
Nodes (3): HarnessSupervisor, waitForExit(), writeConsoleDiagnostic()

### Community 13 - "tor-manager.ts"
Cohesion: 0.20
Nodes (6): findFreePort(), isPortFree(), sleep(), TorManager, TorManagerConfig, TorManagerStatus

### Community 14 - "vitest"
Cohesion: 0.12
Nodes (10): ref_node_module, vitest, cliEntry, cliVersion, electronPath, require, vendorRoot, BoundsRouter (+2 more)

### Community 15 - "freecode-launcher.ts"
Cohesion: 0.16
Nodes (13): activeLaunches, HIDDEN_OPTIONS, HIDDEN_SYNC_OPTIONS, isFilePath(), LaunchError, LaunchErrorClass, launchHidden(), launchHiddenSync() (+5 more)

### Community 16 - "McpReadinessTracker"
Cohesion: 0.19
Nodes (5): McpCallRecord, McpCallStatus, McpReadinessTracker, trimCallRecord(), trimString()

### Community 17 - "properties"
Cohesion: 0.15
Nodes (13): properties, type, type, description, type, type, license, name (+5 more)

### Community 18 - "properties"
Cohesion: 0.17
Nodes (12): items, type, required, type, description, type, properties, dependencies (+4 more)

### Community 19 - "caveman-resolver.ts"
Cohesion: 0.27
Nodes (9): CAVEMAN_BUNDLED_NAMES, _clearCache(), isCavemanAvailable(), isRtkAvailable(), resolutionCache, resolveCavemanBinary(), resolveRtkBinary(), RTK_BUNDLED_NAMES (+1 more)

### Community 20 - "harness-supervisor.ts"
Cohesion: 0.24
Nodes (7): ref_node_child_process, DSH_WEB_ARGS, HarnessStatus, HarnessSupervisorConfig, HIDDEN_CHILD_PROCESS_OPTIONS, CLI_ENTRY, VENDOR

### Community 21 - "rdd.ts"
Cohesion: 0.20
Nodes (7): appendRddAudit(), auditLog, hashInput(), RddAuditEntry, RddValidateInput, RddValidateResult, RddVerdict

### Community 22 - "version"
Cohesion: 0.20
Nodes (10): type, commit, source, version, description, type, properties, description (+2 more)

### Community 23 - "tsconfig.json"
Cohesion: 0.22
Nodes (8): ../../tsconfig.base.json, compilerOptions, lib, outDir, rootDir, exclude, extends, include

### Community 24 - "runtime-deps.json"
Cohesion: 0.22
Nodes (8): dependencies, $schema, payloadDir, upstream, commit, source, version, version

### Community 25 - "serena-headless-launcher.py"
Cohesion: 0.29
Nodes (6): os, _install_windows_direct_launcher(), main(), Run Serena with a Windows-safe direct language-server launcher. Serena's…, subprocess, typing

### Community 26 - "runtime-deps.schema.json"
Cohesion: 0.29
Nodes (6): type, description, required, $schema, title, type

### Community 27 - "properties"
Cohesion: 0.29
Nodes (7): properties, required, type, args, cwd, launch, type

### Community 28 - "gentle-ai-resolver.ts"
Cohesion: 0.33
Nodes (5): getGentleAiStatus(), GENTLE_AI_BUNDLED_NAMES, isGentleAiAvailable(), resolutionCache, resolveGentleAiBinary()

### Community 29 - "arch"
Cohesion: 0.50
Nodes (4): description, enum, type, arch

### Community 30 - "id"
Cohesion: 0.50
Nodes (4): description, pattern, type, id

### Community 31 - "path"
Cohesion: 0.67
Nodes (3): description, type, path

### Community 32 - "sha256"
Cohesion: 0.67
Nodes (3): sha256, description, type

## Knowledge Gaps
- **219 isolated node(s):** `name`, `version`, `private`, `description`, `type` (+214 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 326 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `main/index.ts`, `ref_node_fs`, `model-refresher.ts`, `ref_node_path`, `ipc.ts`, `package.json`, `harness-updater.ts`, `lifecycle-manager.ts`, `git-resolver.ts`, `mcp-home.ts`, `tor-manager.ts`, `McpReadinessTracker`, `caveman-resolver.ts`, `harness-supervisor.ts`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `electron` connect `main/index.ts` to `embedded-browser.ts`, `ipc.ts`, `package.json`, `lifecycle-manager.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `HarnessSupervisor` connect `HarnessSupervisor` to `ref_node_fs`, `harness-supervisor.ts`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _219 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05829420970266041 - nodes in this community are weakly interconnected._
- **Should `ref_node_fs` be split into smaller, more focused modules?**
  _Cohesion score 0.06363636363636363 - nodes in this community are weakly interconnected._
- **Should `model-refresher.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06464646464646465 - nodes in this community are weakly interconnected._