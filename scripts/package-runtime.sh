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
OUT="$ROOT/apps/shell/resources/freecode"
TMP_BASE="${TMPDIR:-/tmp}"
STAGE_ROOT="$(mktemp -d "$TMP_BASE/freecode-dsh-stage.XXXXXX")"
STAGE="$STAGE_ROOT/dsh"

# Git Bash can report "File too large" while recursively removing generated
# trees on Windows-mounted volumes, even when the individual files are tiny.
# Use Node's native filesystem implementation for those cleanup paths on
# Windows. In Linux/WSL, native rm is materially faster across /mnt/* and all
# callers pass exact generated directories (never a workspace root).
remove_tree() {
  if [[ "$(uname -s)" == Linux* ]]; then
    rm -rf -- "$@"
  else
    node -e "const fs=require('node:fs'); for (const path of process.argv.slice(1)) fs.rmSync(path,{recursive:true,force:true,maxRetries:5,retryDelay:200})" "$@"
  fi
}

# pnpm's isolated linker can leave generated node_modules directories inside
# individual upstream workspaces. They carry WSL junctions across a platform
# switch and collide with the hoisted installer (EPERM while renaming a link).
# Remove only directories named node_modules below the vendored checkout. This
# includes auxiliary upstream workspaces such as website/, which can otherwise
# retain WSL junctions even when the main apps/packages roots are clean. Source
# files are never targets; the vendor root is only a traversal boundary.
remove_workspace_dependency_trees() {
  node - "$VENDOR" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const vendor = process.argv[2]
if (fs.existsSync(vendor)) {
  const stack = [vendor]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name)
      if (entry.name === 'node_modules') {
        fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      } else if (entry.isDirectory() && !entry.isSymbolicLink() && entry.name !== '.git') {
        stack.push(target)
      }
    }
  }
}
NODE
}

cleanup() { remove_tree "$STAGE_ROOT"; }
trap cleanup EXIT

if [[ ! -f "$VENDOR/pnpm-lock.yaml" ]]; then
  echo "package-runtime: vendor lockfile not found: $VENDOR" >&2
  exit 2
fi

echo "package-runtime: installing upstream build closure"
# node_modules is generated state and its workspace links are not portable
# between Windows and WSL. A stale Vite link is especially dangerous because
# pnpm can report the lockfile as up to date while leaving a broken link from
# the other platform's virtual store. The marker makes the boundary explicit:
# changing OS/CPU always removes only the generated upstream dependency trees
# before reinstalling, even when the stale link happens to look resolvable.
INSTALL_PLATFORM="${DSH_TARGET_OS:-$(node -p 'process.platform')}:${DSH_TARGET_CPU:-$(node -p 'process.arch')}"
PLATFORM_MARKER="$VENDOR/node_modules/.freecode-install-platform"
VITE_ROOT_ENTRY="$VENDOR/node_modules/vite/bin/vite.js"
VITE_WORKSPACE_ENTRY="$VENDOR/apps/web/node_modules/vite/bin/vite.js"
if [[ ! -f "$PLATFORM_MARKER" ]] || ! grep -Fxq "$INSTALL_PLATFORM" "$PLATFORM_MARKER"; then
  echo "package-runtime: dependency platform changed or is unknown ($INSTALL_PLATFORM); recreating upstream node_modules"
  remove_tree "$VENDOR/node_modules"
  remove_workspace_dependency_trees
elif [[ -L "$VENDOR/apps/web/node_modules/vite" \
  && ! -e "$VITE_WORKSPACE_ENTRY" \
  && ! -e "$VITE_ROOT_ENTRY" ]]; then
  echo "package-runtime: stale cross-platform node_modules links; recreating upstream node_modules"
  remove_tree "$VENDOR/node_modules"
  remove_workspace_dependency_trees
