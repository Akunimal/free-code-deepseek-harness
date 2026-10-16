import { defineConfig } from 'tsdown'
import { typertPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'
import { discoverTsdownWorkspacePackages } from './scripts/tsdown-workspace.mjs'

const clientWorkspace = discoverTsdownWorkspacePackages(import.meta.dirname, [
  'vendor/*',
  'packages/*/*',
  'apps/cli',
])
const hostWorkspace = discoverTsdownWorkspacePackages(import.meta.dirname, [
  'vendor/*',
  'packages/*/*',
  'apps/cli',
  'apps/desktop-host',
])

function isBuildFaceClient(value: unknown): boolean {
  if (value === undefined || value === 'host') return false
  if (value === 'client') return true
  throw new Error(`tsdown: --env.DSH_BUILD_FACE must be host or client, received ${String(value)}`)
}

/**
 * The ordinary workspace build consumes JavaScript emitted by the Host
 * TypeScript project and runs Typert. The Client pass selects packages that
 * declare a browser bundle and lets their package-local configs emit both
 * their Node loader entry and browser artifact. `apps/desktop` bundles after
 * this pass (root package.json `build:lib:host`): its main bundle inlines
 * workspace devDependencies from their lib/ output, and tsdown builds
 * workspace members concurrently without ordering them.
 */
export default defineConfig(({ env }) => {
  const client = isBuildFaceClient(env?.DSH_BUILD_FACE)
  return {
    // tsdown 0.22.2 treats every directory matched by `include` as a package,
    // even when it has no package.json. Resolve the existing workspace globs to
    // real packages first so generated folders (for example Graphify output)
    // cannot inherit this root entry config and abort the whole build.
    workspace: client ? clientWorkspace : hostWorkspace,
    entry: client ? '' : ['lib/types/{index,startup}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: client ? [] : [typertPlugin({ mode: 'workspace', faces: ['host'] })],
  }
})
