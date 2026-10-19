import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '../../..')

describe('gateway bootstrap order', () => {
  it('seeds the live gateway provider catalog before the DSH child reads settings', () => {
    const source = readFileSync(join(root, 'apps/shell/src/main/index.ts'), 'utf8');
    const bootstrapStart = source.indexOf('runtime = await bootstrap(harnessRuntimeDir)');
    const gatewayUrl = source.indexOf('const opencodeUrl = runtime.opencode2api?.url', bootstrapStart);
    const seed = source.indexOf('  seedProviders({', bootstrapStart);
    const start = source.indexOf('  await runtime.start();', bootstrapStart);

    expect(bootstrapStart).toBeGreaterThanOrEqual(0);
    expect(gatewayUrl).toBeGreaterThan(bootstrapStart);
    expect(seed).toBeGreaterThan(gatewayUrl);
    expect(start).toBeGreaterThan(seed);
  });

})
