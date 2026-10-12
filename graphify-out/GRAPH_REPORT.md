# Graph Report - shell  (2026-10-12)

## Corpus Check
- 80 files · ~58,391 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 794 nodes · 1505 edges · 39 communities (38 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `db16131f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ref_node_path
- harness-updater.ts
- freecode-launcher.ts
- ipc.ts
- model-refresher.ts
- vitest
- uvx-bootstrap.ts
- package.json
- ref_node_fs
- lifecycle-manager.ts
- git-resolver.ts
- embedded-browser.ts
- main/index.ts
- secret-store.ts
- McpReadinessTracker
- logger.ts
- preflight.ts
- properties
- properties
- t
- rdd.ts
- version
- tsconfig.json
- runtime-deps.json
- bootstrap
- i18n.ts
- serena-headless-launcher.py
- createMainWindow
- runtime-deps.schema.json
- properties
- electron
- backend-state.ts
- dialog-bridge.ts
- ensurePackagedHarnessRuntime
- arch
- id
- path
- sha256
- keytar.d.ts

## God Nodes (most connected - your core abstractions)
1. `vitest` - 39 edges
2. `HarnessSupervisor` - 24 edges
3. `t()` - 22 edges
4. `launchHiddenSync()` - 18 edges
5. `LifecycleManager` - 18 edges
6. `createEmbeddedBrowser()` - 17 edges
7. `launchHidden()` - 17 edges
8. `TorManager` - 16 edges
9. `createShellRuntime()` - 14 edges
10. `registerIpc()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `createHarnessArchive()` --calls--> `resolveTarExecutable()`  [EXTRACTED]
  tests/updater.test.ts → src/main/harness-updater.ts
- `createDialogBridge()` --calls--> `t()`  [EXTRACTED]
  src/main/dialog-bridge.ts → src/main/i18n.ts
- `copy()` --calls--> `t()`  [EXTRACTED]
  src/main/embedded-browser.ts → src/main/i18n.ts
- `runLocalUpstreamUpdate()` --calls--> `launchHidden()`  [EXTRACTED]
  src/main/index.ts → src/main/freecode-launcher.ts
- `extractText()` --calls--> `launchHidden()`  [EXTRACTED]
  src/main/ocr.ts → src/main/freecode-launcher.ts

## Import Cycles
- None detected.

## Communities (39 total, 1 thin omitted)

### Community 0 - "ref_node_path"
Cohesion: 0.05
Nodes (31): ext_packages_shared_types_dist_index_js, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_embeddedmcpstate, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_freecodeapi, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleaidoctor, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleairunresponse, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleaistatus, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_ipcpayloads, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_mcpruntimestatus (+23 more)

### Community 1 - "harness-updater.ts"
Cohesion: 0.06
Nodes (39): ref_node_crypto, launchHiddenAndWait(), ensureHarnessRuntime(), EnsureHarnessRuntimeOptions, EnsureHarnessRuntimeResult, readValidatedRuntimeVersion(), assertHarnessRuntimeVersion(), checkHarnessRelease() (+31 more)

### Community 2 - "freecode-launcher.ts"
Cohesion: 0.06
Nodes (43): CAVEMAN_BUNDLED_NAMES, _clearCache(), isCavemanAvailable(), isRtkAvailable(), resolutionCache, resolveCavemanBinary(), resolveRtkBinary(), RTK_BUNDLED_NAMES (+35 more)

### Community 3 - "ipc.ts"
Cohesion: 0.06
Nodes (47): i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_detectedroute, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleairunrequestschema, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleaistatusschema, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_modelcatalogschema, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_workerhandleschema, ref_node_http, getGentleAiStatus(), defaultRendererTargets() (+39 more)

### Community 4 - "model-refresher.ts"
Cohesion: 0.06
Nodes (43): js-yaml, ALWAYS_EXPOSED_MODELS, CatalogModel, endpointUrl(), listModelIds(), loadGatewayReasoningFlags(), ModelCatalog, ModelRefreshError (+35 more)

### Community 5 - "vitest"
Cohesion: 0.04
Nodes (29): ext_scripts_native_addon_target_mjs, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_ipcchannels, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_torstatusschema, i_deepseek_harness_free_code_deepseek_harness_scripts_native_addon_target_classifynativeaddon, ref_node_module, vitest, cliEntry, cliVersion (+21 more)

### Community 6 - "uvx-bootstrap.ts"
Cohesion: 0.06
Nodes (33): ext_scripts_verify_headless_runtime_mjs, i_deepseek_harness_free_code_deepseek_harness_scripts_verify_headless_runtime_verifyheadlessruntime, ref_node_child_process, ref_node_os, ref_node_url, __dirname, downloadArchive(), ensureUvxCommand() (+25 more)

### Community 7 - "package.json"
Cohesion: 0.05
Nodes (38): dependencies, electron-updater, @freecode/opencode-adapter, @freecode/shared-types, js-yaml, pino, semver, zod (+30 more)

### Community 8 - "ref_node_fs"
Cohesion: 0.11
Nodes (19): ref_node_fs, ref_node_net, buildConfig(), findFreePort(), Opencode2apiConfig, sleep(), startOpencode2api(), waitForHealth() (+11 more)

### Community 9 - "lifecycle-manager.ts"
Cohesion: 0.09
Nodes (12): acquireSingletonLock(), GenerationTracker, healthProbe(), HealthProbeResult, isProcessAlive(), LifecycleManager, LifecycleManagerConfig, LifecycleSnapshot (+4 more)

### Community 10 - "git-resolver.ts"
Cohesion: 0.14
Nodes (24): classifyGitError(), findInPath(), getGitVersion(), GIT_ENV_CACHE, GitCommandResult, GitError, GitErrorClass, GitResolveResult (+16 more)

### Community 11 - "embedded-browser.ts"
Cohesion: 0.11
Nodes (21): Action, allowedUrl(), BrowserPublicState, BrowserTab, ChromeCopy, copy(), createEmbeddedBrowser(), handleChromeCommand() (+13 more)

### Community 12 - "main/index.ts"
Cohesion: 0.11
Nodes (18): ext_packages_opencode_adapter_dist_index_js, i_deepseek_harness_free_code_deepseek_harness_packages_opencode_adapter_dist_index_default_pool_size, backendStates, bundledUpstreamCommit(), checkStalePortable(), findNode(), isPortable(), managedWindows (+10 more)

### Community 13 - "secret-store.ts"
Cohesion: 0.18
Nodes (12): ref_keytar, ShellRuntimeConfig, createSecretStore(), ensureSecret(), fileImpl(), machineKey(), readVault(), writeVault() (+4 more)

### Community 14 - "McpReadinessTracker"
Cohesion: 0.19
Nodes (5): McpCallRecord, McpCallStatus, McpReadinessTracker, trimCallRecord(), trimString()

### Community 15 - "logger.ts"
Cohesion: 0.18
Nodes (7): ref_node_stream, pino, AppLogger, createAppLogger(), RotatingDestination, RotatingLoggerOptions, dirs

### Community 16 - "preflight.ts"
Cohesion: 0.24
Nodes (10): awaitHarnessLayout(), criticalPaths(), formatPreflightFailure(), PreflightOptions, PreflightResult, PreflightRetryOptions, readEntries(), verifyBridgeInvariant() (+2 more)

### Community 17 - "properties"
Cohesion: 0.15
Nodes (13): properties, type, type, description, type, type, license, name (+5 more)

### Community 18 - "properties"
Cohesion: 0.17
Nodes (12): items, type, required, type, description, type, properties, dependencies (+4 more)

### Community 19 - "t"
Cohesion: 0.31
Nodes (11): t(), createTray(), mcpTraySummary(), notifyUpdateDownloading(), notifyUpdateInstalling(), presentUpdateResult(), reportMcpStatus(), setUpdateActivity() (+3 more)

### Community 20 - "rdd.ts"
Cohesion: 0.20
Nodes (7): appendRddAudit(), auditLog, hashInput(), RddAuditEntry, RddValidateInput, RddValidateResult, RddVerdict

### Community 21 - "version"
Cohesion: 0.20
Nodes (10): type, commit, source, version, description, type, properties, description (+2 more)

### Community 22 - "tsconfig.json"
Cohesion: 0.22
Nodes (8): ../../tsconfig.base.json, compilerOptions, lib, outDir, rootDir, exclude, extends, include

### Community 23 - "runtime-deps.json"
Cohesion: 0.22
Nodes (8): dependencies, $schema, payloadDir, upstream, commit, source, version, version

### Community 24 - "bootstrap"
Cohesion: 0.25
Nodes (7): buildHarnessExtraEnv(), DialogBridgeEnv, bootstrap(), resourcesDir(), nodeRuntimeEnv(), resolveResourcesDir(), BUNDLE

### Community 25 - "i18n.ts"
Cohesion: 0.31
Nodes (7): I18nKey, initLocale(), locale, setLocale(), strings, zhStrings, applyNativeLocale()

### Community 26 - "serena-headless-launcher.py"
Cohesion: 0.29
Nodes (6): os, _install_windows_direct_launcher(), main(), Run Serena with a Windows-safe direct language-server launcher. Serena's…, subprocess, typing

### Community 27 - "createMainWindow"
Cohesion: 0.32
Nodes (8): checkForUpdates(), createMainWindow(), embeddedBrowserVisible(), ensureUpdateIndicator(), refreshUpdateIndicator(), updateFromIndicator(), updateIsAvailable(), updateUpdateIndicatorBounds()

### Community 28 - "runtime-deps.schema.json"
Cohesion: 0.29
Nodes (6): type, description, required, $schema, title, type

### Community 29 - "properties"
Cohesion: 0.29
Nodes (7): properties, required, type, args, cwd, launch, type

### Community 30 - "electron"
Cohesion: 0.33
Nodes (6): electron, buildMenu(), createOverlayWindow(), escapeOverlayHtml(), openOverlay(), renderOverlayHtml()

### Community 31 - "backend-state.ts"
Cohesion: 0.40
Nodes (4): BackendState, shouldNotifyBackendState(), reportBackendState(), reportModelRefreshFailure()

### Community 32 - "dialog-bridge.ts"
Cohesion: 0.47
Nodes (4): createDialogBridge(), DialogBridge, readBody(), reply()

### Community 33 - "ensurePackagedHarnessRuntime"
Cohesion: 0.33
Nodes (6): readHarnessRuntimeRequirements(), closeSplash(), createSplashWindow(), ensurePackagedHarnessRuntime(), trackManagedWindow(), updateSplashStatus()

### Community 34 - "arch"
Cohesion: 0.50
Nodes (4): description, enum, type, arch

### Community 35 - "id"
Cohesion: 0.50
Nodes (4): description, pattern, type, id

### Community 36 - "path"
Cohesion: 0.67
Nodes (3): description, type, path

### Community 37 - "sha256"
Cohesion: 0.67
Nodes (3): sha256, description, type

## Knowledge Gaps
- **251 isolated node(s):** `name`, `version`, `private`, `description`, `type` (+246 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 373 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `ref_node_path`, `harness-updater.ts`, `freecode-launcher.ts`, `ipc.ts`, `model-refresher.ts`, `uvx-bootstrap.ts`, `package.json`, `ref_node_fs`, `lifecycle-manager.ts`, `git-resolver.ts`, `main/index.ts`, `secret-store.ts`, `McpReadinessTracker`, `logger.ts`, `preflight.ts`, `bootstrap`, `i18n.ts`, `backend-state.ts`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `electron` connect `electron` to `dialog-bridge.ts`, `ref_node_path`, `ipc.ts`, `package.json`, `lifecycle-manager.ts`, `embedded-browser.ts`, `main/index.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _251 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ref_node_path` be split into smaller, more focused modules?**
  _Cohesion score 0.05257936507936508 - nodes in this community are weakly interconnected._
- **Should `harness-updater.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05593220338983051 - nodes in this community are weakly interconnected._
- **Should `freecode-launcher.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05513784461152882 - nodes in this community are weakly interconnected._
- **Should `ipc.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06127946127946128 - nodes in this community are weakly interconnected._