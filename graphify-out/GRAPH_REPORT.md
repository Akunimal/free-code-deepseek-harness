# Graph Report - shell  (2026-10-12)

## Corpus Check
- 78 files · ~57,397 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 774 nodes · 1477 edges · 42 communities (41 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Main Process and Windows
- CLI Tool Resolution
- Model Catalog and Providers
- Runtime Bootstrap and Updates
- Secrets and Tor Lifecycle
- Shell Dependencies
- Harness Supervision
- Application Lifecycle Management
- Git Discovery and Diagnostics
- Embedded Browser
- MCP Home Configuration
- IPC and OCR Contracts
- UVX Bootstrap
- Tor Networking
- OpenCode API Gateway
- Preload API Contracts
- MCP Readiness Tracking
- Startup Preflight
- Runtime Manifest Schema
- Runtime Compatibility Tests
- Manifest Item Schema
- RDD Audit Logging
- Runtime Manifest Metadata
- DSH Node Runtime Tests
- Application Logging
- TypeScript Build Configuration
- Runtime Dependency Manifest
- Packaged Shell Bootstrap Tests
- Route Detection
- Headless Serena Launcher
- Runtime Package Policy Tests
- Schema Field Descriptors
- Runtime Argument Schema
- Window and Tray Behavior
- Packaged Electron Tests
- Harness Environment Bridge
- Tor IPC Contracts
- Architecture Enumeration
- Runtime Identifier Validation
- Runtime Payload Paths
- Runtime Checksum Validation
- Native Keytar Types

## God Nodes (most connected - your core abstractions)
1. `vitest` - 36 edges
2. `HarnessSupervisor` - 24 edges
3. `t()` - 22 edges
4. `launchHiddenSync()` - 20 edges
5. `LifecycleManager` - 18 edges
6. `createEmbeddedBrowser()` - 17 edges
7. `TorManager` - 16 edges
8. `launchHidden()` - 16 edges
9. `createShellRuntime()` - 14 edges
10. `ShellRuntime` - 12 edges

## Surprising Connections (you probably didn't know these)
- `createHarnessArchive()` --calls--> `resolveTarExecutable()`  [EXTRACTED]
  tests/updater.test.ts → src/main/harness-updater.ts
- `ShellRuntime` --references--> `Opencode2apiInstance`  [EXTRACTED]
  src/main/runtime.ts → src/main/opencode2api.ts
- `UpdateServiceOptions` --references--> `HarnessUpdaterAdapter`  [EXTRACTED]
  src/main/updater.ts → src/main/harness-updater.ts
- `ShellRuntime` --references--> `HarnessSupervisor`  [EXTRACTED]
  src/main/runtime.ts → src/main/harness-supervisor.ts
- `ShellRuntimeConfig` --references--> `SecretStore`  [EXTRACTED]
  src/main/runtime.ts → src/main/secret-store.ts

## Import Cycles
- None detected.

## Communities (42 total, 1 thin omitted)

### Community 0 - "Main Process and Windows"
Cohesion: 0.05
Nodes (67): ext_packages_opencode_adapter_dist_index_js, i_deepseek_harness_free_code_deepseek_harness_packages_opencode_adapter_dist_index_default_pool_size, electron, BackendState, shouldNotifyBackendState(), createDialogBridge(), DialogBridge, readBody() (+59 more)

### Community 1 - "CLI Tool Resolution"
Cohesion: 0.06
Nodes (42): CAVEMAN_BUNDLED_NAMES, _clearCache(), isCavemanAvailable(), isRtkAvailable(), resolutionCache, resolveCavemanBinary(), resolveRtkBinary(), RTK_BUNDLED_NAMES (+34 more)

### Community 2 - "Model Catalog and Providers"
Cohesion: 0.06
Nodes (43): js-yaml, ALWAYS_EXPOSED_MODELS, CatalogModel, endpointUrl(), listModelIds(), loadGatewayReasoningFlags(), ModelCatalog, ModelRefreshError (+35 more)

### Community 3 - "Runtime Bootstrap and Updates"
Cohesion: 0.06
Nodes (37): ref_node_crypto, ref_node_stream, ensureHarnessRuntime(), EnsureHarnessRuntimeOptions, EnsureHarnessRuntimeResult, readValidatedRuntimeVersion(), assertHarnessRuntimeVersion(), checkHarnessRelease() (+29 more)

### Community 4 - "Secrets and Tor Lifecycle"
Cohesion: 0.08
Nodes (18): ref_keytar, bootstrap(), IpcDeps, createShellRuntime(), ShellRuntime, ShellRuntimeConfig, createSecretStore(), ensureSecret() (+10 more)

### Community 5 - "Shell Dependencies"
Cohesion: 0.05
Nodes (38): dependencies, electron-updater, @freecode/opencode-adapter, @freecode/shared-types, js-yaml, pino, semver, zod (+30 more)

### Community 6 - "Harness Supervision"
Cohesion: 0.11
Nodes (11): ref_node_child_process, DSH_WEB_ARGS, HarnessStatus, HarnessSupervisor, HarnessSupervisorConfig, HIDDEN_CHILD_PROCESS_OPTIONS, killTree(), waitForExit() (+3 more)

### Community 7 - "Application Lifecycle Management"
Cohesion: 0.09
Nodes (12): acquireSingletonLock(), GenerationTracker, healthProbe(), HealthProbeResult, isProcessAlive(), LifecycleManager, LifecycleManagerConfig, LifecycleSnapshot (+4 more)

### Community 8 - "Git Discovery and Diagnostics"
Cohesion: 0.15
Nodes (24): classifyGitError(), findInPath(), getGitVersion(), GIT_ENV_CACHE, GitCommandResult, GitError, GitErrorClass, GitResolveResult (+16 more)

### Community 9 - "Embedded Browser"
Cohesion: 0.11
Nodes (21): Action, allowedUrl(), BrowserPublicState, BrowserTab, ChromeCopy, copy(), createEmbeddedBrowser(), handleChromeCommand() (+13 more)

### Community 10 - "MCP Home Configuration"
Cohesion: 0.13
Nodes (24): BASE_SERVER_DEFINITIONS, defaultConfig(), definitions(), __dirname, EMBEDDED_MCP_CONFIG_VERSION, EmbeddedMcpConfig, embeddedMcpEnvironment(), EmbeddedMcpOptions (+16 more)

### Community 11 - "IPC and OCR Contracts"
Cohesion: 0.15
Nodes (16): i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleairunrequestschema, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleaistatusschema, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_modelcatalogschema, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_workerhandleschema, defaultRendererTargets(), LocaleSetPayloadSchema, McpSetEnabledPayloadSchema, OcrPayloadSchema (+8 more)

### Community 12 - "UVX Bootstrap"
Cohesion: 0.16
Nodes (17): __dirname, downloadArchive(), ensureUvxCommand(), extractZip(), __filename, findExtractedExecutable(), firstPathExecutable(), installManagedUvxAsync() (+9 more)

### Community 13 - "Tor Networking"
Cohesion: 0.18
Nodes (10): ref_node_fs, ref_node_os, ref_node_path, findFreePort(), isPortFree(), TorManagerConfig, TorManagerStatus, compatibleRequirements (+2 more)

### Community 14 - "OpenCode API Gateway"
Cohesion: 0.18
Nodes (14): ref_node_net, buildConfig(), findFreePort(), Opencode2apiConfig, Opencode2apiInstance, sleep(), startOpencode2api(), waitForHealth() (+6 more)

### Community 15 - "Preload API Contracts"
Cohesion: 0.13
Nodes (15): i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_embeddedmcpstate, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_freecodeapi, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleaidoctor, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleairunresponse, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_gentleaistatus, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_ipcpayloads, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_mcpruntimestatus, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_modelcatalog (+7 more)

### Community 16 - "MCP Readiness Tracking"
Cohesion: 0.19
Nodes (5): McpCallRecord, McpCallStatus, McpReadinessTracker, trimCallRecord(), trimString()

### Community 17 - "Startup Preflight"
Cohesion: 0.24
Nodes (10): awaitHarnessLayout(), criticalPaths(), formatPreflightFailure(), PreflightOptions, PreflightResult, PreflightRetryOptions, readEntries(), verifyBridgeInvariant() (+2 more)

### Community 18 - "Runtime Manifest Schema"
Cohesion: 0.15
Nodes (13): properties, type, type, description, type, type, license, name (+5 more)

### Community 19 - "Runtime Compatibility Tests"
Cohesion: 0.17
Nodes (8): ext_scripts_verify_headless_runtime_mjs, i_deepseek_harness_free_code_deepseek_harness_scripts_verify_headless_runtime_verifyheadlessruntime, ref_node_url, manifestVerifier, roots, runtimePackager, runtimeRoot, shellRoot

### Community 20 - "Manifest Item Schema"
Cohesion: 0.17
Nodes (12): items, type, required, type, description, type, properties, dependencies (+4 more)

### Community 21 - "RDD Audit Logging"
Cohesion: 0.20
Nodes (7): appendRddAudit(), auditLog, hashInput(), RddAuditEntry, RddValidateInput, RddValidateResult, RddVerdict

### Community 22 - "Runtime Manifest Metadata"
Cohesion: 0.20
Nodes (10): type, commit, source, version, description, type, properties, description (+2 more)

### Community 23 - "DSH Node Runtime Tests"
Cohesion: 0.22
Nodes (8): ref_node_module, cliEntry, cliVersion, dshNativeInternalModules, dshRuntimeRoot, electronPath, require, vendorRoot

### Community 24 - "Application Logging"
Cohesion: 0.28
Nodes (4): pino, createAppLogger(), RotatingDestination, RotatingLoggerOptions

### Community 25 - "TypeScript Build Configuration"
Cohesion: 0.22
Nodes (8): ../../tsconfig.base.json, compilerOptions, lib, outDir, rootDir, exclude, extends, include

### Community 26 - "Runtime Dependency Manifest"
Cohesion: 0.22
Nodes (8): dependencies, $schema, payloadDir, upstream, commit, source, version, version

### Community 27 - "Packaged Shell Bootstrap Tests"
Cohesion: 0.22
Nodes (6): asar, builderRequire, packagedIndicatorPath, packagedMainPath, roots, shellRequire

### Community 28 - "Route Detection"
Cohesion: 0.32
Nodes (6): i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_detectedroute, ref_node_http, detectLocalRoutes(), DetectorConfig, SCAN_PORTS, scanPort()

### Community 29 - "Headless Serena Launcher"
Cohesion: 0.29
Nodes (6): os, _install_windows_direct_launcher(), main(), Run Serena with a Windows-safe direct language-server launcher. Serena's…, subprocess, typing

### Community 30 - "Runtime Package Policy Tests"
Cohesion: 0.25
Nodes (5): vitest, builderConfig, installedRuntimeScript, installedSmokeScript, runtimeArchiveScript

### Community 31 - "Schema Field Descriptors"
Cohesion: 0.29
Nodes (6): type, description, required, $schema, title, type

### Community 32 - "Runtime Argument Schema"
Cohesion: 0.29
Nodes (7): properties, required, type, args, cwd, launch, type

### Community 33 - "Window and Tray Behavior"
Cohesion: 0.29
Nodes (3): BoundsRouter, TrayShowContext, TrayShowDecision

### Community 34 - "Packaged Electron Tests"
Cohesion: 0.33
Nodes (3): roots, VerifierOptions, VerifierResult

### Community 35 - "Harness Environment Bridge"
Cohesion: 0.50
Nodes (3): buildHarnessExtraEnv(), DialogBridgeEnv, BUNDLE

### Community 36 - "Tor IPC Contracts"
Cohesion: 0.50
Nodes (3): ext_packages_shared_types_dist_index_js, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_ipcchannels, i_deepseek_harness_free_code_deepseek_harness_packages_shared_types_dist_index_torstatusschema

### Community 37 - "Architecture Enumeration"
Cohesion: 0.50
Nodes (4): description, enum, type, arch

### Community 38 - "Runtime Identifier Validation"
Cohesion: 0.50
Nodes (4): description, pattern, type, id

### Community 39 - "Runtime Payload Paths"
Cohesion: 0.67
Nodes (3): description, type, path

### Community 40 - "Runtime Checksum Validation"
Cohesion: 0.67
Nodes (3): sha256, description, type

## Knowledge Gaps
- **245 isolated node(s):** `I18nKey`, `UpdateActivity`, `LaunchErrorClass`, `LaunchOptions`, `LaunchResult` (+240 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 359 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `Runtime Package Policy Tests` to `Main Process and Windows`, `CLI Tool Resolution`, `Model Catalog and Providers`, `Runtime Bootstrap and Updates`, `Secrets and Tor Lifecycle`, `Shell Dependencies`, `Harness Supervision`, `Application Lifecycle Management`, `Git Discovery and Diagnostics`, `MCP Home Configuration`, `UVX Bootstrap`, `Tor Networking`, `OpenCode API Gateway`, `MCP Readiness Tracking`, `Startup Preflight`, `Runtime Compatibility Tests`, `DSH Node Runtime Tests`, `Packaged Shell Bootstrap Tests`, `Route Detection`, `Window and Tray Behavior`, `Packaged Electron Tests`, `Harness Environment Bridge`, `Tor IPC Contracts`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Why does `electron` connect `Main Process and Windows` to `Shell Dependencies`, `Application Lifecycle Management`, `Embedded Browser`, `IPC and OCR Contracts`, `Preload API Contracts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `HarnessSupervisor` connect `Harness Supervision` to `Secrets and Tor Lifecycle`, `Tor Networking`, `Preload API Contracts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `I18nKey`, `UpdateActivity`, `LaunchErrorClass` to the rest of the system?**
  _245 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Main Process and Windows` be split into smaller, more focused modules?**
  _Cohesion score 0.052160493827160495 - nodes in this community are weakly interconnected._
- **Should `CLI Tool Resolution` be split into smaller, more focused modules?**
  _Cohesion score 0.05649350649350649 - nodes in this community are weakly interconnected._
- **Should `Model Catalog and Providers` be split into smaller, more focused modules?**
  _Cohesion score 0.06464646464646465 - nodes in this community are weakly interconnected._