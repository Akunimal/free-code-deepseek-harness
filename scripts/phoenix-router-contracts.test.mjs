import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

test('pinned FreeLLMpool keeps concrete model pins, Auto failover, stream commitment, and cancellation', () => {
  const python = process.env.PYTHON ?? 'python';
  const result = spawnSync(python, ['scripts/phoenix-router-contracts.py'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) throw result.error;
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  assert.equal(result.status, 0, output);
  assert.match(output, /Ran 4 tests/);
  assert.match(output, /OK/);
});