fi
pnpm --dir "$VENDOR" install --frozen-lockfile --node-linker=hoisted --ignore-scripts || true
printf '%s\n' "$INSTALL_PLATFORM" > "$PLATFORM_MARKER"
if [[ ! -f "$VITE_ROOT_ENTRY" && ! -f "$VITE_WORKSPACE_ENTRY" ]]; then
  echo "package-runtime: Vite entry missing after install: $VITE_ROOT_ENTRY (or $VITE_WORKSPACE_ENTRY)" >&2
  exit 2
fi
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
TARGET_OS="${DSH_TARGET_OS:-win32}"
TARGET_CPU="${DSH_TARGET_CPU:-x64}"
if [[ "$TARGET_OS" != "win32" || "$TARGET_CPU" != "x64" ]]; then
  echo "package-runtime: unsupported target $TARGET_OS/$TARGET_CPU; 0.6.0 is Windows-only (win32/x64)" >&2
  exit 2
fi
node -e "const fs=require('node:fs'); const p=process.argv[1]; const os=process.argv[2]; const cpu=process.argv[3]; let s=fs.readFileSync(p,'utf8'); s += '\\nsupportedArchitectures:\\n  os:\\n    - '+os+'\\n  cpu:\\n    - '+cpu+'\\n'; fs.writeFileSync(p,s)" "$STAGE/pnpm-workspace.yaml" "$TARGET_OS" "$TARGET_CPU"
pnpm --dir "$STAGE" install --frozen-lockfile --node-linker=hoisted --ignore-scripts || true

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

# dsh is launched by Electron with ELECTRON_RUN_AS_NODE=1. Native addons
# installed by pnpm use the build host's Node ABI (Node 24 is ABI 137 here),
# while Electron 35.7.5 embeds Node ABI 133. Rebuild the completed, materialized
# runtime against the exact Electron version before it can enter resources/.
# This is intentionally fail-closed: a missing rebuild tool or a node-gyp
# failure must make packaging stop instead of producing a subtly unbootable app.
echo "package-runtime: rebuilding runtime native addons for Electron"
node "$ROOT/scripts/rebuild-runtime-native.mjs" "$STAGE"

# Verify that the Windows native packages survived the install + materialize.
# Without these the harness CLI dies at boot ("Could not load sharp / koffi").
# 0.6.0 deliberately does not install or publish Linux/macOS runtime payloads.
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
if [[ "$NATIVE_OK" != "true" ]]; then
  echo "package-runtime: native optional packages missing from stage; aborting" >&2
  exit 3
fi

mkdir -p "$OUT"
remove_tree "$OUT/dsh" "$OUT/opencode2api" "$OUT/gemini-web2api" "$OUT/perplexity-api"
# The stage has already been materialized and native-load verified. Copy only
# its runtime closure: the pnpm virtual store is not used by Node resolution
# after materialization and should not enter the installer payload.
node "$ROOT/scripts/copy-runtime-stage.mjs" "$STAGE" "$OUT/dsh"
mkdir -p "$OUT/opencode2api"
if [[ ! -f "$ROOT/apps/shell/resources/opencode2api/opencode2api-win-x64.exe" ]]; then
  echo "package-runtime: missing Windows opencode2api binary" >&2
  exit 3
fi
cp "$ROOT/apps/shell/resources/opencode2api/opencode2api-win-x64.exe" "$OUT/opencode2api/"
# The Windows release owns its OCR runtime. The helper copies only the native
# executable/DLLs and language data, and fails closed when a release build host
# does not provide the expected Tesseract installation.
if [[ "${DSH_TARGET_OS:-$(node -p 'process.platform')}" == "win32" ]]; then
  node "$ROOT/scripts/package-tesseract.mjs" "$OUT/tesseract" --required
else
  remove_tree "$OUT/tesseract"
fi
# Remove any payload left by an older build; the desktop no longer ships the
# retired Perplexity or Gemini bridges. The allowlisted copy above prevents
# stale generated resources from being reintroduced into the release.
remove_tree "$OUT/perplexity-api" "$OUT/gemini-web2api" "$OUT/dsh/gemini-web2api"

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
