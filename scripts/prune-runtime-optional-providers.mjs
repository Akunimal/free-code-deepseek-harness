#!/usr/bin/env node
/** Remove optional product bundles and development tooling from the shipped core runtime. */
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const stage = resolve(process.argv[2] ?? '');
if (!stage || !existsSync(join(stage, 'package.json'))) {
  throw new Error(`runtime stage not found: ${stage}`);
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
];

for (const relativePath of relativePaths) {
  const target = join(stage, relativePath);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}

console.log(`prune-runtime-optional-providers: removed ${relativePaths.length} optional/provider-dev paths`);
