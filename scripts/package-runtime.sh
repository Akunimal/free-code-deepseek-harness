#!/usr/bin/env bash
set -Eeuo pipefail

# Packaging is intentionally deterministic and non-interactive. The upstream
# workspace may need to rebuild its pnpm modules when the bundled pnpm version
# differs from the checkout that produced node_modules.
export CI="${CI:-true}"

# Build a runnable DeepSeek Harness stage without touching the vendored source
# tree. A complete install is intentional: pnpm workspace links are required
# by the harness boot and are lost with --prod on the upstream monorepo.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
VENDOR="$ROOT/vendor/deepseek-harness"
GEMINI_WEB2API="$ROOT/vendor/gemini-web2api"
OUT="$ROOT/apps/shell/resources/freecode"
TMP_BASE="${TMPDIR:-/tmp}"
STAGE_ROOT="$(mktemp -d "$TMP_BASE/freecode-dsh-stage.XXXXXX")"
STAGE="$STAGE_ROOT/dsh"

# Git Bash can report "File too large" while recursively removing generated
# trees on Windows-mounted volumes, even when the individual files are tiny.
# Use Node's native filesystem implementation for those cleanup paths so the
# packaging gate is stable on Windows and remains portable on other hosts.
remove_tree() {
  node -e "const fs=require('node:fs'); for (const path of process.argv.slice(1)) fs.rmSync(path,{recursive:true,force:true,maxRetries:5,retryDelay:200})" "$@"
}

cleanup() { remove_tree "$STAGE_ROOT"; }
trap cleanup EXIT

if [[ ! -f "$VENDOR/pnpm-lock.yaml" ]]; then
  echo "package-runtime: vendor lockfile not found: $VENDOR" >&2
  exit 2
fi

if [[ ! -f "$GEMINI_WEB2API/gemini_web2api/__main__.py" ]]; then
  echo "package-runtime: vendored gemini-web2api source not found: $GEMINI_WEB2API" >&2
  exit 2
fi

echo "package-runtime: installing upstream build closure"
pnpm --dir "$VENDOR" install --frozen-lockfile --node-linker=hoisted
node "$ROOT/scripts/link-upstream-workspace-packages.mjs"

echo "package-runtime: building upstream libraries and web app"
# The vendored release currently has a host/client aggregate that includes
# upstream tests with a newer TypeScript/Vite type mismatch. The package build
# still emits the same production artifacts, so suppress type diagnostics only
# for this artifact-generation step; our harness gates remain typechecked.
pnpm --dir "$VENDOR" exec tsc -b tsconfig.host.json --noCheck
pnpm --dir "$VENDOR" exec tsdown --env.DSH_BUILD_FACE host
pnpm --dir "$VENDOR" exec tsc -b tsconfig.client.json --noCheck
pnpm --dir "$VENDOR" exec tsdown --env.DSH_BUILD_FACE client
pnpm --dir "$VENDOR" run build:web

echo "package-runtime: recording vendored source/build provenance"
node "$ROOT/scripts/verify-vendor-bundles-fresh.mjs" --write
node "$ROOT/scripts/verify-conversation-bundle.mjs" "$VENDOR"

mkdir -p "$STAGE"
echo "package-runtime: copying source and built artifacts"
tar -C "$VENDOR" \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.github \
  --exclude=website \
  --exclude=python \
  --exclude=examples \
  --exclude='*.md' \
  --exclude='*.zh.md' \
  --exclude='*.i18n.yaml' \
  -cf - . | tar -C "$STAGE" -xf -

# The upstream postinstall installs lefthook, which is development tooling and
# is not part of the runtime closure. Strip only the staged manifest.
node -e "const fs=require('node:fs'); const p=process.argv[1]; const j=JSON.parse(fs.readFileSync(p,'utf8')); delete j.scripts?.postinstall; fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n')" "$STAGE/package.json"

echo "package-runtime: installing complete workspace closure"
# Hoisted keeps external dependencies flat; materialize-runtime then replaces
# the remaining workspace links with ordinary package directories so the
# stage can move between build hosts and packaged Electron resources.
TARGET_OS="${DSH_TARGET_OS:-}"
TARGET_CPU="${DSH_TARGET_CPU:-}"
if [[ -n "$TARGET_OS" ]]; then
  node -e "const fs=require('node:fs'); const p=process.argv[1]; const os=process.argv[2]; const cpu=process.argv[3]; let s=fs.readFileSync(p,'utf8'); s += '\\nsupportedArchitectures:\\n  os:\\n    - '+os+'\\n'; if (cpu) s += '  cpu:\\n    - '+cpu+'\\n'; fs.writeFileSync(p,s)" "$STAGE/pnpm-workspace.yaml" "$TARGET_OS" "$TARGET_CPU"
