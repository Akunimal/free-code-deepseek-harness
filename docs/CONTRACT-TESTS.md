# Contract tests

Contract tests protect the seams between this shell, the bundled Phoenix /
FreeLLMpool gateway and the vendored DeepSeek Harness. They run before
upstream subtree merges and manual releases. The v1.0.1 candidate verifies the
Phoenix source pin, build receipt, model allowlist, architecture, installed
payload hash and lifecycle without requiring a machine-local service. The
retired OpenCode2API implementation and adapter are no longer built or
packaged; v1.0.0 and earlier release notes remain historical.

The release contract also checks the portable Windows target, unique
setup/portable artifact names, the actual fork owner/repository, and the
manual-release policy. The Windows candidate targets v1.0.1; no artifact is
considered release-ready before the real clean-cache runtime gate passes.

Run them with:

```bash
pnpm test:contract
```

## Covered contracts

1. `dsh web --help` still exposes `--port` and `--host`.
2. `dsh web` still emits a loopback readiness URL.
3. The `llm-pi-ai` README still documents `apiKeyEnv`, `baseURL`, and `openai-completions` provider fields.
4. `POST /api` still accepts the `llm/listConfigurableProviders` client-request RPC envelope and reports the seeded provider with its current declared configuration shape.
5. The Phoenix adapter exposes the verified `auto` alias and concrete model
   IDs; the selector keeps Auto first.
6. A concrete model pin is routed only to its exact provider/model and does
   not silently fall back after an error.
7. Auto alone may retry eligible free routes pre-stream; it never changes
   provider/model after streaming is committed.
8. Cancellation releases pending route work and client errors do not poison
   provider health.
9. The installed Phoenix binary, receipt, model allowlist and license are
   required and hash/architecture-verified; an old gateway cannot satisfy the
   preflight.
10. The web root still serves parseable `window.__DSH_BOOT__` JSON; lazy entries
    may omit `immediately` and therefore mean `false`.
11. Every upstream client/web package is represented in
    `docs/UPSTREAM-FEATURES.md`; a new package fails this documentation contract
    until it is explained.

Tests that require a built upstream CLI are skipped in a bare checkout and become active after `pnpm build:vendor`. The manual release checklist builds the vendor first.

The shell suite adds supervisor smoke, provider seeding, model refresh, compatible-local-route discovery, secret storage, resource layout, updater behavior, and bounded log rotation tests.

## Manual release gate

GitHub Actions quota is protected by a local preflight contract. Releases are
performed manually; there is intentionally no release workflow. Do not push,
open or update a PR, create a release, or otherwise spend remote quota until
the equivalent local checks pass and the user explicitly authorizes the remote
operation.

The required preflight is `pnpm test`, `pnpm test:contract`, `pnpm typecheck`,
and the relevant build/package check for the changed surface. The optional
`pnpm verify:linux-appimage` command remains available from Linux/WSL for a
contributor-built Linux artifact, but it is outside the Windows release gate.
The Windows release gate builds an NSIS candidate in a unique OS-temporary
directory and statically verifies the NSIS package metadata; it does not install
the candidate or launch the FreeCode GUI. For runtime-dependent releases, the
mandatory `first-run-runtime-download` step runs
`scripts/verify-first-run-runtime-download.mjs` under the packaged Electron ABI.
It creates a genuinely empty scratch profile/cache, downloads the exact public
GitHub runtime through production bootstrap/updater code, validates SHA-256,
archive layout, manifest and ABI, then starts the downloaded DSH CLI hidden.
The gate also starts test-owned DSH CLI/Electron-as-Node and local MCP fixture
children under scratch paths, cleaning only their recorded process tree. It
never enumerates or kills unrelated processes. Static hashes, mocks, a preloaded
cache or an installer exit code do not replace this clean-cache proof. The
separate `smoke:nsis` install/launch/uninstall check is opt-in for a disposable
Windows VM only. The gate does not upgrade from `v0.4.3`; that version is only
the last operational reference. A failing local preflight blocks publication;
it is not a reason to use a remote workflow as a diagnostic run.

The Windows NSIS smokes also inspect the actual Start Menu and Desktop `.lnk`
files. Each link must target the installed executable and use the install
directory as `WorkingDirectory`/`Start in`; links proven to point at the exact
temporary smoke directory are removed during cleanup.
