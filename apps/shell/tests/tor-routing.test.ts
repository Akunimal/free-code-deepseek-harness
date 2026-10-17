import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveTorProxyCandidates } from '../src/main/tor-routing.js'

const root = join(import.meta.dirname, '../../..')

describe('Tor direct-first recovery route', () => {
  it('seeds the live gateway provider catalog before the DSH child reads settings', () => {
    const source = readFileSync(join(root, 'apps/shell/src/main/index.ts'), 'utf8');
    const bootstrapStart = source.indexOf('runtime = await bootstrap(harnessRuntimeDir)');
    const gatewayUrl = source.indexOf('const opencodeUrl = runtime.kiloLane?.url', bootstrapStart);
    const seed = source.indexOf('  seedProviders({', bootstrapStart);
    const start = source.indexOf('  await runtime.start();', bootstrapStart);

    expect(bootstrapStart).toBeGreaterThanOrEqual(0);
    expect(gatewayUrl).toBeGreaterThan(bootstrapStart);
    expect(seed).toBeGreaterThan(gatewayUrl);
    expect(start).toBeGreaterThan(seed);
  });

  it('keeps the configured SOCKS candidate available even if startup is currently unavailable', () => {
    expect(resolveTorProxyCandidates('socks5://127.0.0.1:19850')).toEqual([
      'direct',
      'socks5://127.0.0.1:19850',
    ])
  })

  it('remains direct-only when there is no configured Tor route', () => {
    expect(resolveTorProxyCandidates(undefined)).toEqual(['direct'])
  })

})
