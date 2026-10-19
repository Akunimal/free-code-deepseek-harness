# FreeCode DeepSeek Harness — managed MCP servers

FreeCode ships the MCP client bridge and a versioned product catalog. On first
boot it materializes three entries, enabled by default:

```text
<Electron userData>/dsh-home/mcp/servers.json
<Electron userData>/dsh-home/cordis.patch.yml
```

The portable build uses `data/dsh-home`. The generated patch contains only the
marked FreeCode block; user-owned rows survive upgrades and toggles.

## Included catalog

| ID | Server process | Purpose | Default |
|---|---|---|---|
| `free-search` | `uvx free-search-mcp` | HTTP-first search/fetch for agent research without opening a browser. | Disabled (binary not vendored) |

Serena was removed from the managed catalog in 0.8.0 and Engram in 1.0.0.
Independent LSP MCP rows are intentionally not included. A row persisted by an
older build (for example `engram`) is dropped on the next boot.

## Configuration and status

Open Settings → Plugins → MCP. The tab shows each toggle, command, live state,
registered tool count, the latest bounded error and the exact config path. The
tray reports how many enabled servers are ready. A server is not called ready
when its process merely exists; readiness requires:

```text
spawn → initialize → tools/list → schema validation → tool registration
```

The setting change writes JSON atomically, refreshes the child environment and
restarts only the Harness child. The Electron shell, pool and user data remain
alive. Manual edits should change only `enabled`; restart FreeCode after a
manual edit.

Example:

```json
{
  "version": 1,
  "servers": [
    { "id": "free-search", "enabled": false }
  ]
}
```

The deterministic checkout helper is:

```powershell
pnpm setup:mcp --all
```

It uses argument arrays, restrictive file permissions where supported and
fails closed for a selected server whose prerequisite cannot be installed.

## free-search and uvx

Research is embedded-browser-first when web evidence is needed. `free-search`
is the HTTP-only fallback if the embedded browser is unavailable or cannot
answer; its engines do not need a Gemini key. This fallback does not authorize
opening an external browser or replacing the preferred browser in silence.

On Windows FreeCode first reuses a user-installed `uvx.exe`. If absent, the
shell silently downloads the pinned official uv ZIP over HTTPS, verifies its
SHA-256 and extracts `uvx.exe` into a per-user tools directory. It does not
mutate `PATH`, require administrator rights or open a console. Failure is
recoverable: the application still boots, and the MCP tab/log reports the
missing prerequisite.

The uv bootstrap is a product dependency for MCP startup; free-search remains
separately toggleable. It is not a reason to install a
second FreeCode application instance.

## Serena (removed in 0.8.0)

Serena was part of the managed catalog through 0.7.0 and provided semantic
code navigation via the packaged headless launcher. It was removed in 0.8.0;
no Serena process, config entry or bridge is shipped. If you have a custom
`servers.json` row for Serena from a previous install, it will remain intact
(user-owned rows are preserved) but the managed entry is gone.

## Tool-call contract

Every bridged call records a bounded machine-readable record containing
`requestId`, server, raw tool, attempt, status and duration. Status values are:

```text
success
failed-local
failed-mcp
failed-provider
failed-timeout
failed-permission
failed-invalid-response
```

Empty/legacy/malformed responses are explicit invalid-response failures. A
retry is allowed only for a transient error and is bounded; side-effecting
tools are not blindly repeated. Arguments, image bytes and sensitive OCR text
are not placed in the log.
