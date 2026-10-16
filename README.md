# FreeCode DeepSeek Harness

### Current 0.9.4 candidate (alpha8)

The candidate targets `apps/shell/release-0.9.4-alpha8-20261016/`, with DSH 0.2.1-alpha.8 and opencode2api v1.4.0. It includes V094-37 catalog-loading feedback; V094-38 original Hermes-inspired animated backgrounds that hold their pattern during generation, accelerate while working, and crossfade only on completion/stop; V094-39 per-model context and supported effort metadata; active-profile synchronization, documented inference routing, and V094-35's localized model-block recursion fix. The full non-interactive release gate passed; fresh setup/portable artifacts were built and statically verified in the target directory, with exact hashes in `release-notes-v0.9.4.md`. Alpha6/alpha7 desktop artifacts are superseded and must not be used to test this source. Alpha8 is unpublished; the local candidate bundle carries the exact runtime archive and a CHECK ONLY preflight. To test locally, close FreeCode yourself and explicitly run the preparation option before setup; this task did not install or launch FreeCode. Public-provider acceptance remains unverified. The active catalog is `profiles/web/cordis.patch.yml`. V094-21 remains included; alpha5/alpha6 desktop artifacts are superseded. No tag, upload or release is included.

Windows-first coding with OpenCode Free models: choose a project, describe the
work, and let the local Harness coordinate files, tools, MCP servers and model
calls.

[Leer en español](README.es.md)

## English

## Current status: source v0.9.4 candidate; latest published release: v0.9.3 (Windows x64)

Source version: 0.9.4 (candidate, not published); latest published release: v0.9.3 (Windows x64).

The [v0.9.4 candidate notes](release-notes-v0.9.4.md) retain the historical
superseded alpha5 attempts; those are not the new installer being prepared.

v0.9.3 is published for Windows x64. The NSIS setup was installed and confirmed
working by the user; the portable executable was built but not separately
installation-tested.

The v0.9.3 release includes:

- an NSIS installer (~178.5 MB);
- a portable Windows executable (~178.2 MB / 169.9 MiB);
- `latest.yml` plus the setup blockmap for updates;
- the pinned DSH `0.2.1-alpha.2` runtime remains a separate ~421.6 MB asset
  in the v0.9.2 release, downloaded on first launch when no valid cache exists.

**Platform support: Windows x64 only** (v0.9.3 setup was packaged and confirmed
working after installation on Windows x64). **NOT tested and NOT supported**:
Windows ARM64, Linux (any distribution/architecture), or macOS (any
architecture). No artifacts are published for these platforms; contributor
builds exist but were not tested by the maintainer and must not be treated as
usable releases. Builds are local and do not use GitHub Actions workflows.

`0.4.3` is a historical recovery reference, not the current release or source
of truth. v0.9.3 is the current published Windows x64 baseline.

## What is included

- **Gentle AI integrated mode** — a selectable, opt-in `gentle-ai` agent preset
  that reuses the Standard composition, permissions, sandbox and plan mode.
  Standard remains the default; Gentle AI must be selected explicitly.
  A bounded `gentle-ai:*` IPC bridge (`status`, `doctor`, `run`) with Zod
  contract is exposed to the renderer via `window.freecode.gentleAi`.
- **Single model lane** (`deepseek-free`, labeled *OpenCode Free*) served by
  the bundled opencode2api gateway — anonymous free models, no keys. This is
  the sole model gateway: freellmpool was removed in 0.8.0 and the
  duplicated `opencode-free` lane was consolidated into it in 0.9.0, so
  every model appears exactly once in the selector. Only models that answer
  a real 200 probe reach the selector; dead models are hidden and the lane
  self-heals after quota recovery.
- **Bundled Tor for egress failover** — a single `tor.exe` instance
  (`resources/freecode/tor/`, hardened fast-node `torrc`) runs on
  `127.0.0.1:9050` (SOCKS) and `:9051` (control). opencode2api is launched
  with `[direct, socks5://127.0.0.1:9050]` so model traffic can fail over
  through Tor when direct egress is blocked. The status overlay exposes a
  **Resiliencia Tor** block with a `NEWNYM` button to rotate the circuit on
  demand and displays a bounded startup reason if Tor exits before bootstrap.
  Tor keeps its SOCKS endpoint across retries; the gateway rechecks local SOCKS
  availability every 10 seconds, while direct remains first. It replaces the old Cloudflare WARP dependency; there is no WARP
  service, no `warfleet` and no `torfleet` sidecar.
- The upstream DeepSeek Harness web UI, sessions, workspaces, permissions and
  file tools.
- A single Electron shell and a single `dsh` child generation.
- Renderer popups are denied and a window-registry backstop destroys any
  native window outside splash/main/overlay. DSH's Win32-created `pwsh`
  command children also start hidden, preventing console flashes and focus theft.
- Engram and free-search as managed MCP entries. Engram is on by default as
  the third managed row; free-search starts disabled until its binary is
  vendored. Entries whose command cannot spawn start disabled instead of
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
Serena was removed from the managed MCP catalog in 0.8.0; Engram is the
semantic memory surface.

## Install and first run

1. Download the Windows setup or portable artifact from the
   [v0.9.3 GitHub release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.3).
