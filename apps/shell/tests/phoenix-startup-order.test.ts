import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../..');

describe('Phoenix startup and selector wiring', () => {
  it('starts the packaged gateway, seeds its exact catalog, then starts DSH', () => {
    const source = readFileSync(join(root, 'apps/shell/src/main/index.ts'), 'utf8');
    const bootstrap = source.indexOf('runtime = await bootstrap(harnessRuntimeDir)');
    const gatewayUrl = source.indexOf('const phoenixUrl = runtime.phoenix.url', bootstrap);
    const seed = source.indexOf('  seedProviders({', bootstrap);
    const start = source.indexOf('  await runtime.start();', bootstrap);

    expect(bootstrap).toBeGreaterThanOrEqual(0);
    expect(gatewayUrl).toBeGreaterThan(bootstrap);
    expect(seed).toBeGreaterThan(gatewayUrl);
    expect(start).toBeGreaterThan(seed);
    expect(source).toContain('modelIds: runtime.phoenix.modelIds');
    expect(source).toContain("provider: 'freecode-phoenix'");
    expect(source).not.toMatch(/opencode2api|engageProxyRotation/i);
  });

  it('fails closed on Phoenix startup before constructing the Harness supervisor', () => {
    const source = readFileSync(join(root, 'apps/shell/src/main/runtime.ts'), 'utf8');
    const startPhoenix = source.indexOf('await startPhoenixGateway(');
    const constructSupervisor = source.indexOf('new HarnessSupervisor(', startPhoenix);

    expect(startPhoenix).toBeGreaterThanOrEqual(0);
    expect(constructSupervisor).toBeGreaterThan(startPhoenix);
    expect(source).not.toMatch(/opencode2api|ProxyRotator/);
  });
});
