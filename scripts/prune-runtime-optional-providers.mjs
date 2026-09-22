#!/usr/bin/env node
/** Remove optional product bundles and development tooling from the shipped core runtime. */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const stage = resolve(process.argv[2] ?? '');
if (!stage || !existsSync(join(stage, 'package.json'))) {
  throw new Error(`runtime stage not found: ${stage}`);
}

// Development-only workspace roots: never required by apps/cli at runtime.
// (website/ was already excluded; docs/snapshots/scripts hold repo tooling.)
const topLevel = [
  'docs',
  'snapshots',
  'scripts',
  'patches',
  'website',
];
for (const relativePath of topLevel) {
  const target = join(stage, relativePath);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
// Build/test configs and build-info: the stage ships compiled lib/, never
// the TypeScript project graphs.
for (const entry of readdirSync(stage)) {
  if (/^tsconfig\..*\.tsbuildinfo$/.test(entry)
    || /^vitest\..*\.config\.ts$/.test(entry)
    || /^tsconfig\..*\.json$/.test(entry)) {
    rmSync(join(stage, entry), { recursive: true, force: true });
  }
}

const relativePaths = [
  'packages/subagent/subagent-codex',
  'packages/subagent/subagent-claude-code',
  'node_modules/@deepseek-ai/dsh-subagent-codex',
  'node_modules/@deepseek-ai/dsh-subagent-claude-code',
  'node_modules/@openai/codex',
  'node_modules/@openai/codex-win32-x64',
  'node_modules/@anthropic-ai/claude-agent-sdk',
  'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64',
  'website',
  'node_modules/vite',
  'node_modules/vitepress',
  'node_modules/@vitejs',
  'node_modules/@esbuild',
  'node_modules/esbuild',
  'node_modules/lefthook-windows-x64',
  'node_modules/jscpd-windows-x64-msvc',
  'node_modules/@oxlint-tsgolint',
  'node_modules/oxlint',
  'node_modules/typescript',
  // Docs-diagram and bundler backends (website/tsdown build inputs).
  'node_modules/mermaid',
  'node_modules/@mermaid-js',
  'node_modules/rolldown',
  'node_modules/@rolldown',
  'node_modules/tsdown',
  'node_modules/tsx',
  'node_modules/vite-tsconfig-paths',
  'node_modules/publint',
  // Test-only DOM/runners/assertion libraries.
  'node_modules/happy-dom',
  'node_modules/jsdom',
  'node_modules/@testing-library',
  'node_modules/vitest',
  'node_modules/@vitest',
  'node_modules/fast-check',
  'node_modules/istanbul-lib-report',
  'node_modules/@types',
];

for (const relativePath of relativePaths) {
  const target = join(stage, relativePath);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}

// node-pty ships prebuilds for every OS/arch; the Windows-only runtime loads
// exactly prebuilds/win32-x64. Drop the rest (~12 MB of dead weight).
const ptyPrebuilds = join(stage, 'node_modules', 'node-pty', 'prebuilds');
if (existsSync(ptyPrebuilds)) {
  for (const entry of readdirSync(ptyPrebuilds)) {
    if (entry !== 'win32-x64') rmSync(join(ptyPrebuilds, entry), { recursive: true, force: true });
  }
}

console.log(`prune-runtime-optional-providers: removed ${relativePaths.length} optional/provider-dev paths`);
