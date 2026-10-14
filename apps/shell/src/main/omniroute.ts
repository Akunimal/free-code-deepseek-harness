import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import type { ChildProcess } from 'node:child_process';
import { launchHidden } from './freecode-launcher.js';
import { OMNIROUTE_ENTRY } from './omniroute-bootstrap.js';

interface Options {
  nodePath: string; runtimeDir: string; userDataDir: string;
  launch?: typeof launchHidden; fetchImpl?: typeof fetch;
  choosePort?: () => Promise<number>; readyTimeoutMs?: number;
}

/** No provider scanning, inherited keys or user OmniRoute database. */
export class OmniRouteManager {
  private child?: ChildProcess;
  private starting?: Promise<string>;
  private stopping = false;
  private controller = new AbortController();
  private endpoint?: string;
  constructor(private readonly options: Options) {}
  get url(): string | undefined { return this.endpoint; }

  start(): Promise<string> {
    if (this.stopping) return Promise.reject(new Error('OmniRoute manager stopped'));
    if (this.endpoint) return Promise.resolve(this.endpoint);
    if (this.starting) return this.starting;
    this.starting = this.launch().finally(() => { this.starting = undefined; });
    return this.starting;
  }

  private async launch(): Promise<string> {
    const port = await (this.options.choosePort ?? choosePort)();
    this.controller.signal.throwIfAborted();
    const data = join(this.options.userDataDir, 'omniroute-data');
    const home = join(data, 'home');
    const temp = join(data, 'tmp');
    for (const dir of [data, home, temp]) mkdirSync(dir, { recursive: true, mode: 0o700 });
    const env: Record<string, string> = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR']) {
      if (process.env[key]) env[key] = process.env[key]!;
    }
    Object.assign(env, {
      ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port),
      DATA_DIR: data, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, TMP: temp, TEMP: temp,
      NEXT_TELEMETRY_DISABLED: '1', REQUIRE_API_KEY: 'false',
      OMNIROUTE_AUTO_FREE_FALLBACK_TO_FULL_POOL: 'false',
      // Optional ranking/statistics sync must not hold up an offline local
      // fallback catalog. Documented upstream opt-outs, no source patch.
      ARENA_ELO_SYNC_ENABLED: 'false', OPENROUTER_PROVIDER_STATS_ENABLED: 'false',
      PRICING_SYNC_ENABLED: 'false', MODELS_DEV_SYNC_ENABLED: '0',
    });
    const { proc } = (this.options.launch ?? launchHidden)({
      executable: this.options.nodePath, args: [join(this.options.runtimeDir, ...OMNIROUTE_ENTRY.split('/'))],
      cwd: this.options.runtimeDir, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = proc;
    let childError: Error | undefined;
    proc.on('error', error => { childError = error; });
    proc.once('close', () => {
      if (this.child === proc) { this.child = undefined; this.endpoint = undefined; }
    });
    // Drain bounded process pipes; never log provider responses or secrets.
    proc.stdout?.on('data', () => undefined);
    proc.stderr?.on('data', () => undefined);
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + (this.options.readyTimeoutMs ?? 120_000);
    try {
      while (Date.now() < deadline) {
        this.controller.signal.throwIfAborted();
        if (childError) throw childError;
        if (this.child !== proc || proc.exitCode !== null) throw new Error('OmniRoute exited before ready');
        try {
          const response = await (this.options.fetchImpl ?? fetch)(`${url}/v1/models`, {
            signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(2_000)]),
          });
          if (response.status === 200 && this.child === proc && !this.stopping) {
            this.endpoint = url;
            return url;
          }
          await response.body?.cancel();
        } catch { /* Startup can be slow; wait until the bounded deadline. */ }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('OmniRoute did not become ready before the startup deadline');
    } catch (error) {
      if (this.child === proc) { this.child = undefined; this.endpoint = undefined; proc.kill(); }
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.controller.abort(new Error('OmniRoute manager stopped'));
    const child = this.child;
    this.child = undefined;
    this.endpoint = undefined;
    child?.kill(); // exact app-owned ChildProcess, never process enumeration
    await this.starting?.catch(() => undefined);
  }
}

function choosePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('No OmniRoute loopback port')); return; }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}