2. Install or unpack it and launch the real shortcut/executable.
3. Select a project directory in the picker.
4. Ask the model to inspect or change the project.

The v0.9.3 installer includes Electron, the opencode2api gateway, bundled Tor,
native dependencies and Tesseract (~178 MB). The large DSH runtime is a
separate release asset: on first launch, FreeCode downloads the pinned
`0.2.1-alpha.2` Windows x64 archive (~421.6 MB), verifies its SHA-256 and
Electron ABI, then caches it under `<userData>/harness-runtime`. Later starts
reuse the verified cache offline. Any first launch without a valid cache needs
network access; a failed download or validation offers Retry/Close and does not
start the Harness. Managed MCP servers still resolve `uvx` (vendored, with
user-PATH and pinned-download fallbacks). If an incomplete installation is
detected, the diagnostic points to the app log and recommends reinstalling
from the official v0.9.3 release.

The Windows bootstrap silently reuses a user-installed `uvx.exe`, or downloads
the pinned official uv ZIP into a per-user tools directory after HTTPS and
SHA-256 verification. It does not modify `PATH`, require administrator rights
or open a console. A failed bootstrap leaves the main app recoverable and
surfaces the MCP problem in the tab/log.

## MCP: Engram and free-search

On first boot FreeCode atomically creates:

```text
<userData>/dsh-home/mcp/servers.json
<userData>/dsh-home/cordis.patch.yml
```

Three managed entries are enabled when their command can spawn. Open
Settings → Plugins → MCP to toggle them or open the exact JSON file. Only
the marked FreeCode block in the Cordis patch is regenerated; unrelated user
rows are preserved. A toggle updates the child environment and restarts only
the Harness child, never a second Electron instance. Servers whose binary is
missing (currently free-search) start disabled automatically.

**Engram** is the third managed MCP row, on by default. It provides persistent
memory and knowledge storage across sessions through the Engram MCP server.
Gentle AI uses `.atl/skill-registry.md` as its skill index and RDD v2 for
receipt-driven development.

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

About reads `app.getVersion()`, so the packaged v0.9.3 binary says 0.9.3.
The app checks for updates at startup and every six hours. The update control
is the same circular primary button as Send, with the arrow pointing down.
When downloading, the tray tooltip/menu and a native notification say so; the
install/restart phase is also visible. v0.9.3 prevents the updater from
offering an older DSH runtime as an upgrade; installing the desktop release and
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

## Windows local release gate: v0.9.4 candidate

Run from PowerShell on Windows x64. The gate is non-interactive at the desktop
UI boundary: it builds an NSIS package in a unique temporary directory,
verifies that exact package and the pinned runtime checksum, and does not
install or launch the FreeCode GUI. It does start test-owned hidden DSH CLI and
fixture child processes, isolated under scratch paths; cleanup targets only
the recorded child PID tree and never enumerates or kills unrelated processes.

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.4-alpha8-20261016'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.4-alpha8-20261016
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

`build:desktop` creates setup and portable artifacts in the new
`apps/shell/release-0.9.4-alpha8-20261016/` output directory; it refuses to replace an
existing non-empty folder. `verify:desktop-release-assets` checks the exact PE
files, setup blockmap, updater metadata and hashes without launching either
executable. Desktop packaging does not rebuild or replace the separately versioned DSH runtime. Only when the DSH
runtime itself changes should maintainers bump its manifest version and run
`pnpm package:runtime:release`; existing runtime versions are immutable.

Hashes and failures of previous alpha5/alpha6 installers remain historical in the
candidate notes. Use only the new alpha8 output and its local preflight; the
active instance has not been modified.

The user confirmed the installed v0.9.3 application works on Windows x64. The
portable executable is not separately installation-tested. The interactive
`smoke:nsis` installs, launches and uninstalls the application, which can alter
per-user shortcut/registration state; it is opt-in for a disposable Windows VM
only, never part of `release:gate` or a maintainer workstation run. Details are
in [release policy](docs/RELEASE-POLICY.md) and its
[Spanish version](docs/RELEASE-POLICY.es.md). v0.9.0's earlier gate counts are
historical and remain in [its release notes](release-notes-v0.9.0.md).

The published [v0.9.3 release](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.3)
contains setup, portable, blockmap and `latest.yml`. The pinned Harness runtime
tarball and its `.sha256` remain in the v0.9.2 release.

The final v0.9.3 release assets are staged under
`apps/shell/release-0.9.3-final/`; the historical v0.9.2 files under
`apps/shell/release/` remain untouched.

## Manual contributor builds for other operating systems

Linux and macOS are not release targets for v0.9.3, and Windows ARM64 is not
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

Related projects: [OpenCode2API](https://github.com/jasonxu114514/opencode2api),
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness),
[RTK](https://github.com/rtk-ai/rtk),
[Caveman](https://github.com/JuliusBrussee/caveman),
[Gentle AI](https://github.com/Gentleman-Programming/gentle-ai) and
[free-search-mcp](https://github.com/sweetcornna/free-search-mcp).

## Español

La guía completa en español está en [README.es.md](README.es.md). FreeCode
usa modelos OpenCode Free y mantiene el mismo inventario de upstream,
hardening y release local en ambos idiomas.

## Documentation index

- [Upstream feature inventory](docs/UPSTREAM-FEATURES.md)
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
