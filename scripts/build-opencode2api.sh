#!/usr/bin/env bash
# Builds opencode2api standalone binaries for all release platforms.
# Source of truth: vendor/opencode2api at the upstream version recorded in
# UPSTREAM_VERSION. The v1.3.8 update preserves canonical ses_ sessions,
# improves free-model availability probing/manual selection, and includes
# the current OpenCode request contract. Older FreeCode patches for the
# retired pre-v1 fork remain obsolete: v1.3.2+ binds loopback via config
# `listen`, and its pricing/name-based fallback subsumes public-model fallback.
#
# FreeCode vendor tweak (kept across upstream updates, see pool.go CursorFor):
# the anonymous lane always starts on proxies[0] ('direct'); any non-2xx
# advances to Tor in-request. Re-apply and rebuild after every vendor refresh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/vendor/opencode2api"
OUT_DIR="$ROOT/apps/shell/resources/opencode2api"
VERSION="$(cat "$SRC/UPSTREAM_VERSION")"
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "[opencode2api] ERROR: invalid upstream version '$VERSION' in $SRC/UPSTREAM_VERSION" >&2
  exit 1
fi
echo "[opencode2api] source version: $VERSION"

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

# Materialize only the current replayable FreeCode protocol overlay.
node "$ROOT/scripts/apply-opencode2api-patches.mjs"

# Windows Go launched from Git Bash/WSL needs a native Windows output path;
# otherwise it can report success while writing outside the repository. Native
# macOS/Linux Go must keep POSIX paths even if a path-conversion utility exists.
WINDOWS_GO_FROM_WSL=false
if [[ "$GO_BIN" == *.exe ]]; then
  if command -v cygpath >/dev/null 2>&1; then
    OUT_NATIVE="$(cygpath -w "$OUT_DIR")"
  elif command -v wslpath >/dev/null 2>&1; then
    OUT_NATIVE="$(wslpath -w "$OUT_DIR")"
    WINDOWS_GO_FROM_WSL=true
  else
    echo "[opencode2api] ERROR: Windows Go requires cygpath or wslpath to write output paths safely" >&2
    exit 1
  fi
else
  OUT_NATIVE="$OUT_DIR"
fi

if [[ "$WINDOWS_GO_FROM_WSL" == true ]]; then
  set_wslenv_entry() {
    local name="$1"
    local entry
    local updated=""
    local -a entries=()
    IFS=':' read -r -a entries <<< "${WSLENV:-}"
    for entry in "${entries[@]}"; do
      if [[ -n "$entry" && "${entry%%/*}" != "$name" ]]; then
        updated="${updated:+${updated}:}${entry}"
      fi
    done
    WSLENV="${updated:+${updated}:}${name}/w"
  }
  # /w carries Linux variables into the Windows process launched by WSL.
  set_wslenv_entry GOOS
  set_wslenv_entry GOARCH
  set_wslenv_entry CGO_ENABLED
  export WSLENV
fi

cd "$SRC"

export CGO_ENABLED=0
LDFLAGS="-s -w -X main.version=${VERSION}"

build_target() {
  local target_os="$1"
  local target_arch="$2"
  local output_name="$3"
  local output_path="$OUT_NATIVE/$output_name"
  local build_info

  echo "[opencode2api] building ${target_os}/${target_arch}..."
  GOOS="$target_os" GOARCH="$target_arch" "$GO_BIN" build -ldflags="$LDFLAGS" -o "$output_path" ./cmd/opencode2api

  # A Windows Go process launched from WSL can otherwise ignore GOOS/GOARCH
  # and silently produce four Windows binaries. Verify actual artifact metadata.
  build_info="$("$GO_BIN" version -m "$output_path")"
  if ! grep -Fq "GOOS=$target_os" <<< "$build_info" \
    || ! grep -Fq "GOARCH=$target_arch" <<< "$build_info" \
    || ! grep -Fq -- "-X main.version=$VERSION" <<< "$build_info"; then
    echo "[opencode2api] ERROR: $output_name metadata does not match ${target_os}/${target_arch} ${VERSION}" >&2
    printf '%s\n' "$build_info" >&2
    return 1
  fi
}

build_target windows amd64 opencode2api-win-x64.exe
build_target darwin arm64 opencode2api-mac-arm64
build_target darwin amd64 opencode2api-mac-x64
build_target linux amd64 opencode2api-linux-x64

# Refresh the desktop sidecar without regenerating the separately pinned DSH.
node "$ROOT/scripts/opencode2api-staging.mjs" --stage-built

echo "[opencode2api] done: 4 binaries in $OUT_DIR"
ls -la "$OUT_DIR"
