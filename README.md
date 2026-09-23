# FreeCode DeepSeek Harness

Windows-first coding with OpenCode Free models: choose a project, describe the
work, and let the local Harness coordinate files, tools, MCP servers and model
calls.

[Leer en español](README.es.md)

## English

## Current status: 0.7.0 released (Windows x64)

0.7.0 is published for Windows x64 with:

- an NSIS installer (~300 MB);
- a portable Windows executable (~300 MB).

**Platform support: tested on Windows 10/11 x64 ONLY** (clean install,
launch, `harness ready`, both model lanes populated, graceful shutdown).
**NOT tested and NOT supported**: Windows ARM64, Linux (any
distribution/architecture), macOS (any architecture). No artifacts are
published for these platforms; contributor builds exist but were not tested
by the maintainer and must not be treated as usable releases. Builds are
local and do not use GitHub Actions workflows.

`0.4.3` is the last known-good operational reference because it opens. It is
not the source of truth and may not contain the fixes in this worktree.

## What is included

- OpenCode Free model routing through the local OpenCode-compatible pool,
  plus a second **OpenCode No-Auth lane** (`opencode-free`) served by the
  bundled opencode2api v1.3.2 gateway — anonymous free models, no keys.
  Only models that answer a real 200 probe reach the selector; dead models
  are hidden and the lane self-heals after quota recovery.
- The upstream DeepSeek Harness web UI, sessions, workspaces, permissions and
  file tools.
- A single Electron shell and a single `dsh` child generation.
- Renderer popups are denied and a window-registry backstop destroys any
  native window outside splash/main/overlay, so no tool or page can flash
  transient windows over the user's work.
- Serena and free-search as managed MCP entries. Serena runs through the
  packaged headless launcher; entries whose command cannot spawn start
  disabled instead of burning the reconnect budget (free-search stays off
  until its binary is vendored).
- A visible MCP settings tab with toggles, connection state, registered tool
  count, errors and the generated config path.
- Caveman configuration in the Shell settings card, enabled by default in the
  shell schema; it is a no-op when its optional executable is absent.
- RTK and Caveman settings are exposed separately and are never claimed to be
  active when their executable is missing. Both remain optional PATH-resolved
  helpers in 0.7.0; they are not bundled binaries.
- Bundled Windows Tesseract OCR for text-only image workflows.
- A persistent embedded browser only when the user explicitly opens it.
- About/version from the packaged app version, an update button shaped like
  Send with a downward arrow, and tray notifications during downloads/install.

Gemini2API was removed from the 0.6.0 runtime. There is no Gemini process,
provider, selector model, resource payload or fallback route to configure.
Independent LSP MCP entries were also removed; Serena is the semantic MCP
surface.

## Install and first run

1. Download the Windows setup or portable artifact from the 0.7.0 GitHub
   release.
2. Install or unpack it and launch the real shortcut/executable.
3. Select a project directory in the picker.
4. Ask the model to inspect or change the project.

The 0.7.0 installer includes the Electron runtime, upstream Harness runtime,
opencode2api gateway binary, native dependencies and Tesseract (~300 MB
download, ~69,000 files, about 10 minutes to unpack — this is normal, not a
hang). Managed MCP servers still resolve `uvx` (vendored, with user-PATH and
pinned-download fallbacks). If an incomplete install is detected, the
diagnostic points to the app log and recommends reinstalling from the
official 0.7.0 release.

The Windows bootstrap silently reuses a user-installed `uvx.exe`, or downloads
the pinned official uv ZIP into a per-user tools directory after HTTPS and
SHA-256 verification. It does not modify `PATH`, require administrator rights
or open a console. A failed bootstrap leaves the main app recoverable and
surfaces the MCP problem in the tab/log.

## MCP: Serena and free-search

On first boot FreeCode atomically creates:

```text
<userData>/dsh-home/mcp/servers.json
<userData>/dsh-home/cordis.patch.yml
```

Both managed entries are enabled when their command can spawn. Open
Settings → Plugins → MCP to toggle them or open the exact JSON file. Only
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

Serena deliberately starts without `--project-from-cwd`: the Harness child cwd
is private `dsh-home`, not the selected project, so automatic discovery cannot
scan an entire drive. Before the first Serena call for a session project, the
bridge canonicalizes the workspace path and calls `activate_project`; the
activation and the requested call are serialized. Switching projects performs
one new activation after the previous call completes. Activation errors are
returned to the model and shown as degraded/failed MCP state.

