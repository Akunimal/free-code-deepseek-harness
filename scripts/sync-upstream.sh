#!/usr/bin/env bash
set -Eeuo pipefail

# Pull the vendored DeepSeek Harness subtree into an isolated branch, then run
# the contracts that protect this product's integration surface. The script
# deliberately never updates dev/main for the caller.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"

UPSTREAM_REMOTE="${DSH_UPSTREAM_REMOTE:-https://github.com/deepseek-ai/deepseek-harness.git}"
UPSTREAM_REF="${DSH_UPSTREAM_REF:-main}"
PREFIX="${DSH_UPSTREAM_PREFIX:-vendor/deepseek-harness}"
STAMP="$(date -u +%Y%m%d)"
BRANCH="upstream-sync/${STAMP}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "sync-upstream: working tree must be clean; commit or stash local changes first" >&2
  exit 2
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "sync-upstream: branch already exists: $BRANCH" >&2
  exit 2
fi

BASE="$(git branch --show-current)"
if [[ -z "$BASE" ]]; then
  echo "sync-upstream: detached HEAD is not supported" >&2
  exit 2
fi

cleanup() {
  if [[ "${SYNC_CREATED_BRANCH:-}" == 1 ]]; then
    echo "sync-upstream: changes remain on $BRANCH (base was $BASE)" >&2
  fi
}
trap cleanup EXIT

echo "sync-upstream: fetching $UPSTREAM_REMOTE#$UPSTREAM_REF"
git fetch --no-tags "$UPSTREAM_REMOTE" "$UPSTREAM_REF"
git switch -c "$BRANCH"
SYNC_CREATED_BRANCH=1

echo "sync-upstream: subtree pull into $PREFIX"
git subtree pull --prefix="$PREFIX" "$UPSTREAM_REMOTE" FETCH_HEAD --squash

echo "sync-upstream: running contract tests"
if ! pnpm test:contract; then
  echo "sync-upstream: contract tests failed" >&2
  exit 2
fi

echo "sync-upstream: running typechecks"
if ! pnpm typecheck; then
  echo "sync-upstream: typecheck failed" >&2
  exit 2
fi

echo "sync-upstream: ready for review on $BRANCH"