else
  node -e "const fs=require('node:fs'); const p=process.argv[1]; let s=fs.readFileSync(p,'utf8'); s += '\\nsupportedArchitectures:\\n  os:\\n    - win32\\n    - darwin\\n    - linux\\n  cpu:\\n    - x64\\n    - arm64\\n'; fs.writeFileSync(p,s)" "$STAGE/pnpm-workspace.yaml"
fi
pnpm --dir "$STAGE" install --frozen-lockfile --node-linker=hoisted

if [[ ! -f "$STAGE/apps/cli/lib/bin.js" ]]; then
  echo "package-runtime: missing apps/cli/lib/bin.js after stage build" >&2
  exit 2
fi

if [[ ! -e "$STAGE/packages/boot/app-boot/node_modules/@deepseek-ai/cordis" ]]; then
  echo "package-runtime: missing workspace link @deepseek-ai/cordis; do not use --prod" >&2
  exit 2
fi

echo "package-runtime: materializing workspace packages for cross-platform Node resolution"
node "$ROOT/scripts/materialize-runtime.mjs" "$STAGE"

echo "package-runtime: removing optional Claude/Codex providers from core closure"
node "$ROOT/scripts/prune-runtime-optional-providers.mjs" "$STAGE"
node "$ROOT/scripts/verify-runtime-closure.mjs" "$STAGE"

# Verify that platform-specific native packages survived the install + materialize.
# Without these the harness CLI dies at boot ("Could not load sharp / koffi").
# Note: sharp-win32-x64 bundles libvips DLLs inline (no separate sharp-libvips-win32-x64),
# while linux and darwin have separate sharp-libvips-* packages.
echo "package-runtime: verifying native optional packages in stage"
NATIVE_OK=true
check_native() {
  local d="$1"
  if [[ -n "$TARGET_OS" ]]; then
    case "$d" in *"$TARGET_OS"*) ;; *) return ;; esac
  fi
  if [[ -n "$TARGET_CPU" ]]; then
    case "$d" in *"$TARGET_CPU"*) ;; *) return ;; esac
  fi
  if [[ ! -d "$STAGE/node_modules/$d" ]]; then
    echo "package-runtime: MISSING native dir: $d" >&2
    NATIVE_OK=false
  fi
}
check_native "@img/sharp-win32-x64/lib"
check_native "@koromix/koffi-win32-x64/win32_x64"
check_native "@img/sharp-linux-x64/lib"
check_native "@img/sharp-libvips-linux-x64/lib"
check_native "@koromix/koffi-linux-x64/linux_x64"
check_native "@img/sharp-darwin-x64/lib"
check_native "@img/sharp-libvips-darwin-x64/lib"
check_native "@koromix/koffi-darwin-x64/darwin_x64"
check_native "@img/sharp-darwin-arm64/lib"
check_native "@img/sharp-libvips-darwin-arm64/lib"
check_native "@koromix/koffi-darwin-arm64/darwin_arm64"
if [[ "$NATIVE_OK" != "true" ]]; then
  echo "package-runtime: native optional packages missing from stage; aborting" >&2
  exit 3
fi

mkdir -p "$OUT"
remove_tree "$OUT/dsh" "$OUT/opencode2api"
cp -a "$STAGE" "$OUT/dsh"
cp -a "$ROOT/apps/shell/resources/opencode2api" "$OUT/opencode2api"
# Remove any payload left by a pre-0.3.2 build; the desktop no longer ships
# the retired Perplexity bridge.
remove_tree "$OUT/perplexity-api"
remove_tree "$OUT/gemini-web2api"
cp -a "$GEMINI_WEB2API" "$OUT/gemini-web2api"

UPSTREAM_COMMIT=""
if [[ -f "$VENDOR/.upstream-commit" ]]; then
  UPSTREAM_COMMIT="$(tr -d '[:space:]' < "$VENDOR/.upstream-commit")"
fi
if [[ -z "$UPSTREAM_COMMIT" ]]; then
  UPSTREAM_COMMIT="$(git log --all --format='%b' --grep='git-subtree-dir: vendor/deepseek-harness' | sed -n 's/^git-subtree-split: //p' | head -n 1)"
fi
node -e "const fs=require('node:fs'); const p=process.argv[1]; const j={version:require(process.argv[2]).version, source:'deepseek-ai/deepseek-harness', upstreamCommit:process.argv[3]||null, cli:'dsh/apps/cli/lib/bin.js', install:'core-allowlist', optionalProviders:'external-only'}; fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n')" "$OUT/runtime-manifest.json" "$VENDOR/package.json" "$UPSTREAM_COMMIT"
node "$ROOT/scripts/verify-runtime-closure.mjs" "$OUT/dsh"

echo "package-runtime: ready at $OUT"
du -sh "$OUT"
