import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const script = readFileSync(new URL('./build-opencode2api.sh', import.meta.url), 'utf8')

test('opencode2api build reads its linker version from the vendor snapshot', () => {
  assert.match(script, /VERSION="\$\(cat "\$SRC\/UPSTREAM_VERSION"\)"/)
  assert.match(script, /-X main\.version=\$\{VERSION\}/)
})

test('Windows Go launched from WSL receives native output paths', () => {
  assert.match(script, /command -v wslpath/)
  assert.match(script, /OUT_NATIVE="\$\(wslpath -w "\$OUT_DIR"\)"/)
})

test('Windows Go launched from WSL receives target environment for cross-compiles', () => {
  assert.match(script, /set_wslenv_entry GOOS/)
  assert.match(script, /set_wslenv_entry GOARCH/)
  assert.match(script, /set_wslenv_entry CGO_ENABLED/)
})

test('build rejects binaries whose embedded OS, architecture, or version is stale', () => {
  assert.match(script, /version -m/)
  assert.match(script, /GOOS=\$target_os/)
  assert.match(script, /GOARCH=\$target_arch/)
  assert.match(script, /main\.version=/)
})
