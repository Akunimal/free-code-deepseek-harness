import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testState = vi.hoisted(() => ({ supervisorConfigs: [] as any[] }));
const startPhoenixGateway = vi.hoisted(() => vi.fn());
vi.mock('../src/main/phoenix-gateway.js', () => ({ startPhoenixGateway }));
vi.mock('../src/main/harness-supervisor.js', () => ({
  HarnessSupervisor: class {
    start = vi.fn(async () => {});
    stop = vi.fn(async () => {});
    updateExtraEnv = vi.fn();
    onMcpStatus = vi.fn(() => () => {});
    onReady = vi.fn(() => () => {});
    onStuck = vi.fn(() => () => {});
    constructor(config: unknown) { testState.supervisorConfigs.push(config); }
  },
}));

import { createShellRuntime } from '../src/main/runtime.js';

const phoenix = {
  url: 'http://127.0.0.1:41234',
  port: 41234,
  apiKey: 'private-per-run-key',
  modelIds: ['auto', 'pollinations/openai-fast'],
  pid: 4321,
  restart: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
};

describe('Phoenix runtime composition', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'freecode-runtime-phoenix-'));
    testState.supervisorConfigs.length = 0;
    startPhoenixGateway.mockReset().mockResolvedValue(phoenix);
    phoenix.stop.mockClear();
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('starts Phoenix before DSH, passes its per-run key to the Harness, and stops only the owned service', async () => {
    const resourcesDir = join(root, 'resources');
    const userDataDir = join(root, 'profile');
    const runtime = await createShellRuntime({ resourcesDir, userDataDir, nodePath: process.execPath });

    expect(startPhoenixGateway).toHaveBeenCalledWith(expect.objectContaining({ resourcesDir, userDataDir }));
    expect(runtime.phoenix).toBe(phoenix);
    expect(testState.supervisorConfigs).toHaveLength(1);
    expect(testState.supervisorConfigs[0].extraEnv.FREECODE_PHOENIX_API_KEY).toBe(phoenix.apiKey);
    expect(testState.supervisorConfigs[0].extraEnv).not.toHaveProperty('OPENCODE2API_LB_URL');

    await runtime.start();
    await runtime.stop();
    expect(phoenix.stop).toHaveBeenCalledOnce();
  });

  it('fails closed without starting DSH when the packaged Phoenix gateway cannot start', async () => {
    startPhoenixGateway.mockRejectedValueOnce(new Error('payload missing'));
    await expect(createShellRuntime({
      resourcesDir: join(root, 'resources'),
      userDataDir: join(root, 'profile'),
      nodePath: process.execPath,
    })).rejects.toThrow(/payload missing/);
    expect(testState.supervisorConfigs).toHaveLength(0);
  });
});
