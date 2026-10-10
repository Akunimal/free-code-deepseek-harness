# Upstream sync and FreeCode patches

FreeCode keeps `vendor/deepseek-harness` as an upstream subtree and keeps
product-owned changes in the ordered patch stack under `patches/upstream/`.
The stack is intentionally small and fail-closed: a future upstream change
that invalidates a patch stops the sync/build until the patch is reviewed and
refreshed.

## Required order

```text
fetch upstream
  → git subtree pull --prefix=vendor/deepseek-harness
  → pnpm apply:upstream-patches
  → pnpm prepare:upstream
  → tests, typecheck, bundle freshness, package
```

Use `scripts/sync-upstream.sh` or `scripts/update-upstream-local.mjs`; both
apply the stack automatically after the subtree pull. `pnpm test`,
`pnpm test:contract`, `pnpm build`, and `pnpm package:runtime` also apply it,
so a clean checkout is reproducible after the patch step.

## Windows and WSL dependency boundary

The source tree is shared, but `vendor/deepseek-harness/node_modules` is not a
portable source artifact. Windows needs junctions and Windows native modules;
WSL needs Linux symlinks and Linux native modules. Do not run `pnpm install` in
both environments against the same dependency directory without reinstalling
for the active OS. The workspace-link step now fails with an explicit
cross-platform diagnostic instead of surfacing a raw `EACCES` from `lstat`.

When switching OS, remove only the generated vendor dependency tree (or its
`node_modules/@deepseek-ai` link scope) from the OS that created it, then run
the matching frozen install before applying patches and building. Product
source, the upstream subtree, patch files, and user data are never removed by
this recovery step.

## Patch ownership

- `010-freecode-dialog-bridge.patch` restores the Electron dialog bridge
  contract for the Win32 directory picker and its regression tests.
- `020-freecode-browser-tool.patch` restores the embedded browser tool bridge
  used by the FreeCode desktop shell.
- `030-freecode-shell-optimizers.patch` restores RTK and Caveman settings and
  wrappers in both local shell executors, with staged controls on the new Shell
  settings card and tests for parsing, live toggles, and safe command selection.
- `040-freecode-branding.patch` keeps the product identity as FreeCode while
  retaining upstream's local-build version badge structure.
- `050-cross-platform-tsdown-root.patch` keeps the upstream client bundle
  resolvable on Windows, Linux, and WSL builds.
- `060-freecode-settings-and-mcp-ui.patch` adds the authenticated Electron
  file-open bridge and the Settings → Plugins → MCP tab without editing the
  upstream source permanently.
- `070-freecode-standard-mcp-preset.patch` composes the managed MCP rows into
  the upstream `Standard` agent preset, where model-facing tools are visible;
  runtime environment flags keep the persisted toggles authoritative.
- `080-freecode-headless-persistent-terminal.patch` keeps persistent terminal
  execution behind the upstream process seam without opening a console.
- `085-freecode-mcp-status-channel.patch` adds the bounded host-status channel
  used to report MCP readiness without scraping human log text.
- `090-freecode-mcp-headless-diagnostics.patch` bounds MCP stderr and keeps
  connection diagnostics in the structured log.
- `100-freecode-mcp-contracts-and-project-activation.patch` canonicalizes the
  selected session cwd and serializes project activation with dependent MCP
  calls; it also emits bounded, redacted tool-call diagnostics. MCP result
  schema validation now comes from the upstream client contract.
- `110-freecode-mimo-thinking-toggle.patch` keeps MiMo's binary thinking
  contract separate from unsupported reasoning-effort controls.
- `120-freecode-ocr-fallback.patch` adds bounded Tesseract fallback for
  text-only image paths.
- `130-freecode-mcp-status-channel.patch` adds degraded/failed status events
  without coupling the upstream client to the Electron host.
- `140-freecode-spanish-locale.patch` adds Spanish (es) as a modular
  upstream-replayable locale: LOCALE_IDS, es dictionary, settings dictionary,
  metadata, and locale.register calls. The shell-side i18n (apps/shell) was
  already complete; this patch closes the upstream web client gap.

Only files under `vendor/deepseek-harness/` may be changed by this stack. The
apply script accepts an already-applied stack, rejects partial/ambiguous
application, and runs `git diff --check` over the result.

The managed FreeCode MCP catalog is intentionally separate from this vendor
patch stack. `apps/shell/src/main/mcp-home.ts` owns the versioned catalog and
atomically regenerates only its marked `cordis.patch.yml` block. The renderer
gets read/toggle/open-config operations through validated IPC; it cannot write
arbitrary paths. This keeps MCP additions modular and makes an upstream sync
reviewable: refresh patch 060 and its contracts if upstream changes the
settings slot or native path opener, then rerun the full gate.

Do not edit the vendored files as the long-term source of a product feature.
Update the corresponding patch, rerun the complete verification gates, and
keep the upstream subtree itself free of FreeCode-only commits whenever the
feature can be expressed as an overlay.

## Patch manifest

`patches/upstream/upstream-patches.json` is the machine-readable manifest.
Every `.patch` file in `patches/upstream/` must be declared; undeclared files
cause `apply-upstream-patches.mjs` to reject the stack. The manifest records
order, owner, description, seam, contract tests, vendorOnly flag, and the
upstream sync commit/version.

Verification:

    node scripts/verify-upstream-patch-stack.mjs

This emits a JSON report covering manifest validity, order, vendor-only
constraint, idempotency, replay, and whitespace. A non-zero exit means a
check failed.
