import { describe, expect, it, vi } from 'vitest';

describe('DSH Node engine compatibility policy', () => {
  it('fails closed on invalid Node versions or engine declarations', async () => {
    const modulePath = new URL('../../../scripts/verify-dsh-node-engine.mjs', import.meta.url).href;
    const policy = await import(modulePath) as {
      nodeVersionSatisfiesEngine: (version: string, range: string) => boolean;
    };

    expect(policy.nodeVersionSatisfiesEngine('v22.16.0', '^22.19.0 || >=24.0.0')).toBe(false);
    expect(policy.nodeVersionSatisfiesEngine('v22.19.0', '^22.19.0 || >=24.0.0')).toBe(true);
    expect(policy.nodeVersionSatisfiesEngine('v24.21.0', '^22.19.0 || >=24.0.0')).toBe(true);
    expect(policy.nodeVersionSatisfiesEngine('not-a-version', '>=24.0.0')).toBe(false);
    expect(policy.nodeVersionSatisfiesEngine('v24.21.0', 'invalid-range')).toBe(false);
  });

  it('allows slow first-run Electron initialization without showing a window', async () => {
    const modulePath = new URL('../../../scripts/verify-dsh-node-engine.mjs', import.meta.url).href;
    const policy = await import(modulePath) as {
      ELECTRON_NODE_PROBE_TIMEOUT_MS: number;
      probeElectronNode: (
        binary: string,
        run?: (
          binary: string,
          args: string[],
          options: { cwd: string; encoding: string; timeout: number; windowsHide: boolean; env: Record<string, string | undefined> },
        ) => { status: number | null; stdout: string; stderr: string },
      ) => { status: number | null; stdout: string; stderr: string };
    };
    const runProbe = vi.fn(() => ({ status: 0, stdout: 'v24.18.1\n', stderr: '' }));

    const result = policy.probeElectronNode(
      'electron.exe',
      runProbe as Parameters<typeof policy.probeElectronNode>[1],
    );

    expect(policy.ELECTRON_NODE_PROBE_TIMEOUT_MS).toBe(60_000);
    expect(result.stdout).toBe('v24.18.1\n');
    expect(runProbe).toHaveBeenCalledWith('electron.exe', ['-p', 'process.version'], expect.objectContaining({
      timeout: 60_000,
      windowsHide: true,
      env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
    }));
  });
});
