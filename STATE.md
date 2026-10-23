# STATE: Free.ai keyless provider in Phoenix

Handoff for the next agent. Read this first, then `AGENTS.md`.

Historical handoffs (0.6.0 to 0.7.0) are in `docs/historial/state.md`. This file
replaces them for the current work.

## Where things stand

- Repo: `I:\DeepSeek-Harness\free-code-deepseek-harness`, Windows x64, Git Bash.
- `main` = `27985537ac` = `origin/main`. Nothing from this work is pushed.
- Working branch: `feat/phoenix-freeai`, three commits on top of `main`:
  - `cd41824477` feat(phoenix): add keyless Free.ai provider
  - `977fc421d6` build(phoenix): track pinned gateway and headless helper binaries
  - (docs commit with this file, see `git log -1`)
- `git status` on the branch is clean except two pre-existing untracked paths
  under `vendor/deepseek-harness/` (`8r2I7CVhPYV4BrPJSGusQ/` and a snapshot file
  with an encoded name). They are not ours. Do not add them.
- Not done: no PR, no push, no merge. Ask the user before pushing.

## What Phoenix serves now

Five keyless or key-optional providers, 25 model IDs including `auto`. Every concrete
route passed a live OpenAI tool call on 2026-10-23 (`PHOENIX_TOOL_VERIFIED_IDS` in
`scripts/phoenix-catalog.mjs`). Dynamic Kilo routers and Nemotron stay excluded:

- `pollinations`, `ovh`, `kilo`: keyless, from the pinned FreeLLMpool slice.
- `llm7`: key optional (`LLM7_API_KEY`), from the pinned slice.
- `freeai` (new): `api.free.ai/v1`, keyless. Routes `freeai/qwen3-coder` and
  `freeai/qwen-coder`.

## Architecture rules (do not break)

- `vendor/freellmpool` is the pinned upstream: 0xzr/freellmpool, commit
  `e4411650da95edf3002c6789ccd1c816aedae1d4`, v0.13.0. Do not edit it. Pin checks
  live in `scripts/freellmpool-staging.mjs` (`assertUpstreamPin`).
- Provider slice = upstream sections for ids in `PHOENIX_PROVIDER_ORDER`, then
  `apps/shell/resources/phoenix/freecode-providers.toml` (FreeCode-owned, for
  providers upstream does not carry). `scripts/phoenix-catalog.mjs` builds both
  into `phoenix-providers.toml` and `phoenix-model-ids.json`.
- Policy enforced by the generator: no Nemotron routes, no dynamic Kilo routes
  (`kilo/openrouter/free`, `kilo/kilo-auto/free`), no `auth = "key"` providers.
- `phoenix-providers.toml` and `phoenix-entry.py` are compiled INTO
  `freellmpool-win-x64.exe` (PyInstaller `--add-data`, entry reads `_MEIPASS`).
  Changing either one, or the provider slice, requires a gateway rebuild.
- `freecode-build-receipt.json` pins `sourceSha256`, `binarySha256` and
  `modelsCatalogSha256`. `phoenix-payload.ts` checks the allowlist hash.

## Files changed for Free.ai (cd41824)

- `apps/shell/resources/phoenix/freecode-providers.toml` (new): the Free.ai block.
- `scripts/phoenix-catalog.mjs`: `PHOENIX_PROVIDER_ORDER` +`freeai`; quality
  scores `freeai/*` = 0.5 (neutral, Free.ai publishes no benchmark); the slice is
  appended via `readFreeCodeSlice(root)`.
- `apps/shell/resources/phoenix/phoenix-entry.py`: `PHOENIX_PROVIDERS` +`freeai`.
- `apps/shell/src/main/phoenix-payload.ts`: `ALLOWED_PROVIDERS` +`freeai`.
- `scripts/phoenix-runtime-gate.mjs`: `PROVIDER_IDS` +`freeai`.
- `apps/shell/src/main/model-refresher.ts`: `freeai/*` capped at 32768 (no native
  window published).
- `scripts/freellmpool-staging.mjs`: source fingerprint includes
  `freecode-providers.toml`. Test fixture updated to match.
