#!/usr/bin/env bash
# Builds opencode2api standalone binaries for all release platforms.
# Applies free-code patch(es) to the vendored source at build time, then
# restores vendor/ to pristine — vendor/ is NEVER left modified.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/vendor/opencode2api"
OUT_DIR="$ROOT/apps/shell/resources/opencode2api"
PATCH="$ROOT/patches/opencode2api-host-flag.patch"
ROLE_PATCH="$ROOT/patches/opencode2api-developer-role.patch"
PUBLIC_MODEL_PATCH="$ROOT/patches/opencode2api-public-model-fallback.patch"
ROLE_TEST_PATH="vendor/opencode2api/internal/app/developer_role_compatibility_test.go"

# Locate go: PATH first, then common dev SDK location used on this machine
if command -v go >/dev/null 2>&1; then
  GO_BIN="$(command -v go)"
elif command -v go.exe >/dev/null 2>&1; then
  GO_BIN="$(command -v go.exe)"
elif [ -x "$HOME/go-sdk/go/bin/go.exe" ]; then
  GO_BIN="$HOME/go-sdk/go/bin/go.exe"
elif [ -x "$HOME/go-sdk/go/bin/go" ]; then
  GO_BIN="$HOME/go-sdk/go/bin/go"
else
  echo "[opencode2api] ERROR: go toolchain not found" >&2
  exit 1
fi
echo "[opencode2api] using go: $GO_BIN"

mkdir -p "$OUT_DIR"

# Git Bash needs native Windows paths when it invokes go.exe. macOS/Linux Go
# expects ordinary POSIX paths. Keeping this distinction here makes the same
# script usable by local builds and all three release runners.
if command -v cygpath >/dev/null 2>&1; then
  OUT_NATIVE="$(cygpath -w "$OUT_DIR")"
  PATCH_NATIVE="$(cygpath -w "$PATCH")"
  ROLE_PATCH_NATIVE="$(cygpath -w "$ROLE_PATCH")"
  PUBLIC_MODEL_PATCH_NATIVE="$(cygpath -w "$PUBLIC_MODEL_PATCH")"
else
  OUT_NATIVE="$OUT_DIR"
  PATCH_NATIVE="$PATCH"
  ROLE_PATCH_NATIVE="$ROLE_PATCH"
  PUBLIC_MODEL_PATCH_NATIVE="$PUBLIC_MODEL_PATCH"
fi

PATCHED=0

restore_vendor() {
  if [ "$PATCHED" = "1" ]; then
    cd "$ROOT"
    git checkout -- vendor/opencode2api
    echo "[opencode2api] vendor/ restored to pristine"
  fi
}
trap restore_vendor EXIT

# Idempotent patch application (paths are repo-root relative): add -host flag
# so workers bind 127.0.0.1 only. Applied from the repo root.
if ! grep -q 'hostAddr' "$SRC/internal/app/server.go"; then
  git apply --check "$PATCH_NATIVE"
  git apply "$PATCH_NATIVE"
  PATCHED=1
  echo "[opencode2api] applied patch: opencode2api-host-flag"
fi

# DeepSeek chat completions reject the OpenAI-compatible developer role. Map
# it to the supported system role at the upstream wire boundary.
if ! grep -q 'while OpenAI-compatible callers may send developer' "$SRC/internal/app/chat.go"; then
  # A dirty checkout may already carry the patch's regression test as an
  # untracked file. Exclude only that file in that case; keep the source
  # hunk applied and never overwrite the user's file.
  if [ -e "$ROOT/$ROLE_TEST_PATH" ]; then
    git apply --check --exclude="$ROLE_TEST_PATH" "$ROLE_PATCH_NATIVE"
    git apply --exclude="$ROLE_TEST_PATH" "$ROLE_PATCH_NATIVE"
  else
    git apply --check "$ROLE_PATCH_NATIVE"
    git apply "$ROLE_PATCH_NATIVE"
  fi
  PATCHED=1
  echo "[opencode2api] applied patch: opencode2api-developer-role"
fi

# Public model ids omit the upstream -free suffix. Keep that mapping working
# during a transient model-catalog outage, when the worker cache is empty.
if ! grep -q 'modelCatalogUnavailable' "$SRC/internal/app/auth.go"; then
  git apply --check "$PUBLIC_MODEL_PATCH_NATIVE"
  git apply "$PUBLIC_MODEL_PATCH_NATIVE"
  PATCHED=1
  echo "[opencode2api] applied patch: public-model-fallback"
fi

cd "$SRC"

export CGO_ENABLED=0

echo "[opencode2api] building windows/amd64..."
GOOS=windows GOARCH=amd64 "$GO_BIN" build -ldflags="-s -w" -o "$OUT_NATIVE/opencode2api-win-x64.exe" ./cmd/opencode2api

echo "[opencode2api] building darwin/arm64..."
GOOS=darwin  GOARCH=arm64 "$GO_BIN" build -ldflags="-s -w" -o "$OUT_NATIVE/opencode2api-mac-arm64" ./cmd/opencode2api

echo "[opencode2api] building darwin/amd64..."
GOOS=darwin  GOARCH=amd64 "$GO_BIN" build -ldflags="-s -w" -o "$OUT_NATIVE/opencode2api-mac-x64" ./cmd/opencode2api

echo "[opencode2api] building linux/amd64..."
GOOS=linux   GOARCH=amd64 "$GO_BIN" build -ldflags="-s -w" -o "$OUT_NATIVE/opencode2api-linux-x64" ./cmd/opencode2api

echo "[opencode2api] done: 4 binaries in $OUT_DIR"
ls -la "$OUT_DIR"
