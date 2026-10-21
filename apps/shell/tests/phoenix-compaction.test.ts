import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
// Built policy check: run build:vendor before the Host integration tests.
import { resolveCompactSpec, resolveConfig, resolveTargetPolicy } from '../../../vendor/deepseek-harness/packages/compaction/compaction-basic/lib/types/config.js';

it('ships a usable compaction budget for Auto before a possible 32K fallback', () => {
  const source = readFileSync(new URL('../../../vendor/deepseek-harness/packages/bundle/base/cordis.patch.yml', import.meta.url), 'utf8');
  const entries = parseDocument(source, { logLevel: 'silent' }).toJS()[0].insert;
  const config = resolveConfig(entries.find((entry: { id: string }) => entry.id === 'compaction-basic').config);
  const policy = resolveTargetPolicy(config, { provider: 'freecode-phoenix', model: 'auto' });
  const spec = resolveCompactSpec(policy, 32_768, 4096);
  expect(spec.thresholdTokens).toBeGreaterThan(spec.retainTokens);
  expect(spec.thresholdTokens + spec.maxTokens + 4096).toBeLessThanOrEqual(32_768);
  expect(spec.summarizationProvider).toBe('freecode-phoenix');
  expect(spec.summarizationModel).toBe('auto');
  expect(config.auto).toBe(true);
});