- Tests: `scripts/phoenix-catalog.test.mjs`,
  `scripts/freellmpool-staging.test.mjs`, `apps/shell/tests/refresher.test.ts`.
- Regenerated: `phoenix-providers.toml`, `phoenix-model-ids.json`,
  `freecode-build-receipt.json`.

## Binaries committed (977fc42)

- `apps/shell/resources/phoenix/freellmpool-win-x64.exe` (33 MB). PyInstaller
  onefile, built from the pinned source with Python 3.14.2 AMD64 and PyInstaller
  6.20.0. `binarySha256` = `ca6fd21d86875fd6131ddfbb8c6142dd82b6c8f9f02e1ed2b8940705d6787fbe`.
- `apps/shell/resources/freecode/headless-host.exe` and `headless-host.json`
  (2.5 MB, Go helper, GUI subsystem). Rebuilt only when the attestation fails
  (`scripts/build-headless-host.mjs`), so a committed, matching copy needs no Go.
- `.gitignore`: `apps/shell/resources/freecode/` became `freecode/*` with three
  re-includes (`.gitkeep`, `headless-host.exe`, `headless-host.json`). The phoenix
  `.exe` has a re-include after `*.exe`. Release setup/portable stay ignored, and
  the existing comment "do not commit binaries" still applies to release output.
- Each gateway rebuild adds another ~33 MB to git history. Rebuild only when
  needed.

## How to add or change a provider

1. Probe first, with no key and no Authorization header. Three repeat non-empty
   completions plus a tool call per route, directly against the endpoint:
   ```bash
   curl -s -X POST https://api.free.ai/v1/chat/completions \
     -H 'Content-Type: application/json' \
     -d '{"model":"qwen3-coder","messages":[{"role":"user","content":"Reply with the word pong."}],"max_tokens":8}'
   ```
   Only keep routes that return 200 with content. A `401` or `402` means the
   route needs a key or payment. A `403` on free tiers means the route is limited
   to its own client.
2. Put the block in `apps/shell/resources/phoenix/freecode-providers.toml`
   (or in the pinned slice if upstream carries it).
3. Add the id to `PHOENIX_PROVIDER_ORDER` and to the other provider lists:
   `phoenix-entry.py`, `phoenix-payload.ts`, `scripts/phoenix-runtime-gate.mjs`.
   Add quality scores (`phoenixModelQualityScore` throws on a missing one) and,
   for unknown native windows, a conservative cap in `model-refresher.ts`.
4. Regenerate and verify:
   `node scripts/phoenix-catalog.mjs --write && node scripts/phoenix-catalog.mjs --verify`
5. Rebuild the gateway (needs Python 3.14.2 AMD64 with PyInstaller 6.20.0 and the
   pinned runtime deps from `scripts/freellmpool-build-lock.json`):
   `PYTHON=python node scripts/build-freellmpool.mjs`
   Then `node scripts/freellmpool-staging.mjs --verify`.
6. Tests:
   ```bash
   node --test scripts/phoenix-catalog.test.mjs scripts/freellmpool-staging.test.mjs scripts/build-freellmpool.test.mjs scripts/phoenix-runtime-gate.test.mjs scripts/phoenix-replacement-contract.test.mjs
   cd apps/shell && corepack pnpm exec tsc -p tsconfig.json --noEmit
   cd apps/shell && corepack pnpm exec vitest run --config vitest.config.ts
   ```
   Last result: 17/17 Phoenix node tests, typecheck clean, vitest 59 files / 394 tests.
7. Runtime smoke: `node scripts/verify-phoenix-runtime.mjs` needs `apps/shell/dist`.
   That folder existed in the working tree. The build command
   (`corepack pnpm --filter @freecode/shell build`) was not re-run in this session.
   Last result: pass, 26 models.

Note: `corepack pnpm --filter @freecode/shell test` runs `build-headless-host.mjs`,
which only rebuilds when the attestation is stale. Go is installed at
`/c/Users/inti_/go-sdk/go/bin/go` (go1.26.6) if a rebuild is needed.

## Verification done for Free.ai (2026-10-23)

- Direct anonymous: `qwen3-coder` 3/3 "pong", tool call returned `get_weather`.
  `qwen-coder` 3/3 "pong", tool call OK.