free-search uses `free-search-mcp` through `uvx` and is the default HTTP-first
research route. It does not open a browser to search. The embedded browser is
used only when the user asks to view a result.

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
no-op. RTK and Caveman are optional PATH-resolved helpers in 0.7.0, not
bundled binaries. Only safe, plain commands are eligible for wrapping;
pipes, redirects, substitutions and other compound syntax are preserved.

Workspace Write remains the default permission mode. Sandbox decisions remain
the upstream contract: FreeCode does not widen permissions automatically and
distinguishes permission failures from tool/MCP failures.

## Updater and versioning

About reads `app.getVersion()`, so the packaged 0.7.0 binary says 0.7.0.
The app checks for updates at startup and every six hours. The update control
is the same circular primary button as Send, with the arrow pointing down.
When downloading, the tray tooltip/menu and a native notification say so; the
install/restart phase is also visible. The 0.7.0 gate keeps the startup path
green and does not require an upgrade from 0.4.3.

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
inside `vendor/deepseek-harness`. For 0.7.0 the required order is:

```text
freeze evidence → fetch/update upstream → replay ordered patches
  → verify upstream commit + patch manifest → test/typecheck
  → build runtime closure → package → installed smoke
```

Every product feature must have an owner file, a modular patch or shell-layer
implementation, a contract test and a replay/idempotence check. See
[docs/UPSTREAM-PATCHING.md](docs/UPSTREAM-PATCHING.md).

## Windows local release gate: 0.7.0 as released

Run from PowerShell on the maintainer Windows machine:

```powershell
pnpm install --frozen-lockfile
pnpm apply:upstream-patches
pnpm test
pnpm typecheck
pnpm build:vendor
pnpm build:shell
pnpm --filter @freecode/shell package:runtime
pnpm --filter @freecode/shell package
pnpm --filter @freecode/shell smoke:nsis
```

This gate passed for 0.7.0 with typecheck clean, the shell suite at 165/165,
all prepackage verifiers green (NSIS hooks, vendor freshness, runtime
manifest, native ABI), a clean install, `harness ready`, both model lanes
populated and a graceful shutdown. It still does not require an upgrade from
0.4.3; only clean installation and launch are release gates.

Tag `0.7.0` and the GitHub release (setup, portable, blockmap, `latest.yml`,
harness runtime tarball) were published from these artifacts.

Expected artifacts are under `apps/shell/release/`.

## Manual contributor builds for other operating systems

Linux and macOS are not release targets for 0.7.0, and Windows ARM64 is not
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
expect the Windows-only `package:runtime`/release gate to accept a non-Windows
target. Reinstall dependencies when switching between Windows and WSL so
native modules and workspace links are not mixed.

## Project and license

FreeCode is the [Akunimal/free-code-deepseek-harness](https://github.com/Akunimal/free-code-deepseek-harness)
fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Related projects: [OpenCode2API](https://github.com/jasonxu114514/opencode2api),
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness),
[RTK](https://github.com/rtk-ai/rtk),
[Caveman](https://github.com/JuliusBrussee/caveman),
[Serena](https://github.com/oraios/serena) and
[free-search-mcp](https://github.com/sweetcornna/free-search-mcp).

## Español

La guía completa en español está en [README.es.md](README.es.md). FreeCode
usa modelos OpenCode Free y mantiene el mismo inventario de upstream,
hardening y release local en ambos idiomas.

## Documentation index

- [Upstream feature inventory](docs/UPSTREAM-FEATURES.md)
- [0.7.0 release notes](release-notes-v0.7.0.md)
- [0.6.0 state ledger](docs/STATE-0.6.0.md)
- [0.6.0 roadmap](docs/ROADMAP-0.6.0.md)
- [0.6.0 audit and test plan](docs/AUDIT-0.6.0-TEST-PLAN.md)
- [0.7.0 state ledger](docs/STATE-0.7.0.md)
- [0.7.0 aggressive remediation roadmap](docs/ROADMAP-0.7.0.md)
- [Windows release and packaging](docs/RELEASE.md)
- [Historical roadmap](docs/ROADMAP.md)
- [Known issues](docs/KNOWN-ISSUES.md)
