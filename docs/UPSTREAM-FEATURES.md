# DeepSeek Harness feature inventory

This is the exhaustive inventory of upstream surfaces shipped through the bundled `dsh web` application in this repository. The first sections explain the user-facing client/web surfaces; the package index below covers every declared package under `vendor/deepseek-harness/packages`, including host, runtime, storage, tools, providers, adapters and test-support modules. A contract test fails when a new upstream package appears without an entry here.

## Client/runtime foundations

| Package | Capability exposed in the web harness |
|---|---|
| `connection` | HTTP-up/WebSocket-down connection controller with reconnect handling. |
| `hmr` | Development-only hot reload for script-loaded client entries. |
| `locale` | Host-backed English/Chinese/Spanish preference, browser fallback, and typed dictionaries. |
| `modules` | Client module table and `window.__DSH_BOOT__` plugin graph loading. |
| `runtime` | Slot registry, session runtime, scope tree, and object layer. |
| `schema-form` | Schema rehydration, immutable draft editing, validation, and settings form data. |
| `web` | Web shell kernel, two-stage boot, module seed table, app gate, and assembly entry. |
| `web-react` | React slot renderer, session provider, snapshot selectors, and invocation glue. |

## Conversation and workspace experience

| Package | Capability exposed in the web harness |
|---|---|
| `ui-conversation` | New-session hero, workspace-aware composer, ordered conversation timeline, streaming assistant/user messages, tool rows, reasoning, errors, retries, compaction, approvals, questions, queue, history paging, details, and scroll preservation. |
| `ui-layout` | Three-column shell, navigation/panel state, and drag handles. |
| `ui-sidebar` | Session tree, nested subagents, search, grouping, and running/state indicators. |
| `ui-workspace` | Workspace picker in the sidebar and empty-state hero. |
| `ui-directory-picker-browse` | In-app directory browser and creation flow. |
| `ui-directory-picker-native` | Native OS directory chooser integration. |
| `ui-subagent` | Subagent catalog, continuation routing, and `@` reference source. |
| `ui-trajectory` | Interactive event ledger and timing overview. |
| `ui-jobs` | Session-header background-job registry and live job state. |
| `ui-workflow-run` | Durable workflow-run conversation nodes and nested member disclosure. |
| `ui-deliverables` | Produced-file turn tail and clickable final-response file references. |
| `ui-goal` | Session goal dock above the composer and goal projection. |
| `ui-plan` | Plan-mode control, plan projection, and `/plan` command channel. |
| `ui-user-questions` | `ask_user_question` tool mount and composer takeover. |
| `ui-permission-presets` | General default permissions and current-session `/permission` picker. |
| `ui-tool` | Keyed tool-call tree and per-tool presentation slots. |
| `ui-message-feedback` | Per-message assistant feedback actions backed by the host remote. |

## Input, content, and settings

| Package | Capability exposed in the web harness |
|---|---|
| `ui-commands` | Slash command source, directory cache, command popup, and multiple command UI kinds. |
| `ui-input-trigger` | `/` and `@` detection, candidate menu, and registered-source routing. |
| `ui-model-selection` | Model popup and session model selection. |
| `ui-agent-preset` | Default preset, current-session seat, and preset composition editor. |
| `ui-attachment` | Draft image rail, message image gallery, and original-image lightbox. |
| `ui-primitives` | Shared controls, icons, markdown renderer, and JSON inspector atoms. |
| `ui-skill` | Web skill references and the dedicated skill tool row. |
| `ui-slots` | Slot declarations, composition API, shared props, and renderer seams. |
| `ui-settings` | Settings namespace service and canonical settings slot contract. |
| `ui-settings-general` | General settings, onboarding copy, shell trigger/header, dictionaries, and versioned welcome notice. |
| `ui-settings-models` | Model settings, provider credential joins, and onboarding dialogs. |
| `ui-settings-plugins` | Configurable host-plane plugin cards and feature-owned settings tabs. |
| `ui-settings-plugin-inventory` | Read-only Cordis Loader inventory in Web Plugins settings. |
| `ui-theme` | Light/dark/system theme runtime, token sheets, and Appearance settings. |

## Web capability providers

| Package | Capability exposed in the harness |
|---|---|
| `web` | Provider registry, search/fetch seam, request/result vocabulary, and typed web errors. |
| `tool-web` | Model-facing `web_search` and `web_fetch` tools. |
| `web-fetch-http` | Anonymous public HTTP(S) fetch provider. |
| `web-search-deepseek` | DeepSeek-backed native web search provider. |
| `web-search-exa` | Exa-backed search provider. |
| `web-search-perplexity` | Perplexity-backed search provider. |

## Complete upstream package index

The following list is taken from each package's own `package.json` description and includes its source path. Some entries are implementation seams rather than visible buttons, but they are still part of the shipped harness closure and are documented here so their purpose is not hidden.

