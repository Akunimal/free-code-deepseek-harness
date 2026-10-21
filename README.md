# FreeCode DeepSeek Harness

### Current source: v1.0.1 candidate (Windows x64)

The v1.0.1 candidate replaces the active OpenCode2API gateway with a bundled,
hash- and provenance-verified Phoenix gateway built from pinned FreeLLMpool
0.13.0. It requires no `C:\LocalAI`, separately installed Python or
FreeLLMpool, or pre-existing local service/port. The selector exposes **Auto
Phoenix** first and the allowlisted concrete free models after it. A concrete
choice is a strict pin and never silently switches models; only Auto can try
another eligible route, and only before streaming begins. Concrete models are
ordered by the pinned FreeLLMpool capability score, with latency kept from
overriding that quality order. The keyless Kilo snapshot includes MiniMax M3.1
Flash, Laguna S 2.1 and Dots3 Note Preview; Nemotron models and dynamic Kilo
aliases are excluded. Kilo's Code-agent ranks (#14/#98/#99 in the 2026-10-21
snapshot) are changing real-usage proxies, not directly comparable benchmarks;
anonymous access is limited to 200 requests/hour/IP. See the [live free
catalog](https://kilo.ai/landing/free-models) and [Kilo anonymous-access
limits](https://kilo.ai/docs/gateway/authentication). The provider catalog is
external, so Internet and upstream availability are still needed. Only models
that return a valid, non-empty HTTP 200 chat completion remain selectable. A
failed current probe is hidden immediately; prior success is diagnostic only,
and the model reappears after a later valid completion.

**Release status:** v1.0.1 is a local candidate, not published. Its setup and
portable were built and statically verified before the Kilo/catalog follow-up;
the setup was later launched once, but installation completion is unverified.
Those artifacts are stale for the current source, and the mandatory clean-cache
release gate has not run. The last published desktop release is the historical
[v1.0.0 release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0).
See the [bilingual v1.0.1 candidate notes](release-notes-v1.0.1.md) and
[v1.0.0 history](release-notes-v1.0.0.md).

The DSH runtime `0.2.1-alpha.11` remains a separate first-launch download,
not part of setup/portable. A fresh install still needs Internet to fetch and
verify that exact public runtime. Phoenix itself is bundled in the desktop
payload and checked before startup.

The conversation UI retains the Hermes-inspired dynamic CSS/ASCII background
patterns; they are decorative and do not change model or request routing.

Windows-first coding: choose a project, describe the work, and let the local
Harness coordinate files, tools, MCP servers and Phoenix-backed model calls.

[Leer en español](README.es.md)

## English

## Current status: v1.0.1 candidate (Windows x64)

Source version: 1.0.1; pinned DSH runtime: `0.2.1-alpha.11`.

**Release status:** local candidate only. Setup/portable are built and
statically verified, but not installed or launched; no v1.0.1 tag or release
exists. The public empty-cache DSH runtime proof and full release gate remain
mandatory before publication.

The v1.0.1 source pins Phoenix to FreeLLMpool 0.13.0 and bundles its Windows
x64 gateway, allowlist, MIT license and source/build receipt. DSH remains a
separate immutable alpha.11 runtime asset. See the historical
[v1.0.0 release notes](release-notes-v1.0.0.md) for the previous gateway.

The local desktop output is `apps/shell/release-1.0.1-candidate/` and contains
the NSIS setup, portable Windows executable, setup blockmap and `latest.yml`.
Their static hashes are recorded in the [bilingual candidate notes](release-notes-v1.0.1.md).
The separate alpha.11 runtime (~423 MB) and its SHA-256
are published in the [runtime-0.2.1-alpha.11 pre-release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/runtime-0.2.1-alpha.11).
Internet is required without a valid cache. The mandatory gate uses production
bootstrap/updater, an empty profile/cache, SHA-256, manifest, Electron ABI and
hidden CLI startup. Failure blocks publication. Older runtimes do not satisfy alpha.11.

Phoenix forwards requests to the configured allowlisted upstream providers.
They receive the request contents and may apply their own availability,
retention and telemetry policies; review those providers' terms before use.
FreeCode does not add the retired OpenCode2API proxy-rotation pool.

**Platform support: Windows x64 only**; Windows ARM64, Linux and macOS are
untested and unsupported. Builds are local without GitHub Actions; binaries are unsigned.
Earlier releases retain their historical tags and binaries.

## What is included in the v1.0.1 candidate

- **Bundled Phoenix + FreeLLMpool 0.13.0 gateway** — verified Windows x64
  executable, MIT license, exact model allowlist and build/source receipt. No
  local Python, `C:\LocalAI`, separate FreeLLMpool installation or port 8095
  dependency.
- **Phoenix model selector** — Auto Phoenix appears first, then concrete free
  routes ranked by pinned capability scores (Kilo uses its documented Code
  agent usage rank as a clearly weaker, live-changing proxy; this does not make
  it directly comparable to benchmark scores). Probe latency cannot promote a
  lower-ranked route. The Kilo no-auth snapshot contains only MiniMax M3.1
  Flash, Laguna S 2.1 and Dots3 Note Preview; every Nemotron model and dynamic
  Kilo alias is excluded. Concrete choices stay pinned: an error is returned
  rather than silently selecting a different model. Auto alone may try another
  eligible free route before any response bytes stream; never switch midstream.
  A route stays selectable only after a valid, non-empty HTTP 200 chat
  completion. Failed current probes are hidden immediately, and a later valid
  completion makes the route selectable again.
- **Catalog status** — loading and failure state are exposed while the
  provider catalog is refreshed; an empty/unavailable upstream is not reported
  as a successful model list.
- The upstream DeepSeek Harness web UI, sessions, workspaces, permissions and
  file tools.
- A single Electron shell and a single `dsh` child generation.
- Renderer popups are denied. Background process trees use `headless-host`
  with a private desktop and Job, not only `windowsHide`. Explicit user GUI
  actions use an authenticated broker. This is not a sandbox against malicious
  code, UAC, services or OS brokers.
- free-search as the managed MCP entry; it starts disabled until its binary
  is vendored. Entries whose command cannot spawn start disabled instead of
  burning the reconnect budget.
- A visible MCP settings tab with toggles, connection state, registered tool
  count, errors and the generated config path.
- Caveman configuration in the Shell settings card, enabled by default in the
  shell schema; it is a no-op when its optional executable is absent.
- RTK and Caveman settings are exposed separately and are never claimed to be
  active when their executable is missing. Both remain optional PATH-resolved
  helpers, not bundled binaries.
- Bundled Windows Tesseract OCR for text-only image workflows.
- A persistent embedded browser only when the user explicitly opens it.
- About/version from the packaged app version, an update button shaped like
  Send with a downward arrow, and tray notifications during downloads/install.
- **Spanish locale** fully functional in the web UI via the `141-*` patch
  (30 files, ~1000 keys). The language selector now renders Spanish correctly.

Gemini2API was removed from the 0.6.0 runtime. There is no Gemini process,
provider, selector model, resource payload or fallback route to configure.
Serena was removed from the managed MCP catalog in 0.8.0. Engram and the
Gentle AI mode were removed in 1.0.0; the Standard modes cover their use.

## Install and first run

1. For the currently published stable build, use the historical
   [v1.0.0 GitHub release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0).
   v1.0.1 remains unpublished; its local installer artifacts have not passed
   the mandatory fresh-install gate and are not a public release.
2. Install or unpack it and launch the real shortcut/executable.
3. Select a project directory in the picker.
4. Wait for the free models to load (spinner in the selector), then ask the
   model to inspect or change the project.

The locally built v1.0.1 desktop payload includes Electron, the bundled Phoenix
gateway, native dependencies and Tesseract. Setup/portable passed static
verification, but have not been installed or launched. The large DSH runtime is a
separate release asset: on first launch, FreeCode downloads the pinned
`0.2.1-alpha.11` Windows x64 archive (~423 MB), verifies GitHub's SHA-256 and
Electron ABI, then caches it under `<userData>/harness-runtime`. Later starts
reuse the verified cache offline. Any first launch without a valid cache needs
network access; a failed download or validation offers Retry/Close and does not
start the Harness. Managed MCP servers still resolve `uvx` (vendored, with
user-PATH and pinned-download fallbacks). If an incomplete installation is
detected, the diagnostic points to the app log and recommends reinstalling
from the official published release.

The Windows bootstrap silently reuses a user-installed `uvx.exe`, or downloads
the pinned official uv ZIP into a per-user tools directory after HTTPS and
SHA-256 verification. It does not modify `PATH`, require administrator rights
or open a console. A failed bootstrap leaves the main app recoverable and
surfaces the MCP problem in the tab/log.

## MCP: free-search

On first boot FreeCode atomically creates:

```text
<userData>/dsh-home/mcp/servers.json
<userData>/dsh-home/cordis.patch.yml
```

The managed entry is enabled when its command can spawn. Open
Settings → Plugins → MCP to toggle it or open the exact JSON file. Only
the marked FreeCode block in the Cordis patch is regenerated; unrelated user
rows are preserved. A toggle updates the child environment and restarts only
the Harness child, never a second Electron instance. Servers whose binary is
missing (currently free-search) start disabled automatically.

The target readiness contract is real, not just configuration:

```text
spawn → initialize → tools/list → schema validation → tool registration
```

The tab and tray are intended to expose the resulting state. Renderer
popups are denied outright and a window-registry backstop destroys any
native window outside splash/main/overlay, so tool and page activity cannot
flash transient windows over the user's work. No MCP implementation should
use `cmd.exe`, `start`, a terminal or a visible window; isolated transient
reports are still welcome (window title/content) and the backstop logs every
destroyed popup.

Research is embedded-browser-first when browsing is needed. `free-search-mcp`
through `uvx` is an HTTP-only fallback when the browser cannot answer; API
search must not silently replace the embedded browser. The browser must not
open unrelated native windows.

Details are in [docs/mcp-servers.md](docs/mcp-servers.md).

## Tool-call contract

The target MCP tool-call contract records a bounded machine-readable record
with:
`requestId`, server, raw tool name, attempt, status and duration. The status is
one of:

```text
success
failed-local
failed-mcp
failed-provider
failed-timeout
failed-permission
failed-invalid-response
```

Empty, legacy and malformed results must be explicit invalid-response
failures, not successful blank answers. Retries must be bounded and must not be
performed blindly for side-effecting tools. Arguments, image bytes and OCR
contents are omitted from logs. The 0.6.0 audit captured a real truncated
provider stream with zero text and no completion marker, so this contract is a
0.7.0 implementation gate rather than a claim that every path is fixed.

## OCR behavior

Vision-capable models keep the original image. Text-only models receive OCR
text in both supported paths:

1. a direct image attachment in the user message;
2. the `read_image` tool.

Tesseract is bundled for Windows; `pytesseract` is not a runtime dependency.
The helper validates absolute paths, limits image/output sizes, restricts
language/PSM arguments, enforces a timeout and caches by image hash. Missing
binary, corrupt image, timeout, empty result and excessive output are explicit
errors; FreeCode never substitutes `[image omitted...]` silently.

## Shell, Caveman, RTK and sandbox

Settings → Plugins → plugin configuration → Shell exposes independent RTK and
Caveman toggles. Their schema defaults are on. The executable probes are
cached; if a binary is not installed, the corresponding feature is an explicit
no-op. RTK and Caveman are optional PATH-resolved helpers, not
bundled binaries. Only safe, plain commands are eligible for wrapping;
pipes, redirects, substitutions and other compound syntax are preserved.

Workspace Write remains the default permission mode. Sandbox decisions remain
the upstream contract: FreeCode does not widen permissions automatically and
distinguishes permission failures from tool/MCP failures.

## Updater and versioning

About reads `app.getVersion()`; the locally built v1.0.1 candidate uses that
version. It has not been installed or validated by the clean-cache runtime gate.
The app checks for updates at startup and every six hours. The update control
is the same circular primary button as Send, with the arrow pointing down.
When downloading, the tray tooltip/menu and a native notification say so; the
install/restart phase is also visible. The updater never offers
an older DSH runtime as an upgrade; installing the desktop release and
bootstrapping its pinned runtime are separate steps.

## Root cause of the previous regressions and 0.7.0 closure

The install crash came from a packaged `directory-picker-native` bundle that
was missing the Electron dialog bridge. A later launch also exposed lifecycle
issues: stale supervisor exit events could schedule another spawn while an
explicit restart was already creating a replacement. Tool failures were hard
to diagnose because readiness and successful registration were conflated, and
text-only image paths had no OCR fallback.

0.7.0 closes the corrective roadmap with evidence (see the
[0.7.0 state ledger](docs/STATE-0.7.0.md)):

- native-addon ABI is gated before packaging, and runtime dependency hashes
  are verified against the manifest;
- the dsh runtime stage drops ~1.1 GB of dev-only weight (installer
  559 MB → ~300 MB);
- the shell suite is fully hermetic and green (165/165), including seeder,
  refresher, MCP catalog, resolver and updater coverage;
- the anonymous model lane probes every advertised model and exposes only
  200 responders;
- renderer popups are denied and a window backstop owns the native surface;
- MCP entries with unresolvable commands start disabled instead of burning
  reconnect budgets.

Remaining honest limitations are tracked in
[Known issues](docs/KNOWN-ISSUES.md): upstream quota governs the anonymous
lane, RTK/Caveman/free-search binaries are not vendored, and non-Windows
platforms are untested.

## Upstream-first development

The upstream subtree is intentionally kept updateable. The supported order is:

```text
update/fetch vendor/deepseek-harness upstream
  → pnpm apply:upstream-patches
  → pnpm prepare:upstream
  → tests, typecheck, build and packaging
```

Product changes must become small sorted patches in `patches/upstream/`, with a
focused contract test. The patch applier is idempotent, vendor-scoped and
fail-closed. Do not leave an unrepresented feature as a permanent direct edit
inside `vendor/deepseek-harness`. The required order is:

```text
freeze evidence → fetch/update upstream → replay ordered patches
  → verify upstream commit + patch manifest → test/typecheck
  → build runtime closure → package → installed smoke
```

Every product feature must have an owner file, a modular patch or shell-layer
implementation, a contract test and a replay/idempotence check. See
[docs/UPSTREAM-PATCHING.md](docs/UPSTREAM-PATCHING.md).

## Windows local release gate: v1.0.1 candidate

Run from PowerShell on Windows x64. The gate is non-interactive at the desktop
UI boundary: it builds an NSIS package in a unique temporary directory,
verifies that exact package and a fresh-cache public runtime download, and does
not install or launch the FreeCode GUI. It does start test-owned hidden DSH CLI/Electron-as-Node and
fixture child processes, isolated under scratch paths; cleanup targets only
the recorded child PID tree and never enumerates or kills unrelated processes.

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-1.0.1-candidate'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-1.0.1-candidate
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

`build:desktop` creates setup and portable artifacts in the new
`apps/shell/release-1.0.1-candidate/` output directory; it refuses to replace an
existing non-empty folder. `verify:desktop-release-assets` checks the exact PE
files, setup blockmap, updater metadata and hashes without launching either
executable. Desktop packaging does not rebuild or replace the separately versioned DSH runtime. Only when the DSH
runtime itself changes should maintainers bump its manifest version and run
`pnpm package:runtime:release`; existing runtime versions are immutable.

Previous runtime builds remain historical in their releases.
The current runtime is alpha.11, fetched from the separate
[runtime-0.2.1-alpha.11 pre-release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/runtime-0.2.1-alpha.11); a local preload is not public
first-install evidence.

The [v1.0.0 GitHub release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0)
is historical; v1.0.1 is not yet published. The current local artifacts are in
`apps/shell/release-1.0.1-candidate/`; historical folders are not overwritten.
The gate does not install or launch the FreeCode GUI. The interactive installer
smoke installs, launches and uninstalls, so it is only allowed in a disposable
Windows VM, never on the workstation or beside the user's instance.
See the [release policy](docs/RELEASE-POLICY.md).

## Manual contributor builds for other operating systems

Linux and macOS are not release targets for v1.0.1, and Windows ARM64 is not
tested either. A contributor may work on a native host with its own Node,
pnpm, Git, Electron build tools and native dependencies:

```bash
pnpm install --frozen-lockfile
pnpm apply:upstream-patches
pnpm build:vendor
pnpm test
pnpm typecheck
```

Do not use those builds as release evidence, do not upload them, and do not
expect the Windows-only desktop release gate to accept a non-Windows target.
`package:runtime:release` is only for an intentional DSH runtime version change.
Reinstall dependencies when switching between Windows and WSL so
native modules and workspace links are not mixed.

## Project and license

FreeCode is the [Akunimal/free-code-deepseek-harness](https://github.com/Akunimal/free-code-deepseek-harness)
fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Related projects: [FreeLLMpool](https://github.com/0xzr/freellmpool),
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness),
[RTK](https://github.com/rtk-ai/rtk),
[Caveman](https://github.com/JuliusBrussee/caveman) and
[free-search-mcp](https://github.com/sweetcornna/free-search-mcp).

## Español

The complete Spanish guide is [README.es.md](README.es.md). FreeCode uses the
Phoenix/FreeLLMpool free-model catalog; both language guides share the same
upstream inventory, hardening and local release policy.

## Documentation index

- [Upstream feature inventory](docs/UPSTREAM-FEATURES.md)
- [v1.0.1 candidate notes](release-notes-v1.0.1.md)
- [v1.0.0 historical release notes](release-notes-v1.0.0.md)
- [v0.9.6 release notes](release-notes-v0.9.6.md)
- [v0.9.5 — history / historial](release-notes-v0.9.5.md)
- [v0.9.4 release notes](release-notes-v0.9.4.md)
- [v0.9.3 release notes](release-notes-v0.9.3.md)
- [v0.9.2 release notes](release-notes-v0.9.2.md)
- [0.9.1 release notes](release-notes-v0.9.1.md)
- [0.9.0 release notes](release-notes-v0.9.0.md)
- [0.8.0 release notes](release-notes-v0.8.0.md)
- [0.7.0 release notes](release-notes-v0.7.0.md)
- [0.7.0 state ledger](docs/STATE-0.7.0.md)
- [0.7.0 aggressive remediation roadmap](docs/ROADMAP-0.7.0.md)
- [0.6.0 state ledger](docs/STATE-0.6.0.md)
- [0.6.0 roadmap](docs/ROADMAP-0.6.0.md)
- [0.6.0 audit and test plan](docs/AUDIT-0.6.0-TEST-PLAN.md)
- [Windows release and packaging](docs/RELEASE.md)
- [Historical roadmap](docs/ROADMAP.md)
- [Known issues](docs/KNOWN-ISSUES.md)