- Through the local gateway on loopback (port chosen at random, per-instance key):
  both routes 3/3 "pong"; `freeai/qwen3-coder` tool call OK.
- Clean clone of the branch: `freellmpool-staging.mjs --stage-built` then
  `--verify` pass with no compile step. `git status` stays clean after staging,
  so the receipt is deterministic. `build-headless-host.mjs --verify` passes.
- One early run returned `502` with `WinError 10051` (network unreachable) on all
  Free.ai routes. Later runs passed on the same machine. Treat it as transient,
  and re-run before concluding a route is dead.

## Providers evaluated and rejected (do not re-probe without a reason)

- OpenRouter `:free`: `401 No cookie auth credentials found` anonymously. The user
  said no. Upstream also marks its key as required.
- OpenCode Zen (keyless upstream block): free models `403 "free tier can only be
  used from within OpenCode"`, paid models `401 Missing API key`. Out.
- ApiAirforce (`api.airforce`): lists many "free" models, but anonymous calls
  return `401 Missing Authorization` or `402 requires an active subscription`.
- KeylessAI (`keylessai.thryx.workers.dev`): host did not resolve from here.
  Untested. It reportedly routes to Pollinations and ApiAirforce.
- Groq, Google AI Studio, NVIDIA NIM, xAI Grok: keyed. The user rejected them.
- Hugging Face router: needs `HF_TOKEN`, about $0.10/month of credit.
- Cerebras: sources disagree on whether a card is required. Not verified.
- Packages `llmf` (MIT, v0.2.0, released 2026-10-23), `freellmpool` (the upstream
  already used): redundant with the current backends.
- `fishr` (advertises Grok, Sonnet and GPT without keys): unofficial access to
  commercial models. Legal and privacy risk. Do not use.
- `llm4free`: general toolkit (search, temp email, phone numbers), not an LLM gateway.
- `llm-keypool` (github.com/piyush-tyagi-13/llm-keypool): rotates keys across
  several accounts to multiply free limits. Likely violates provider terms, and it
  needs keys. Do not install or run it.
- `g4f`-based stacks (e.g. `mn3-99/keyless-llm-stack`): reverse-engineered
  providers. Not acceptable for Phoenix.

## Discovery aid: stillworks

`GET https://stillworks.supercapybara.com/api/llm/up` returns endpoints that
answered with no Authorization header, ranked by recent success, with proved
features (tools, json_schema, vision). It is a third-party live registry (MIT,
github.com/bon5co/stillworks). Use it to find candidates, not to verify them.
Entries go stale: `Meta-Llama-3_3-70B-Instruct` on Free.ai answered 400 "not a model
this endpoint serves" during testing. Always re-run step 1 above before adding.

## Free.ai terms (read before relying on it)

- Operator: Muddy Holdings LLC. Terms: no training on input or output without
  explicit consent. Privacy: logs "usage data" and "basic interaction data"; the
  policy does not say whether prompt text is stored. Do not send confidential code.
- Anonymous quotas are not documented. The registry warns that keyless quotas are
  per IP, that endpoints can start to answer 402/429, and that a key requirement
  can appear later.
- Several models are self-hosted open-weight (the model list reports
  `self_hosted: true`, `license: Apache 2.0` for `qwen7b`).

## Open items for the next agent

1. Ask the user before pushing `feat/phoenix-freeai` or merging. Nothing has been
   pushed and no PR exists.
2. Docs do not mention Free.ai yet. No doc lists the full Phoenix provider set, so
   nothing is stale. `README.md:18` only describes Kilo routes.
3. `docs/historial/state.md` and other historical files are unchanged.
4. Phoenix `auto` uses `model-refresher.ts` caps; the new routes are capped at
   32K until a native window is reviewed.
5. If the user asks for another provider, use the checklist above and start with a
   probe. Most candidates in the registry fail anonymous completions.
6. Process hygiene: PyInstaller onefile spawns a child process. Killing only the
   parent leaves `freellmpool-win-x64.exe` running. Stop the tree, and match
   processes by their command line (port, `--state-dir`). Never stop a gateway
   whose `--state-dir` is not one of your test directories. The user's installed
   FreeCode app may run its own gateway; that process is not yours.