+- **@deepseek-ai/dsh-acp** (packages/acp/acp) — Automation-only Agent Client Protocol server for driving DeepSeek Harness agents over JSON-RPC stdio
- **@deepseek-ai/dsh-api-gateway** (packages/api/gateway) — Typert Remote Host dispatcher and Client API endpoint
- **@deepseek-ai/dsh-api-remotes** (packages/api/remotes) — Remote BFF assembly and Host Agent/Session lookup policy
- **@deepseek-ai/dsh-attachment** (packages/attachment/attachment) — Durable immutable attachment storage seam for the DeepSeek Harness
- **@deepseek-ai/dsh-attachment-local** (packages/attachment/attachment-local) — Private content-addressed DSH_HOME attachment storage
- **@deepseek-ai/dsh-app-boot** (packages/boot/app-boot) — Shared boot glue for the app bins: .env loading, fail-loud Loader guards, snapshot-aware config resolution, and the Loader boot sequence
- **@deepseek-ai/dsh-cmdline** (packages/boot/cmdline) — Immutable command-line handoff from a dsh launcher to any app plugin that injects cmdlineArgs
- **@deepseek-ai/dsh-base** (packages/bundle/base) — The shared dsh core as a profile bundle: every profile's first patch layer, inserting the base plugin rows over the empty profile root
- **@deepseek-ai/dsh-headless** (packages/bundle/headless) — The dsh one-shot bundle: a direct core Agent/Session runner over dsh-base with no Host, HTTP, or browser layer
- **@deepseek-ai/dsh-web-app** (packages/bundle/web-app) — The dsh browser-surface bundle: the web patch layer over dsh-base plus the runtime glue plugin (frontend dist serving, web-surface prompt, bash runtime variables, URL line)
- **@deepseek-ai/dsh-client-connection** (packages/client/connection) — Wire consumer layer: HTTP-up/WebSocket-down client, ConnectionController dual streams with reconnect, and fixture api
- **@deepseek-ai/dsh-client-hmr** (packages/client/hmr) — Dev-only hot-reload driver for script-loaded client entries: SSE rebuilt frames → invalidate/prefetch → fiber swap through the vendored Loader entry
- **@deepseek-ai/dsh-client-locale** (packages/client/locale) — Locale plugin: Host-backed zh/en/es preference, browser-derived fallback, locale snapshots, and typed namespace dictionaries
- **@deepseek-ai/dsh-client-modules** (packages/client/modules) — Client module system, dual-face: node half composes the __DSH_BOOT__ entry graph (incremental dsh.client scan, bundle route, index tap, webPlugins service); browser half is the lazy-CJS module table the vendored cordis Loader consumes as its internal seam
- **@deepseek-ai/dsh-client-runtime** (packages/client/runtime) — Client core services: SlotRegistry, SessionRuntime (scope tree + object layer)
- **@deepseek-ai/dsh-client-schema-form** (packages/client/schema-form) — Schema/draft model layer for settings editors: rehydrates a serialized schemastery schema, validates drafts, and edits them immutably by path
- **@deepseek-ai/dsh-client-ui-agent-preset** (packages/client/ui-agent-preset) — Agent-preset surfaces: the default for later sessions, this session's seat, and the composition editor
- **@deepseek-ai/dsh-client-ui-attachment** (packages/client/ui-attachment) — Pure React attachment atoms for the dsh web UI: draft-image rail, message image gallery, and original-image lightbox (zero cordis)
- **@deepseek-ai/dsh-client-ui-brand-official** (packages/client/ui-brand-official) — Official DeepSeek Harness brand occupants for the Web client's sidebar and conversation Hero slots
- **@deepseek-ai/dsh-client-ui-commands** (packages/client/ui-commands) — Client command surface: global directory cache, '/' source, three command UI kinds, popupSelect registry
- **@deepseek-ai/dsh-client-ui-conversation** (packages/client/ui-conversation) — Conversation domain: skeleton, ordered chat flow, composer with the Host-backed busy-Enter preference, and details host
- **@deepseek-ai/dsh-client-ui-deliverables** (packages/client/ui-deliverables) — Produced-files turn tail and clickable final-response file references for Web
- **@deepseek-ai/dsh-client-ui-directory-picker-browse** (packages/client/ui-directory-picker-browse) — In-app directory browsing surface: the workspace directory-flow owner rendering the host's listing and creation primitives
- **@deepseek-ai/dsh-client-ui-directory-picker-native** (packages/client/ui-directory-picker-native) — Native directory-picker surface: the renderless workspace directory-flow occupant driving the host's OS chooser
- **@deepseek-ai/dsh-client-ui-goal** (packages/client/ui-goal) — Session goal surface: GoalBar docked above the composer, read from the goal session projection
- **@deepseek-ai/dsh-client-ui-input-trigger** (packages/client/ui-input-trigger) — Input trigger pipeline: '/' and '@' detection, candidate menu, pick routing to registered sources
- **@deepseek-ai/dsh-client-ui-jobs** (packages/client/ui-jobs) — Session-header background-job list: live registry state mirrored from session/jobs frames
- **@deepseek-ai/dsh-client-ui-layout** (packages/client/ui-layout) — Shell plugin: three-column AppFrame with drag handles, ctx.layout viewing-state service (navigation + panels)
- **@deepseek-ai/dsh-client-ui-message-feedback** (packages/client/ui-message-feedback) — Per-message feedback controls contributed to the assistant-message action strip, backed by the messageFeedback Host Remote
- **@deepseek-ai/dsh-client-ui-model-selection** (packages/client/ui-model-selection) — Model selection: the /model popupSelect over session.models / session.selectModel
- **@deepseek-ai/dsh-client-ui-reference** (packages/client/ui-reference) — Unified Web @file and @session reference source
- **@deepseek-ai/dsh-client-ui-permission-presets** (packages/client/ui-permission-presets) — Permission surfaces: a new-session default in General settings and a current-session /permission popup over the permissions projection
- **@deepseek-ai/dsh-client-ui-plan** (packages/client/ui-plan) — Plan-mode composer control: the conversation.input.plan seat over the plan projection and the /plan command channel
- **@deepseek-ai/dsh-client-ui-primitives** (packages/client/ui-primitives) — Pure React atoms for the dsh web UI: controls, icons, markdown, and JSON inspectors (zero cordis)
- **@deepseek-ai/dsh-client-ui-renderer** (packages/client/ui-renderer) — Browser UI renderer: React slot bindings, ctx.uiRenderer, and the assembled application root
- **@deepseek-ai/dsh-client-ui-settings** (packages/client/ui-settings) — Settings domain base plugin: the settings-namespace scope service and the canonical settings slot-type contract
- **@deepseek-ai/dsh-client-ui-settings-general** (packages/client/ui-settings-general) — Settings ownerless-copy and product onboarding plugin: the General section, shell trigger/header chrome content, settings dictionaries, and the versioned welcome notice
- **@deepseek-ai/dsh-client-ui-settings-models** (packages/client/ui-settings-models) — Models settings and shared product-onboarding dialogs over existing settings and credential joins
- **@deepseek-ai/dsh-client-ui-settings-plugin-inventory** (packages/client/ui-settings-plugin-inventory) — Read-only Cordis Loader inventory tab in Web Plugins settings
- **@deepseek-ai/dsh-client-ui-settings-plugins** (packages/client/ui-settings-plugins) — Plugins settings section with feature-owned tabs and configurable host-plane plugin cards
- **@deepseek-ai/dsh-client-ui-sidebar** (packages/client/ui-sidebar) — Sidebar plugin: session multi-level tree, search, grouping, state dots
- **@deepseek-ai/dsh-client-ui-skill** (packages/client/ui-skill) — Web skill references and the dedicated skill tool row
- **@deepseek-ai/dsh-client-ui-slots** (packages/client/ui-slots) — Slot registry pure core: SlotMap declaration merging, single register composition API, four-share props types, store-seat types, renderer install seam
- **@deepseek-ai/dsh-client-ui-subagent** (packages/client/ui-subagent) — Subagent conversation catalog, continuation routing UI, and '@' reference source
- **@deepseek-ai/dsh-client-ui-theme** (packages/client/ui-theme) — Theme plugin: Host bootstrap for the pre-plugin palette; DOM-free ThemeRuntime for light/dark/system state; --dsw-* token styles and Appearance settings row
- **@deepseek-ai/dsh-client-ui-tool** (packages/client/ui-tool) — Client Tool call-tree renderer and keyed per-tool presentation slot
- **@deepseek-ai/dsh-client-ui-trajectory** (packages/client/ui-trajectory) — Trajectory event ledger with an interactive timing overview: pure-consumer plugin registering into the conversation ViewMap (no service)
- **@deepseek-ai/dsh-client-ui-user-questions** (packages/client/ui-user-questions) — Web ask_user_question feature: host tool mount plus composer-takeover question UI
- **@deepseek-ai/dsh-client-ui-workflow-run** (packages/client/ui-workflow-run) — Durable workflow-run Conversation Node and nested member disclosure for dsh web
- **@deepseek-ai/dsh-client-ui-workspace** (packages/client/ui-workspace) — Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots
- **@deepseek-ai/dsh-client-web** (packages/client/web) — Web shell kernel: bootWebShell (module system holding + seed table + two-stage boot + AppRoot gate + app-shell assembly entry), consumed by the apps/web vite entry
- **@deepseek-ai/dsh-client-web-react** (packages/client/web-react) — Shell-side React glue: createSlotRenderer, SessionProvider, bindSnapshotSelector (uSES bridge), useInvoke
- **@deepseek-ai/dsh-code-runtime** (packages/code-runtime/code-runtime) — Abstract code-execution seam (ctx.codeRuntime) for the DeepSeek Harness
- **@deepseek-ai/dsh-code-runtime-python** (packages/code-runtime/code-runtime-python) — CPython subprocess implementation of the DeepSeek Harness code-execution seam
- **@deepseek-ai/dsh-code-runtime-worker-thread** (packages/code-runtime/code-runtime-worker-thread) — Worker-thread implementation of the DeepSeek Harness code-execution seam
- **@deepseek-ai/dsh-command-compact** (packages/compaction/command-compact) — Human-facing slash command for explicit session compaction
- **@deepseek-ai/dsh-compaction** (packages/compaction/compaction) — Abstract compaction service seam (ctx.compaction) for the DeepSeek Harness
- **@deepseek-ai/dsh-compaction-basic** (packages/compaction/compaction-basic) — Token-meter-driven compaction policy and LLM summarization backend for the DeepSeek Harness
- **@deepseek-ai/dsh-compaction-tool-result-pruner** (packages/compaction/compaction-tool-result-pruner) — Replay-safe model-free head/middle/tail pruning for tool-result surface nodes
- **@deepseek-ai/dsh-agent-instructions** (packages/context/agent-instructions) — Workspace context loader for AGENTS.md/CLAUDE.md instruction files
- **@deepseek-ai/dsh-file-reference** (packages/context/file-reference) — File-reference discovery contract and shared @file grammar
- **@deepseek-ai/dsh-file-reference-local** (packages/context/file-reference-local) — Local-filesystem ctx.fileReferences provider with bounded fuzzy indexes
- **@deepseek-ai/dsh-session-reference** (packages/context/session-reference) — Cross-session snapshot references and durable untrusted model context (ctx.sessionReferenceResolver)
- **@deepseek-ai/dsh-time-context** (packages/context/time-context) — Opt-in durable per-step context with the current time and elapsed time
- **@deepseek-ai/dsh-tmux-context** (packages/context/tmux-context) — Opt-in durable per-step context with this agent's tmux pane and window location
- **@deepseek-ai/dsh-agent** (packages/core/agent) — Agent interface, registry, initiator scope, and event vocabulary for the DeepSeek Harness
- **@deepseek-ai/dsh-agent-default-model** (packages/core/agent-default-model) — Default model selection shared by Agent entry points
- **@deepseek-ai/dsh-agent-loop** (packages/core/agent-loop) — The concrete agent loop plugin for the DeepSeek Harness
- **@deepseek-ai/dsh-agent-tool-presentation** (packages/core/agent-tool-presentation) — Agent-plane presentation selector: composes one agent's tools as Code Mode, native, or both
- **@deepseek-ai/dsh-scope** (packages/core/scope) — Scoped-context registration primitive (scope tags, scope-filtered event dispatch) for the DeepSeek Harness
- **@deepseek-ai/dsh-session** (packages/core/session) — Event-sourced session store for the DeepSeek Harness
- **@deepseek-ai/dsh-system-prompt** (packages/core/system-prompt) — System prompt assembly registry for the DeepSeek Harness
- **@deepseek-ai/dsh-tools** (packages/core/tools) — Tool registry and execution pipeline for the DeepSeek Harness
- **@deepseek-ai/dsh-credentials** (packages/credentials/credentials) — Abstract credential seam (ctx.credentials): settings carry references to secrets, providers own the values
- **@deepseek-ai/dsh-authorization** (packages/credentials/authorization) — Authorization seam (ctx.authorization): plugin-owned flows that obtain a credential through a conversation with the human
- **@deepseek-ai/dsh-credentials-local** (packages/credentials/credentials-local) — File-backed credentials provider ($DSH_HOME/.env under the live process environment) for the DeepSeek Harness
- **@deepseek-ai/dsh-e2b** (packages/e2b/e2b) — Shared E2B sandbox lifecycle for DeepSeek Harness provider adapters
- **@deepseek-ai/dsh-fs-e2b** (packages/e2b/fs-e2b) — E2B filesystem implementation for DeepSeek Harness
- **@deepseek-ai/dsh-subprocess-e2b** (packages/e2b/subprocess-e2b) — E2B subprocess implementation for DeepSeek Harness
- **@deepseek-ai/dsh-experimental-agent-team** (packages/experimental/agent-team) — Implicit-root Agent Teams roster, durable peer mailbox, and shared task DAG
- **@deepseek-ai/dsh-experimental-tool-agent-team** (packages/experimental/tool-agent-team) — Scoped model-facing Agent Teams tools over ctx.agentTeams
- **@deepseek-ai/dsh-acp-demo** (packages/examples/acp-demo) — ACP automation server app: agent spine + JSONL persistence + ACP transport, with a JSON-RPC stdio bin
- **@deepseek-ai/dsh-agent-spine-demo** (packages/examples/agent-spine-demo) — The default executor-less/UI-less agent spine with fallback session titles, provider-routed retry, and optional persisted goals
- **@deepseek-ai/dsh-sdk-jsonrpc-demo** (packages/examples/jsonrpc-demo) — Bin that boots an external Cordis config for the stdio JSON-RPC SDK runtime
- **@deepseek-ai/dsh-cordis-client-runner** (packages/extensions/cordis-client-runner) — Browser half of dynamic dual-half plugin packages: event subscription, closure evaluation, guard facade, and loader entries
- **@deepseek-ai/dsh-cordis-host-runner** (packages/extensions/cordis-host-runner) — Dynamic package definition registry, host-half sandbox lifecycle, and invoke handler table for model-mounted dual-half packages
- **@deepseek-ai/dsh-tool-cordis** (packages/extensions/tool-cordis) — Self-referential cordis toolset: inspect the live runtime, mount and dispose model-written plugins
- **@deepseek-ai/dsh-client-ui-cordis** (packages/extensions/ui-cordis) — Cordis dynamic-plugin definition card: the keyed cordis_define tool row with its run/stop switch
- **@deepseek-ai/dsh-command-feedback** (packages/feedback/command-feedback) — Log-only session feedback producer and human-facing slash command
- **@deepseek-ai/dsh-message-feedback** (packages/feedback/message-feedback) — Lifecycle-bound per-message rating and note sidecar for the DeepSeek Harness
- **@deepseek-ai/dsh-fs** (packages/fs/fs) — Abstract filesystem capability seam (ctx.fs) for the DeepSeek Harness — vocabulary types, the FileSystem service (text IO + optional version-guarded atomic mutations), and the fs/* policy event vocabulary
- **@deepseek-ai/dsh-fs-local** (packages/fs/fs-local) — Local-filesystem implementation of the DeepSeek Harness filesystem seam (ctx.fs)
- **@deepseek-ai/dsh-fs-observation-policy** (packages/fs/fs-observation-policy) — File-context policy plugin for the DeepSeek Harness — observed-state, read-before-edit, and version-guarded write/edit added over the ctx.fs provider seam through the fs/* event gate (no service API)
- **@deepseek-ai/dsh-fs-sandbox** (packages/fs/fs-sandbox) — Sandbox-enforcing implementation of the DeepSeek Harness filesystem seam: fences write/edit by the per-call sandbox mode (read-only denies mutation, workspace-write contains it to the workspace + temp roots) while reads pass through
- **@deepseek-ai/dsh-tool-fs** (packages/fs/tool-fs) — Model-facing filesystem tools (read, write, edit) over the DeepSeek Harness filesystem seam (ctx.fs)
- **@deepseek-ai/dsh-tool-fs-search** (packages/fs/tool-fs-search) — Model-facing filesystem discovery tools (glob, grep) backed by the packaged ripgrep binary (@vscode/ripgrep)
- **@deepseek-ai/dsh-tool-str-replace-editor** (packages/fs/tool-str-replace-editor) — Model-facing view, create, literal replace, and line insert tool over the Harness filesystem service
- **@deepseek-ai/dsh-command-goal** (packages/goal/command-goal) — Human-facing slash command for persisted same-session goals
- **@deepseek-ai/dsh-goal** (packages/goal/goal) — Event-sourced same-session goal state and lifecycle service for the DeepSeek Harness
- **@deepseek-ai/dsh-goal-round-driver** (packages/goal/goal-round-driver) — Race-fenced same-session goal-round driver
- **@deepseek-ai/dsh-tool-goal** (packages/goal/tool-goal) — Model-facing same-session goal tools with execution-time authority checks
- **@deepseek-ai/dsh-repeat-tool-reminder** (packages/guard/repeat-tool-reminder) — Repeat-tool-call guard plugin: advisory reminders when an agent loops on identical tool calls
- **@deepseek-ai/dsh-tool-call-timeout-policy** (packages/guard/timeout-policy) — Tool-call timeout policy: a tools/execute wrapper that arms a per-tool deadline on exec.signal and returns TOOL_TIMEOUT when it wins
- **@deepseek-ai/dsh-hook-protocol** (packages/hooks/hook-protocol) — Shared Claude Code / Codex hook wire protocol: matcher engine, stdin/exit-code/stdout codec, multi-hook merge, and hook/* session events
- **@deepseek-ai/dsh-hooks-claude-code** (packages/hooks/hooks-claude-code) — Bridge plugin: run a Claude Code hooks.json / settings hook config on the DeepSeek Harness interception seams
- **@deepseek-ai/dsh-hooks-codex** (packages/hooks/hooks-codex) — Bridge plugin: run a Codex hooks.json hook config on the DeepSeek Harness interception seams
- **@deepseek-ai/dsh-host-apiproxy** (packages/host/apiproxy) — API gateway: the ApiProxy contract (api/), the fetch carrier pair (fetch/), and the host-side gateway plugin providing ctx.apiProxy
- **@deepseek-ai/dsh-host-directory-picker** (packages/host/directory-picker) — Abstract workspace-directory picking seam (ctx.directoryPicker) for the DeepSeek Harness web GUI host
- **@deepseek-ai/dsh-host-directory-picker-auto** (packages/host/directory-picker-auto) — Adaptive chooser of the directory-picker seam: resolves the host situation at boot and mounts the native or browse backend for the DeepSeek Harness web GUI host
- **@deepseek-ai/dsh-host-directory-picker-browse** (packages/host/directory-picker-browse) — In-app browsing backend of the directory-picker seam (listing/creation primitives over the host filesystem)
- **@deepseek-ai/dsh-host-directory-picker-native** (packages/host/directory-picker-native) — Native-OS-chooser backend of the directory-picker seam for the DeepSeek Harness web GUI host
- **@deepseek-ai/dsh-host-frontend-static** (packages/host/frontend-static) — SPA dist server for the Web shell: owns the webserver fallback seat, serving the built frontend with index-tap injection, traversal rejection, and SPA index fallback
- **@deepseek-ai/dsh-host-plugin-inventory** (packages/host/plugin-inventory) — Read-only Remote projection of current Cordis Loader plugin state
- **@deepseek-ai/dsh-host-webserver** (packages/host/webserver) — Web route-registration plugin: HTTP and upgrade routes, index transform taps, and static dist fallback; knows no harness concepts
- **@deepseek-ai/dsh-anonymous-user-id** (packages/identity/anonymous-user-id) — Shared anonymous user identity for DeepSeek Harness telemetry and feedback correlation
- **@deepseek-ai/dsh-commands** (packages/interaction/commands) — Plugin-owned human command registry for DeepSeek Harness UIs
- **@deepseek-ai/dsh-permission-presets** (packages/interaction/permission-presets) — User-facing permission presets (ctx.permissionPresets) for the DeepSeek Harness: one product-level Permissions select bundling the sandbox-mode and approval-policy knobs, written through to their own session events
- **@deepseek-ai/dsh-tool-ask-user** (packages/interaction/tool-ask-user) — Model-facing ask_user_question tool over the ctx.userQuestions seam
- **@deepseek-ai/dsh-user-approval** (packages/interaction/user-approval) — User-approval seam (ctx.approval) for the DeepSeek Harness: one-shot permission decisions dispatched to composed answerers over the approval/request waterfall, fail-closed by default
- **@deepseek-ai/dsh-user-questions** (packages/interaction/user-questions) — Abstract user-questions seam (ctx.userQuestions) for asking the human during agent runs
- **@deepseek-ai/dsh-jobs** (packages/jobs/jobs) — Background job registry (ctx.jobs) for the DeepSeek Harness — shared ids, owner isolation, polling, cancellation, and completion listeners for long-running tool work
- **@deepseek-ai/dsh-jobs-local** (packages/jobs/jobs-local) — Process-local implementation of the DeepSeek Harness background job registry seam
- **@deepseek-ai/dsh-tool-jobs** (packages/jobs/tool-jobs) — Model-facing background job control tools (job_output, job_list, job_kill) over the ctx.jobs registry
- **@deepseek-ai/dsh-llm** (packages/llm/llm) — Provider-neutral LLM service interface for the DeepSeek Harness
- **@deepseek-ai/dsh-llm-deepseek** (packages/llm/llm-deepseek) — DeepSeek chat-completions adapter for the DeepSeek Harness LLM seam
- **@deepseek-ai/dsh-llm-pi-ai** (packages/llm/llm-pi-ai) — pi-ai-backed DeepSeek adapter for the DeepSeek Harness LLM seam (design-verification twin of dsh-llm-deepseek)
- **@deepseek-ai/dsh-llm-retry** (packages/llm/llm-retry) — Provider-routed LLM request retry policy for the DeepSeek Harness
- **@deepseek-ai/dsh-token-meter** (packages/llm/token-meter) — Replay-aware token measurement service (ctx.tokenMeter) for the DeepSeek Harness
- **@deepseek-ai/dsh-lsp** (packages/lsp/lsp) — Abstract LSP capability seam (ctx.lsp) for the DeepSeek Harness — language-server provider registry keyed by branded id and extension mapping, order-independent per-query selection, normalized definition/references/implementation/hover requests and results, and the LspError taxonomy
- **@deepseek-ai/dsh-lsp-stdio** (packages/lsp/lsp-stdio) — Generic stdio language-server provider for the DeepSeek Harness LSP capability seam (ctx.lsp) — spawns configured servers, translates JSON-RPC, and serves transient-open goToDefinition/findReferences/goToImplementation/hover queries in the host filesystem namespace
- **@deepseek-ai/dsh-tool-lsp** (packages/lsp/tool-lsp) — Model-facing lsp tool over the DeepSeek Harness LSP capability seam (ctx.lsp) — one read-only tool with goToDefinition/findReferences/goToImplementation/hover operations, one-based UTF-16 cursor coordinates, bounded location rendering, and hover normalization
- **@deepseek-ai/dsh-mcp-client** (packages/mcp/mcp-client) — MCP client bridge: connects to MCP servers and registers their tools on ctx.tools
- **@deepseek-ai/dsh-plan-mode** (packages/plan/plan-mode) — Logged per-agent plan mode with deployment guidance, a direct slash command, and a user-reviewed exit
- **@deepseek-ai/dsh-agent-presets** (packages/preset/agent-presets) — Per-session agent composition from preset cordis.yml files for the DeepSeek Harness
- **@deepseek-ai/dsh-persona** (packages/preset/persona) — Composition-authored deployment persona section for the DeepSeek Harness
- **@deepseek-ai/dsh-invariants** (packages/runtime-diagnostics/invariants) — Registry service for package-owned DeepSeek Harness runtime invariants
- **@deepseek-ai/dsh-sandbox** (packages/sandbox/sandbox) — Abstract process-sandbox seam (ctx.sandbox) for the DeepSeek Harness: same-world confinement vocabulary and the SandboxProvider contract
- **@deepseek-ai/dsh-sandbox-local** (packages/sandbox/sandbox-local) — Local process-sandbox backends for the DeepSeek Harness sandbox seam: bwrap, the npm-distributed landlock-run launcher, macOS Seatbelt, or the Windows ACL restricted-token runner — functionally probed, fail-closed
- **@deepseek-ai/dsh-sandbox-policy** (packages/sandbox/sandbox-policy) — Per-call sandbox policy resolver and current model context: deployment fallbacks plus each session's mode and workspace root, shared by every enforcing capability family
- **@deepseek-ai/dsh-sandbox-windows-acl** (packages/sandbox/sandbox-windows-acl) — Windows ACL write-restriction sandbox backend (restricted-token spawn with capability-SID write allowlist) for the DeepSeek Harness sandbox seam
- **@deepseek-ai/dsh-schedule** (packages/schedule/schedule) — Agent-scoped durable after, at, and fixed-rate reminders over the session event log
- **@deepseek-ai/dsh-sdk-client** (packages/sdk/client) — TypeScript client SDK for driving a DeepSeek Harness runtime subprocess over stdio JSON-RPC: the DeepSeekHarness high-level turns API and the lower-level HarnessClient
- **@deepseek-ai/dsh-sdk-protocol** (packages/sdk/protocol) — Shared wire protocol for the DeepSeek Harness SDK runtime: the newline-delimited JSON-RPC stdio transport and the named request, result, and notification types spoken between the runtime server and SDK clients
- **@deepseek-ai/dsh-sdk-jsonrpc-server** (packages/sdk/server) — Stdio JSON-RPC server plugin for out-of-process DeepSeek Harness SDK clients
- **@deepseek-ai/dsh-session-checkpoint-policy** (packages/session/session-checkpoint-policy) — Semantic session durability checkpoints before model requests and tool side effects
- **@deepseek-ai/dsh-session-persistence** (packages/session/session-persistence) — Abstract durable session persistence seam (ctx.sessionPersistence) for the DeepSeek Harness
- **@deepseek-ai/dsh-session-persistence-jsonl** (packages/session/session-persistence-jsonl) — JSONL durable session persistence backend for the DeepSeek Harness
- **@deepseek-ai/dsh-session-persistence-sqlite** (packages/session/session-persistence-sqlite) — SQLite durable session persistence backend for the DeepSeek Harness
- **@deepseek-ai/dsh-session-projection** (packages/session/session-projection) — Session-projection seam: the merge-extensible projection type table, the provider contract, and the ctx.sessionProjections registry serving whole current values of log-derived per-session state
- **@deepseek-ai/dsh-session-projection-cache** (packages/session/session-projection-cache) — Persisted projection cache (ctx.sessionProjectionCache): durable per-session projection checkpoints over the domain data form, throttled write-behind, and the cold-read ladder (cache row + persistence tail replay)
- **@deepseek-ai/dsh-session-stats** (packages/session/session-stats) — Whole-log conversation counts and wall times projection (sessionStats) for the DeepSeek Harness
- **@deepseek-ai/dsh-session-telemetry** (packages/session/session-telemetry) — SessionTelemetryBackend seam for the DeepSeek Harness: session-event capture, projection, redaction, and handoff to a reporting backend
- **@deepseek-ai/dsh-session-telemetry-otel** (packages/session/session-telemetry-otel) — OpenTelemetry backend for the DeepSeek Harness telemetry seam: hands captured session records to the OTel JS SDK's log pipeline
- **@deepseek-ai/dsh-session-title** (packages/session/session-title) — Log-backed session title service and provider registry for the DeepSeek Harness
- **@deepseek-ai/dsh-session-title-all-prompts-llm** (packages/session/session-title-all-prompts-llm) — All-user-messages LLM provider plugin for DeepSeek Harness session titles
- **@deepseek-ai/dsh-session-title-first-prompt-llm** (packages/session/session-title-first-prompt-llm) — First-message LLM provider plugin for DeepSeek Harness session titles
- **@deepseek-ai/dsh-session-title-llm** (packages/session/session-title-llm) — Shared LLM generation policy for DeepSeek Harness session-title providers
- **@deepseek-ai/dsh-session-log-export** (packages/session-query/session-log-export) — Web Session-log export command and shared download dialog
- **@deepseek-ai/dsh-session-query** (packages/session-query/session-query) — Combined session query service contract with concrete reads, traces, and filters
- **@deepseek-ai/dsh-session-query-sqlite** (packages/session-query/session-query-sqlite) — Concrete ctx.sessionQuery backend with SQLite FTS5 search
- **@deepseek-ai/dsh-tool-session-query** (packages/session-query/tool-session-query) — Workspace-authorized model-facing session history search, trace, and event read tools
- **@deepseek-ai/dsh-settings** (packages/settings/settings) — Abstract user-settings seam (ctx.settings) for the DeepSeek Harness
- **@deepseek-ai/dsh-settings-file** (packages/settings/settings-file) — File-backed settings provider (settings.yaml) for the DeepSeek Harness
- **@deepseek-ai/dsh-bash-local** (packages/shell/bash-local) — Local-subprocess implementation of the DeepSeek Harness bash executor seam
- **@deepseek-ai/dsh-bash-sandbox** (packages/shell/bash-sandbox) — Sandbox-consuming implementation of the DeepSeek Harness bash executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts)
- **@deepseek-ai/dsh-pwsh-local** (packages/shell/pwsh-local) — Local PowerShell implementation of the DeepSeek Harness bash executor seam
- **@deepseek-ai/dsh-pwsh-sandbox** (packages/shell/pwsh-sandbox) — Sandbox-consuming implementation of the DeepSeek Harness PowerShell executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts)
- **@deepseek-ai/dsh-shell** (packages/shell/shell) — Abstract bash executor seam (ctx.shell) for the DeepSeek Harness
- **@deepseek-ai/dsh-shell-env** (packages/shell/shell-env) — Tool-independent managed DSH_* shell environment registry
- **@deepseek-ai/dsh-tool-bash** (packages/shell/tool-bash) — Model-facing bash tool with optional generic background-job and sandbox-escalation support
- **@deepseek-ai/dsh-tool-bash-persistent** (packages/shell/tool-bash-persistent) — Model-facing owner-scoped persistent Bash tool backed by the Harness PTY service
- **@deepseek-ai/dsh-tool-pwsh** (packages/shell/tool-pwsh) — Model-facing pwsh tool over the bash executor seam
- **@deepseek-ai/dsh-tool-pwsh-persistent** (packages/shell/tool-pwsh-persistent) — Model-facing owner-scoped persistent PowerShell tool backed by the Harness PTY service
- **@deepseek-ai/dsh-skill** (packages/skill/skill) — Agent skill provider registry for the DeepSeek Harness
- **@deepseek-ai/dsh-skill-badge** (packages/skill/skill-badge) — Bundled dsh badge skill provider for DeepSeek Harness
- **@deepseek-ai/dsh-skill-filesystem** (packages/skill/skill-filesystem) — Local filesystem skill provider for the DeepSeek Harness
- **@deepseek-ai/dsh-tool-skill** (packages/skill/tool-skill) — Model-facing skill loading tool for the DeepSeek Harness
- **@deepseek-ai/dsh-spill** (packages/spill/spill) — Abstract spill storage seam (ctx.spillStore) for the DeepSeek Harness — save oversized tool text and return a retrieval locator
- **@deepseek-ai/dsh-spill-local** (packages/spill/spill-local) — Local-filesystem implementation of the DeepSeek Harness spill storage seam (private session-scoped files)
- **@deepseek-ai/dsh-spill-policy** (packages/spill/spill-policy) — Tool-result spill policy for the DeepSeek Harness — replaces oversized plain-text tool results with a retained preview plus a spill-file path (no service API)
- **@deepseek-ai/dsh-storage** (packages/storage/storage) — Storage hub (ctx.storage): named backend registry plus mounted data-form facilities for the DeepSeek Harness
- **@deepseek-ai/dsh-storage-domain** (packages/storage/storage-domain) — Domain data form (ctx.storage.domain): schema-validated, event-emitting KV domains over storage backends for the DeepSeek Harness
- **@deepseek-ai/dsh-storage-json** (packages/storage/storage-json) — JSON file KV storage backend for the DeepSeek Harness storage hub
- **@deepseek-ai/dsh-storage-sqlite** (packages/storage/storage-sqlite) — SQLite storage backend (kv facet) for the DeepSeek Harness storage hub
- **@deepseek-ai/dsh-subagent** (packages/subagent/subagent) — Abstract subagent seam (ctx.subagents): named-provider registry for delegating to child agents
- **@deepseek-ai/dsh-subagent-acp** (packages/subagent/subagent-acp) — Out-of-process ACP subagent backend: drives a child agent in a spawned subprocess over the Agent Client Protocol
- **@deepseek-ai/dsh-subagent-claude-code** (packages/subagent/subagent-claude-code) — One-shot Claude Code subagent provider over the official Agent SDK
- **@deepseek-ai/dsh-subagent-codex** (packages/subagent/subagent-codex) — One-shot Codex subagent provider over the official app-server protocol
- **@deepseek-ai/dsh-subagent-dsh-sdk** (packages/subagent/subagent-dsh-sdk) — Out-of-process SDK subagent backend: drives a child DeepSeek Harness runtime subprocess over stdio JSON-RPC through the TypeScript SDK client
- **@deepseek-ai/dsh-subagent-fork-in-process** (packages/subagent/subagent-fork-in-process) — In-process fork subagent backend: runs a child agent seeded with a prefix of the parent's log
- **@deepseek-ai/dsh-subagent-in-process-driver** (packages/subagent/subagent-in-process-driver) — Shared in-process subagent run driver: drives a child agent on ctx.agents (used by the spawn and fork backends)
- **@deepseek-ai/dsh-subagent-spawn-in-process** (packages/subagent/subagent-spawn-in-process) — In-process spawn subagent backend: runs a fresh child agent on ctx.agents
- **@deepseek-ai/dsh-tool-subagent** (packages/subagent/tool-subagent) — Model-facing subagent delegation tool over the ctx.subagents seam
- **@deepseek-ai/dsh-tool-subagent-control** (packages/subagent/tool-subagent-control) — Globally named send_message, interrupt_agent, and list_agents tools over ctx.subagents continuations
- **@deepseek-ai/dsh-tool-subagent-report** (packages/subagent/tool-subagent-report) — Child-scoped report tool over ctx.subagents continuations
- **@deepseek-ai/dsh-subprocess** (packages/subprocess/subprocess) — Subprocess seam (ctx.subprocess) for the DeepSeek Harness — managed process groups, bounded spill-backed output, and escalated kills behind one abstract service
- **@deepseek-ai/dsh-subprocess-local** (packages/subprocess/subprocess-local) — Local-subprocess implementation of the DeepSeek Harness subprocess seam
- **@deepseek-ai/dsh-terminal** (packages/terminal/terminal) — Persistent PTY session seam for the DeepSeek Harness — owner-scoped ids, backend registry, interactive sends, reads, signals, and awaited cleanup
- **@deepseek-ai/dsh-terminal-bash** (packages/terminal/terminal-bash) — Persistent shell PTY backend over the DeepSeek Harness subprocess terminal primitive
- **@deepseek-ai/dsh-tool-terminal** (packages/terminal/tool-terminal) — Six model-facing persistent PTY tools with owner isolation and generic background-job integration
- **@deepseek-ai/dsh-acp-snapshot** (packages/test-support/acp-snapshot) — ACP test kit: shared subprocess launcher, snapshot scenario harness, expected-output normalizers, and suite factory
- **@deepseek-ai/dsh-agent-loop-testkit** (packages/test-support/agent-loop-testkit) — Shared prerequisite mounting for tests that exercise the concrete agent loop
- **@deepseek-ai/dsh-client-test-runtime** (packages/test-support/client-runtime) — jsdom slot test runtime: real Cordis Context + SlotRegistry + web-react renderer with test-owned session/workspace doubles for feature specs
- **@deepseek-ai/dsh-llm-mock-server** (packages/test-support/llm-mock-server) — Scriptable OpenAI-compatible HTTP/SSE fault server for LLM recovery tests
- **@deepseek-ai/dsh-llm-replay** (packages/test-support/llm-replay) — Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests)
- **@deepseek-ai/dsh-loader-smoke** (packages/test-support/loader-smoke) — Shared subprocess and direct-agent harness for keyless real-Loader example smoke tests
- **@deepseek-ai/dsh-tool-todo** (packages/todo/tool-todo) — Model-facing todo_write tool over the DeepSeek Harness event-sourced session log
- **@deepseek-ai/dsh-typert-generator** (packages/typert/generator) — TypeScript project analyzer and model-driven Typert artifact generator
- **@deepseek-ai/dsh-typert-loader** (packages/typert/loader) — Loader integration for generated Typert package contributions
- **@deepseek-ai/dsh-typert-protocol** (packages/typert/protocol) — Compiler-independent Remote metadata and Typert provider protocols
- **@deepseek-ai/dsh-typert-registry** (packages/typert/registry) — Runtime registry for generated package reflection and Zod schemas
- **@deepseek-ai/dsh-atomic-write** (packages/util/atomic-write) — Zero-dependency atomic file replacement: exclusive-create random-suffix temp + rename carrying the caller-stated permissions (writeFileAtomic)
- **@deepseek-ai/dsh-brand** (packages/util/brand) — Type-only Branded<B> nominal-typing primitive for the DeepSeek Harness
- **@deepseek-ai/dsh-home-paths** (packages/util/home-paths) — Shared filesystem path helpers for the DeepSeek Harness
- **@deepseek-ai/dsh-launch-environment** (packages/util/launch-environment) — Immutable DeepSeek Harness launch environment that records which layer supplied each value
- **@deepseek-ai/dsh-native-command** (packages/util/native-command) — Zero-dependency no-shell execFile runner for host-native OS integrations: utf8 stdio capture, abort propagation, Windows hide
- **@deepseek-ai/dsh-output-retention** (packages/util/output-retention) — Zero-dependency bounded-retention primitive: ItemRetainer/TextRetainer + neutral notice helpers (what did we keep, what did we omit)
- **@deepseek-ai/dsh-timeout** (packages/util/timeout) — Zero-dependency timeout/deadline primitive: clampTimeout, deadline, timeoutOf, TimeoutReason (timing + classification only, no termination)
- **@deepseek-ai/dsh-tool-web** (packages/web/tool-web) — Model-facing web tools (web_search, web_fetch) over the DeepSeek Harness web capability seam (ctx.web)
- **@deepseek-ai/dsh-web** (packages/web/web) — Abstract web access capability seam (ctx.web) for the DeepSeek Harness — search/fetch provider registry, registration-order-independent selection, request/result vocabulary, and the WebError taxonomy
- **@deepseek-ai/dsh-web-fetch-http** (packages/web/web-fetch-http) — Anonymous public HTTP(S) fetch provider for the DeepSeek Harness web capability seam (ctx.web)
- **@deepseek-ai/dsh-web-search-deepseek** (packages/web/web-search-deepseek) — DeepSeek-backed search provider (native web_search via the Anthropic-compatible API) for the DeepSeek Harness web capability seam (ctx.web)
- **@deepseek-ai/dsh-web-search-exa** (packages/web/web-search-exa) — Exa-backed search provider for the DeepSeek Harness web capability seam (ctx.web)
- **@deepseek-ai/dsh-web-search-perplexity** (packages/web/web-search-perplexity) — Perplexity-backed search provider for the DeepSeek Harness web capability seam (ctx.web)
- **@deepseek-ai/dsh-tool-ralph** (packages/workflow/tool-ralph) — Model-facing fresh-agent Ralph loop over the workflow and subagent seams
- **@deepseek-ai/dsh-tool-workflow** (packages/workflow/tool-workflow) — Model-facing workflow tool: run a JavaScript orchestration script over ctx.workflowEngine
- **@deepseek-ai/dsh-workflow** (packages/workflow/workflow) — Workflow capability seam: ctx.workflowEngine service, run vocabulary, and workflow/* events
- **@deepseek-ai/dsh-workflow-worker-thread** (packages/workflow/workflow-worker-thread) — worker-thread workflow engine: executes model-written orchestration scripts off the host event loop, bridging agent() calls back to ctx.subagents
- **@deepseek-ai/dsh-workspace** (packages/workspace/workspace) — Workspace entity registry (ctx.workspaceRegistry): durable workspace records with validated session attachment over the domain data form for the DeepSeek Harness

## Core harness subsystems available through `dsh web`

The web UI is backed by the upstream host/runtime subsystems: agent lifecycle and event streams; API gateway and OpenAI/Anthropic-compatible LLM adapters; provider/model configuration; streaming deltas and token metrics; sessions, session query, projections, persistence, branches, history and compaction; workspace context; filesystem and code runtime; command execution; tool registry and tool execution pipeline; permissions and sandbox policy; credentials; attachments; feedback; goals; plans; background jobs and schedules; subagents; workflows; skills; LSP integration; extensions/plugins; client module graph; locale/theme; web search/fetch; and invariant/diagnostic reporting.

## Product features added by this repository

The desktop product adds zero-config DeepSeek-free provider seeding, a preconfigured OpenCode public account (`Bearer public`) that never overwrites a user's private key, an `opencode2api` worker pool with health/respawn/round-robin/sticky routing, a bounded 1..16 live Accounts / workers slider (concurrency only; no account creation or IP-limit bypass), loopback SSE load balancing, harness readiness/restart supervision, model latency refresh, on-demand compatible-local-route detection, keytar/file secret fallback, native Electron window/tray/notifications, pool overlay, zod preload IPC, OpenCode SQLite/ChatML import, workspace continuation, bounded JSONL logs, opt-in GitHub updates, reproducible portable runtime packaging, tag-only release CI, and the CSS-only per-conversation motion background. Upstream approvals, permission presets, sandbox modes, filesystem policy, tool confirmations, and escalation behavior remain unchanged from the original harness.

## Configuration-dependent capabilities

The UI can expose a capability without making it usable until its provider, credential, workspace, permission, or OS integration is configured. Web search providers, LSP servers, native directory picking, model APIs, filesystem/code tools, schedules, messaging-like extensions, and external plugin cards therefore report their own readiness/errors rather than being silently claimed as available.
