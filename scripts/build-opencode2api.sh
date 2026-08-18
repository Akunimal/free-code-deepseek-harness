#!/usr/bin/env bash
# Builds opencode2api standalone binaries for all release platforms.
# Applies free-code patch(es) to the vendored source at build time, then
# restores vendor/ to pristine — vendor/ is NEVER left modified.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/vendor/opencode2api"
OUT_DIR="$ROOT/apps/shell/resources/opencode2api"
PATCH="$ROOT/patches/opencode2api-host-flag.patch"

# Locate go: PATH first, then common dev SDK location used on this machine
if command -v go >/dev/null 2>&1; then
  GO_BIN="$(command -v go)"
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
else
  OUT_NATIVE="$OUT_DIR"
  PATCH_NATIVE="$PATCH"
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
