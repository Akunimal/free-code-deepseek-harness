#!/usr/bin/env bash
# Builds opencode2api standalone binaries for all release platforms.
# Source of truth: vendor/opencode2api (upstream v1.3.2 lineage with the
# anonymous Zen free lane: canonical ses_ sessions, agent-shaped bodies and
# the exact upstream header contract). The historical free-code patches
# (host-flag, developer-role, public-model-fallback) targeted the retired
# pre-v1 fork and are obsolete: v1.3.2 binds loopback via config `listen`,
# and its pricing/name-based fallback subsumes the public-model patch.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/vendor/opencode2api"
OUT_DIR="$ROOT/apps/shell/resources/opencode2api"
VERSION="v1.3.2"

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

if [ ! -f "$SRC/cmd/opencode2api/main.go" ]; then
  echo "[opencode2api] ERROR: vendored source missing at $SRC" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Git Bash needs native Windows paths when it invokes go.exe. macOS/Linux Go
# expects ordinary POSIX paths. Keeping this distinction here makes the same
# script usable by local builds and all three release runners.
if command -v cygpath >/dev/null 2>&1; then
  OUT_NATIVE="$(cygpath -w "$OUT_DIR")"
  SRC_NATIVE="$(cygpath -w "$SRC")"
else
  OUT_NATIVE="$OUT_DIR"
  SRC_NATIVE="$SRC"
fi

cd "$SRC"

export CGO_ENABLED=0
LDFLAGS="-s -w -X main.version=${VERSION}"

echo "[opencode2api] building windows/amd64..."
GOOS=windows GOARCH=amd64 "$GO_BIN" build -ldflags="$LDFLAGS" -o "$OUT_NATIVE/opencode2api-win-x64.exe" ./cmd/opencode2api

echo "[opencode2api] building darwin/arm64..."
GOOS=darwin  GOARCH=arm64 "$GO_BIN" build -ldflags="$LDFLAGS" -o "$OUT_NATIVE/opencode2api-mac-arm64" ./cmd/opencode2api

echo "[opencode2api] building darwin/amd64..."
GOOS=darwin  GOARCH=amd64 "$GO_BIN" build -ldflags="$LDFLAGS" -o "$OUT_NATIVE/opencode2api-mac-x64" ./cmd/opencode2api

echo "[opencode2api] building linux/amd64..."
GOOS=linux   GOARCH=amd64 "$GO_BIN" build -ldflags="$LDFLAGS" -o "$OUT_NATIVE/opencode2api-linux-x64" ./cmd/opencode2api

echo "[opencode2api] done: 4 binaries in $OUT_DIR"
ls -la "$OUT_DIR"
