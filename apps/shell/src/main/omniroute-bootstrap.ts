import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { launchHidden } from './freecode-launcher.js';
import { resolveTarExecutable } from './harness-updater.js';
import { validateOmniRouteArchive } from './runtime-archive.js';

export const OMNIROUTE_VERSION = '3.8.51';
export const OMNIROUTE_ENTRY = 'node_modules/omniroute/dist/server.js';
interface Descriptor {
  schemaVersion: number; appVersion: string; version: string; platform: string;
  assetName: string; assetUrl: string; sha256: string; sizeBytes: number; entry: string;
}
export interface OmniRouteProgress { phase: 'download' | 'extract'; receivedBytes?: number; totalBytes?: number }
export interface EnsureOmniRouteOptions {
  descriptorPath: string; userDataDir: string; appVersion?: string;
  fetchImpl?: typeof fetch; onProgress?: (progress: OmniRouteProgress) => void;
  signal?: AbortSignal; responseTimeoutMs?: number; idleTimeoutMs?: number;
}
export interface OmniRouteRuntimeResult {
  status: 'ready'; source: 'existing' | 'downloaded'; version: string; runtimeDir: string;
}
const pending = new Map<string, { digest: string; promise: Promise<OmniRouteRuntimeResult> }>();

export type OmniRouteBootstrapState =
  | { status: 'preparing' }
  | { status: 'ready'; runtimeDir: string }
  | { status: 'unavailable'; error?: string };

/** Owns only an optional download/extraction; core startup never waits for it. */
export class OmniRouteBootstrap {
  private controller = new AbortController();
  private preparation?: Promise<OmniRouteRuntimeResult>;
  private current: OmniRouteBootstrapState = { status: 'unavailable' };
  constructor(private readonly options: EnsureOmniRouteOptions) {}
  get state(): OmniRouteBootstrapState { return { ...this.current }; }

  prepare(): Promise<OmniRouteRuntimeResult> {
    if (this.preparation) return this.preparation;
    this.current = { status: 'preparing' };
    const signal = this.options.signal
      ? AbortSignal.any([this.controller.signal, this.options.signal]) : this.controller.signal;
    this.preparation = ensureOmniRouteRuntime({ ...this.options, signal }).then(result => {
      this.current = { status: 'ready', runtimeDir: result.runtimeDir };
      return result;
    }, error => {
      this.current = { status: 'unavailable', error: error instanceof Error ? error.message : String(error) };
      this.preparation = undefined;
      throw error;
    });
    return this.preparation;
  }

  async stop(): Promise<void> {
    this.controller.abort(new Error('OmniRoute preparation stopped'));
    await this.preparation?.catch(() => undefined);
    this.current = { status: 'unavailable' };
  }
}

/** Optional background bootstrap, never awaited by core shell/DSH startup. */
export async function ensureOmniRouteRuntime(options: EnsureOmniRouteOptions): Promise<OmniRouteRuntimeResult> {
  options.signal?.throwIfAborted();
  const descriptor = readDescriptor(options);
  const target = join(resolve(options.userDataDir), 'omniroute-runtime');
  const result = (source: 'existing' | 'downloaded'): OmniRouteRuntimeResult => ({
    status: 'ready', source, version: OMNIROUTE_VERSION, runtimeDir: target,
  });
  try {
    validateRuntime(target);
    const receipt = readJson(join(target, '.freecode-verified.json'));
    if (receipt.sha256 === descriptor.sha256) return result('existing');
  } catch { /* An absent/incomplete cache is replaced only after a verified download. */ }
  const active = pending.get(target);
  if (active) {
    if (active.digest !== descriptor.sha256) throw new Error('Another OmniRoute runtime installation is in progress');
    return active.promise;
  }
  const promise = install(options, descriptor, target).then(() => result('downloaded'));
  pending.set(target, { digest: descriptor.sha256, promise });
  try { return await promise; } finally { if (pending.get(target)?.promise === promise) pending.delete(target); }
}

function readDescriptor(options: EnsureOmniRouteOptions): Descriptor {
  const value = readJson(options.descriptorPath) as unknown as Descriptor;
  const assetName = `omniroute-runtime-${OMNIROUTE_VERSION}.tar.gz`;
  const url = `https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v${value.appVersion}/${assetName}`;
  if (value.schemaVersion !== 1 || value.version !== OMNIROUTE_VERSION || value.platform !== 'any'
    || value.entry !== OMNIROUTE_ENTRY || value.assetName !== assetName
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.appVersion)
    || (options.appVersion !== undefined && value.appVersion !== options.appVersion)
    || value.assetUrl !== url) throw new Error('OmniRoute runtime descriptor version, entry, or pinned URL is invalid');
  if (!/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.sizeBytes)
    || value.sizeBytes <= 0 || value.sizeBytes > 2 * 1024 ** 3) throw new Error('OmniRoute runtime SHA-256 or size is invalid');
  return value;
}

