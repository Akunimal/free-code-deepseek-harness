# Upstream synchronization

The DeepSeek Harness is vendored at `vendor/deepseek-harness` as a git subtree. Product code depends on its web boot protocol, the `dsh web` CLI, provider configuration schema, and client plugin graph, so upstream updates are reviewed as integration changes rather than copied into `dev` blindly.

## Safe workflow

From Git Bash at the repository root:

```bash
./scripts/sync-upstream.sh
```

The script:

1. Requires a clean working tree.
2. Fetches `https://github.com/deepseek-ai/deepseek-harness.git` at `main`.
3. Creates `upstream-sync/YYYYMMDD` from the current branch.
4. Pulls the upstream subtree with `git subtree ... --squash`.
5. Runs the contract suite and workspace typechecks.
6. Leaves the result on the review branch; it never updates `dev` or `main` automatically.

The command exits with status `2` for a dirty tree, an existing sync branch, a failed subtree pull, a failed contract test, or a failed typecheck. A failed branch is intentionally preserved so the conflict or regression can be inspected.

## Overrides

Use environment variables when testing a fork or a release branch:

```bash
DSH_UPSTREAM_REMOTE=https://github.com/example/deepseek-harness.git \
DSH_UPSTREAM_REF=v0.1.0 \
./scripts/sync-upstream.sh
```

`DSH_UPSTREAM_PREFIX` is available for a temporary alternate subtree location, but production syncs must keep `vendor/deepseek-harness`.

## Review checklist

- Inspect the squashed subtree commit and `git diff BASE...upstream-sync/YYYYMMDD`.
- Run `pnpm test:contract`, the adapter/package suites, and the built harness smoke test.
- Pay special attention to `dsh web` flags, readiness output, `/api/llm.providers`, `settings.yaml`, `/v1/models`, SSE streaming, and `window.__DSH_BOOT__`.
- Rebuild the runtime stage before accepting a change to CLI or client packages.
- Update `docs/UPSTREAM-FEATURES.md` if upstream adds or removes an exposed web capability.
- Merge the reviewed branch into `dev` only after all gates pass.
