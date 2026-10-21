import { createHash, randomBytes } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { launchHidden } from './freecode-launcher.js';

const UPSTREAM_COMMIT = 'e4411650da95edf3002c6789ccd1c816aedae1d4';
const UPSTREAM_VERSION = '0.13.0';
const UPSTREAM_TARBALL_SHA256 = '31175b80b613386550d247e89546ab312f66bf49950ebdddf3d4ee9e937e6aa6';
const BINARY_NAME = 'freellmpool-win-x64.exe';
const MODEL_FILE = 'phoenix-model-ids.json';
const RECEIPT_FILE = 'freecode-build-receipt.json';
const OS_ENV_KEYS = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC'] as const;
const ALLOWED_PROVIDERS = new Set(['pollinations', 'llm7', 'ovh', 'kilo']);
const DEFAULT_READY_TIMEOUT_MS = 60_000;
const DEFAULT_RESTART_DELAY_MS = 500;
const MAX_RESTART_DELAY_MS = 30_000;

export interface PhoenixGatewayConfig {
  /** Packaged resources root, normally `resources/freecode`. */
  resourcesDir: string;
  /** Writable FreeCode app data root. Phoenix uses a private subdirectory. */
  userDataDir: string;
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  readyTimeoutMs?: number;
  /** Internal test seam; production uses bounded exponential backoff. */
  restartBaseDelayMs?: number;
  log?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;
}

export interface PhoenixGatewayInstance {
  url: string;
  port: number;
  apiKey: string;
  modelIds: readonly string[];
  readonly pid: number;
  restart(): Promise<void>;
  stop(): Promise<void>;
}

interface PhoenixPayload {
  binaryPath: string;
  modelsPath: string;
  licensePath: string;
  modelIds: string[];
  binarySha256: string;
}