function validateRuntime(root: string): void {
  const manifest = readJson(join(root, 'runtime-manifest.json'));
  const pkg = readJson(join(root, 'node_modules', 'omniroute', 'package.json'));
  if (manifest.schemaVersion !== 1 || manifest.version !== OMNIROUTE_VERSION || manifest.entry !== OMNIROUTE_ENTRY
    || !/^[a-f0-9]{64}$/.test(String(manifest.lockfileSha256)) || pkg.name !== 'omniroute' || pkg.version !== OMNIROUTE_VERSION) {
    throw new Error('OmniRoute runtime internal version or manifest is invalid');
  }
  const entry = join(root, ...OMNIROUTE_ENTRY.split('/'));
  for (const path of [root, join(root, 'node_modules'), join(root, 'node_modules', 'omniroute'),
    join(root, 'node_modules', 'omniroute', 'dist'), entry]) {
    if (lstatSync(path).isSymbolicLink()) throw new Error('OmniRoute runtime contains an entry symlink');
  }
  if (!lstatSync(entry).isFile()) throw new Error('OmniRoute runtime server entry is missing');
}

async function install(options: EnsureOmniRouteOptions, descriptor: Descriptor, target: string): Promise<void> {
  mkdirSync(resolve(options.userDataDir), { recursive: true });
  const scratch = mkdtempSync(join(resolve(options.userDataDir), '.omniroute-stage-'));
  const archive = join(scratch, descriptor.assetName);
  const extract = join(scratch, 'extract');
  const backup = join(scratch, 'previous');
  let preserveScratch = false;
  try {
    await download(options, descriptor, archive);
    await validateOmniRouteArchive(archive, undefined, options.signal);
    options.signal?.throwIfAborted();
    options.onProgress?.({ phase: 'extract' });
    mkdirSync(extract);
    await extractArchive(archive, extract, options.signal);
    options.signal?.throwIfAborted();
    validateRuntime(extract);
    writeFileSync(join(extract, '.freecode-verified.json'), JSON.stringify({ sha256: descriptor.sha256, version: descriptor.version }));
    if (existsSync(target)) {
      if (lstatSync(target).isSymbolicLink()) throw new Error('OmniRoute cache must not be a symlink');
      renameSync(target, backup);
    }
    try { renameSync(extract, target); } catch (error) {
      if (existsSync(backup)) {
        try { renameSync(backup, target); } catch (restoreError) {
          preserveScratch = true;
          throw new AggregateError([error, restoreError], `OmniRoute cache rollback requires recovery from ${backup}`);
        }
      }
      throw error;
    }
  } finally {
    if (!preserveScratch) { try { rmSync(scratch, { recursive: true, force: true }); } catch { /* locked scratch is recoverable */ } }
  }
}

async function download(options: EnsureOmniRouteOptions, descriptor: Descriptor, path: string): Promise<void> {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timeoutError: Error | undefined;
  const arm = (ms: number): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timeoutError = new Error(`OmniRoute download timed out after ${ms} ms without progress`);
      controller.abort(timeoutError);
    }, ms);
  };
  let receivedBytes = 0;
  const hash = createHash('sha256');
  try {
    arm(options.responseTimeoutMs ?? 30_000);
    const response = await (options.fetchImpl ?? fetch)(descriptor.assetUrl, { signal });
    if (response.status !== 200 || !response.body) throw new Error(`OmniRoute download returned HTTP ${response.status} or an empty body`);
    arm(options.idleTimeoutMs ?? 120_000);
    const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > descriptor.sizeBytes) return callback(new Error('OmniRoute download exceeds pinned size'));
      hash.update(chunk);
      arm(options.idleTimeoutMs ?? 120_000);
      options.onProgress?.({ phase: 'download', receivedBytes, totalBytes: descriptor.sizeBytes });
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), meter,
      createWriteStream(path, { flags: 'wx' }), { signal });
    if (receivedBytes !== descriptor.sizeBytes || hash.digest('hex') !== descriptor.sha256) {
      throw new Error('OmniRoute runtime SHA-256 or size mismatch');
    }
  } catch (error) { throw timeoutError ?? error; } finally { clearTimeout(timer); }
}

function extractArchive(archive: string, directory: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const { proc } = launchHidden({ executable: resolveTarExecutable(),
    args: ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', directory] });
  return new Promise((resolveDone, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; proc.kill(); }, 15 * 60_000);
    const abort = (): void => { proc.kill(); }; // exact test/app-owned child handle, never PID/name lookup
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = (): void => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    proc.once('error', error => { cleanup(); reject(error); });
    proc.once('close', code => {
      cleanup();
      if (signal?.aborted) reject(signal.reason);
      else if (timedOut || code !== 0) reject(new Error(`OmniRoute extraction failed (${timedOut ? 'timeout' : code})`));
      else resolveDone();
    });
  });
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}
