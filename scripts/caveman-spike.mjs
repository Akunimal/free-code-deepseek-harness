#!/usr/bin/env node
/**
 * Opt-in Caveman evaluation adapter.
 *
 * The default is an exact pass-through. No package is downloaded, no network
 * is opened, and no protocol/tool payload is rewritten unless a caller
 * explicitly supplies a local executable through CAVEMAN_COMMAND.
 */
import { spawnSync } from 'node:child_process';

const mode = process.argv[2] ?? 'baseline';
const input = await new Promise(resolve => {
  let value = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { value += chunk; });
  process.stdin.on('end', () => resolve(value));
});

if (!['baseline', 'rtk', 'caveman', 'rtk+caveman'].includes(mode)) {
  throw new Error(`unsupported evaluation mode: ${mode}`);
}

if (mode === 'baseline' || mode === 'rtk' || !process.env.CAVEMAN_COMMAND) {
  process.stdout.write(input);
  process.exit(0);
}

const command = process.env.CAVEMAN_COMMAND;
const result = spawnSync(command, [], {
  input,
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
  timeout: Number(process.env.CAVEMAN_TIMEOUT_MS ?? 30_000),
  env: { ...process.env, CAVEMAN_NO_TELEMETRY: '1' },
});
if (result.status !== 0 || result.error || typeof result.stdout !== 'string' || result.stdout.length >= input.length) {
  process.stdout.write(input);
  process.exit(0);
}
process.stdout.write(result.stdout);