interface RunningChild {
  proc: ChildProcess;
  intentional: boolean;
  ready: boolean;
  restartScheduled: boolean;
  stderr: string;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertWindowsX64ConsoleExecutable(bytes: Buffer): void {
  if (bytes.length < 256 || bytes.toString('ascii', 0, 2) !== 'MZ') {
    throw new Error('Phoenix sidecar is not a valid PE executable');
  }
  const pe = bytes.readUInt32LE(0x3c);
  if (pe < 64 || pe + 94 > bytes.length || bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0'
    || bytes.readUInt16LE(pe + 4) !== 0x8664 || bytes.readUInt16LE(pe + 24) !== 0x20b
    || bytes.readUInt16LE(pe + 92) !== 3) {
    throw new Error('Phoenix sidecar must be a Windows x64 console executable');
  }
}

function readModelIds(path: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Phoenix packaged model allowlist is missing or invalid: ${path}`, { cause: error });
  }
  if (!Array.isArray(value) || value[0] !== 'auto' || new Set(value).size !== value.length
    || value.length < 2 || !value.every((id): id is string => typeof id === 'string')) {
    throw new Error('Phoenix model allowlist must start with Auto Phoenix and contain unique model IDs');
  }
  for (const id of value.slice(1)) {
    const [provider, ...model] = id.split('/');
    if (!provider || model.length === 0 || !ALLOWED_PROVIDERS.has(provider)) {
      throw new Error(`Phoenix model allowlist contains an unapproved provider route: ${id}`);
    }
  }
  return value;
}

function verifyPhoenixPayload(resourcesDir: string, platform: NodeJS.Platform, arch: NodeJS.Architecture): PhoenixPayload {
  if (platform !== 'win32' || arch !== 'x64') {
    throw new Error('The Phoenix FreeLLMpool sidecar is currently packaged for Windows x64 only');
  }
  const phoenixDir = join(resourcesDir, 'phoenix');
  const binaryPath = join(phoenixDir, BINARY_NAME);
  const modelsPath = join(phoenixDir, MODEL_FILE);
  const licensePath = join(phoenixDir, 'LICENSE');
  let receipt: Record<string, any>;
  try {
    receipt = JSON.parse(readFileSync(join(phoenixDir, RECEIPT_FILE), 'utf8')) as Record<string, any>;
  } catch (error) {
    throw new Error('Packaged Phoenix FreeLLMpool build receipt is missing or invalid', { cause: error });
  }
  const upstream = receipt.upstream;
  if (receipt.schemaVersion !== 1 || upstream?.repository !== 'https://github.com/0xzr/freellmpool'
    || upstream?.commit !== UPSTREAM_COMMIT || upstream?.version !== UPSTREAM_VERSION
    || upstream?.tarballSha256 !== UPSTREAM_TARBALL_SHA256) {
    throw new Error('Packaged Phoenix receipt does not match the pinned FreeLLMpool source');
  }
  const binary = readFileSync(binaryPath);
  const models = readFileSync(modelsPath);
  const license = readFileSync(licensePath);
  assertWindowsX64ConsoleExecutable(binary);
  if (receipt.binarySha256 !== sha256(binary)) throw new Error('Packaged Phoenix sidecar hash does not match its build receipt');
  if (receipt.modelsCatalogSha256 !== sha256(models)) throw new Error('Packaged Phoenix model allowlist hash does not match its build receipt');
  if (receipt.licenseSha256 !== sha256(license)) throw new Error('Packaged Phoenix FreeLLMpool license hash does not match its build receipt');
  return { binaryPath, modelsPath, licensePath, modelIds: readModelIds(modelsPath), binarySha256: receipt.binarySha256 };
}

function envValue(source: NodeJS.ProcessEnv, key: string): string | undefined {
  const actual = Object.keys(source).find((candidate) => candidate.toUpperCase() === key);
  return actual === undefined ? undefined : source[actual];
}

function phoenixChildEnvironment(source: NodeJS.ProcessEnv, apiKey: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of OS_ENV_KEYS) {
    const value = envValue(source, key);
    if (value !== undefined) env[key] = value;
  }
  env.FREECODE_PHOENIX_PROXY_KEY = apiKey;
  return env;
}

function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Phoenix could not allocate a loopback TCP port'));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function childAlive(proc: ChildProcess): boolean {
  return proc.exitCode === null && proc.signalCode === null;
}

function waitForClose(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (!childAlive(proc)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = (closed: boolean): void => {
      clearTimeout(timer);
      proc.removeListener('close', onClose);
      resolve(closed);
    };
    const onClose = (): void => finish(true);
    proc.once('close', onClose);
  });
}

async function terminate(record: RunningChild): Promise<void> {
  record.intentional = true;
  if (!childAlive(record.proc)) return;
  record.proc.kill('SIGTERM');
  if (await waitForClose(record.proc, 5_000)) return;
  // The ChildProcess belongs to this exact freecode-launcher invocation. Its
  // verified headless-host Job contains the Phoenix executable and its tree.
  record.proc.kill('SIGKILL');
  if (!await waitForClose(record.proc, 3_000)) {
    throw new Error('Phoenix headless child did not close after its owned Job was terminated');
  }
}

export async function startPhoenixGateway(config: PhoenixGatewayConfig): Promise<PhoenixGatewayInstance> {
  const platform = config.platform ?? process.platform;
  const arch = config.arch ?? process.arch;
  const payload = verifyPhoenixPayload(config.resourcesDir, platform, arch);
  const host = '127.0.0.1';
  const port = await freeLoopbackPort();
  const url = `http://${host}:${port}`;
  const stateDir = join(config.userDataDir, 'phoenix');
  mkdirSync(stateDir, { recursive: true });
  const apiKey = randomBytes(32).toString('hex');
  const env = phoenixChildEnvironment(process.env, apiKey);
  const readyTimeoutMs = config.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const restartBaseDelayMs = Math.max(1, config.restartBaseDelayMs ?? DEFAULT_RESTART_DELAY_MS);
  const log = config.log ?? (() => {});
  let active: RunningChild | undefined;
  let stopped = false;
  let restartAttempt = 0;
  let restartTimer: NodeJS.Timeout | undefined;

  const launchAndWait = async (): Promise<RunningChild> => {
    const launched = launchHidden({
      executable: payload.binaryPath,
      args: ['--host', host, '--port', String(port), '--state-dir', stateDir],
      cwd: stateDir,
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
      log,
    });
    const record: RunningChild = { proc: launched.proc, intentional: false, ready: false, restartScheduled: false, stderr: '' };
    active = record;
    record.proc.stderr?.on('data', (chunk: Buffer) => {
      record.stderr = `${record.stderr}${chunk.toString('utf8')}`.slice(-8_192);
      log('debug', 'Phoenix gateway output', { text: chunk.toString('utf8').slice(0, 2_048) });
    });
    const scheduleRestart = (reason: string): void => {
      if (stopped || record.intentional || !record.ready || record.restartScheduled || restartTimer) return;
      record.restartScheduled = true;
      const delayMs = Math.min(MAX_RESTART_DELAY_MS, restartBaseDelayMs * (2 ** Math.min(restartAttempt, 6)));
      restartAttempt++;
      log('warn', 'Phoenix gateway exited; restarting its contained child', { reason, delayMs });
      restartTimer = setTimeout(() => {
        restartTimer = undefined;
        if (stopped) return;
        void launchAndWait().then(() => {
          restartAttempt = 0;
          log('info', 'Phoenix gateway recovered', { url, pid: active?.proc.pid });
        }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          log('error', 'Phoenix gateway restart failed', { error: message });
          // launchAndWait marks its failed candidate intentional. Clear the
          // previous record's single-shot guard so another bounded attempt is
          // scheduled instead of leaving Phoenix permanently down after one
          // transient launch/readiness failure.
          record.restartScheduled = false;
          scheduleRestart(message);
        });
      }, delayMs);
      restartTimer.unref();
    };
    record.proc.once('exit', (code, signal) => scheduleRestart(`code=${String(code)} signal=${String(signal)}`));
    record.proc.once('error', (error) => scheduleRestart(error.message));

    const deadline = Date.now() + readyTimeoutMs;
    try {
      while (Date.now() < deadline) {
        if (!childAlive(record.proc)) throw new Error(`Phoenix exited before readiness (code=${record.proc.exitCode}, signal=${record.proc.signalCode})`);
        try {
          const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2_000) });
          if (response.status === 200) {
            record.ready = true;
            return record;
          }
        } catch {
          // The app probes only the assigned loopback health route while startup completes.
        }
        await wait(250);
      }
      throw new Error(`Phoenix did not become healthy within ${readyTimeoutMs} ms`);
    } catch (error) {
      record.intentional = true;
      await terminate(record).catch(() => {});
      if (active === record) active = undefined;
      throw new Error(`Phoenix FreeLLMpool failed to start: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  };

  try {
    const first = await launchAndWait();
    log('info', 'Phoenix FreeLLMpool gateway ready', {
      version: UPSTREAM_VERSION,
      url,
      pid: first.proc.pid,
      modelCount: payload.modelIds.length,
      binarySha256: payload.binarySha256,
    });
  } catch (error) {
    stopped = true;
    throw error;
  }

  return {
    url,
    port,
    apiKey,
    modelIds: payload.modelIds,
    get pid() { return active?.proc.pid ?? -1; },
    restart: async () => {
      if (stopped) return;
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = undefined; }
      if (active) await terminate(active);
      active = undefined;
      await launchAndWait();
      restartAttempt = 0;
    },
    stop: async () => {
      stopped = true;
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = undefined; }
      if (active) await terminate(active);
      active = undefined;
    },
  };
}
