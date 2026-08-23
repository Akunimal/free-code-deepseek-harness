# Contract tests

Contract tests protect the seams between this shell, `opencode2api`, and the vendored DeepSeek Harness. They run before upstream subtree merges and manual releases. The local preflight builds the native `opencode2api` resources first and builds the adapter package before importing it, so the suite is valid from a clean checkout rather than depending on ignored local `dist/` or `resources/` output.

The release contract also checks the portable Windows target, unique setup/portable artifact names, the actual fork owner/repository, and the manual-release policy. Pool unit coverage verifies the 1..16 account/worker slider clamp; the desktop overlay routes live changes through zod-validated preload IPC.

Run them with:

```bash
pnpm test:contract
```

## Covered contracts

1. `dsh web --help` still exposes `--port` and `--host`.
2. `dsh web` still emits a loopback readiness URL.
3. The `llm-pi-ai` README still documents `apiKeyEnv`, `baseURL`, and `openai-completions` provider fields.
4. `POST /api/llm.providers` still accepts the client-request RPC envelope and reports the seeded provider as active and declared.
5. The load balancer serves `GET /v1/models` as `{ data: [{ id }] }`.
6. The load balancer preserves SSE `data:` frames from `POST /v1/chat/completions`.
7. The OpenCode worker binary still accepts `-port`, `-password`, and `-config`.
8. The web root still serves parseable `window.__DSH_BOOT__` JSON; lazy entries may omit `immediately` and therefore mean `false`.
9. The load balancer returns a JSON `503` when no worker is healthy.
10. Every upstream client/web package is represented in `docs/UPSTREAM-FEATURES.md`; a new package fails this documentation contract until it is explained.

Tests that require a built upstream CLI are skipped in a bare checkout and become active after `pnpm build:vendor`. The manual release checklist builds the vendor first.

The shell suite adds supervisor smoke, provider seeding, model refresh, compatible-local-route discovery, secret storage, resource layout, updater behavior, and bounded log rotation tests.

## Manual release gate

GitHub Actions quota is protected by a local preflight contract. Releases are
performed manually; there is intentionally no release workflow. Do not push,
open or update a PR, create a release, or otherwise spend remote quota until
the equivalent local checks pass and the user explicitly authorizes the remote
operation.

The required preflight is `pnpm test`, `pnpm test:contract`, `pnpm typecheck`,
and the relevant build/package check for the changed surface. A failing local
preflight blocks publication; it is not a reason to use a remote workflow as a
diagnostic run.
