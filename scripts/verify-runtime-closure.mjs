#!/usr/bin/env node
/**
 * Runtime closure gate. The core desktop artifact must not ship optional
 * Claude/Codex providers or development-only website/build tooling.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const stage = resolve(process.argv[2] ?? '');
if (!stage || !existsSync(join(stage, 'package.json'))) {
  throw new Error(`runtime stage not found: ${stage}`);
}

const forbidden = [
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
const present = forbidden.filter(relativePath => existsSync(join(stage, relativePath)));
if (present.length > 0) {
  throw new Error(`runtime closure contains forbidden optional providers:\n${present.join('\n')}`);
}

const manifestPath = join(stage, 'runtime-manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.install !== 'core-allowlist') {
    throw new Error(`runtime manifest is not core-allowlist: ${String(manifest.install)}`);
  }
}
console.log('verify-runtime-closure: core runtime closure is clean');
