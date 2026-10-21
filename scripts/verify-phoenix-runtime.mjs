import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchHidden } from '../apps/shell/dist/src/main/freecode-launcher.js';
import { headlessHostPolicy } from '../apps/shell/dist/src/main/headless-host-policy.js';
import { verifyPhoenixGateway } from './freellmpool-staging.mjs';
import { createPhoenixArgs, createPhoenixEnvironment, validatePhoenixModels } from './phoenix-runtime-gate.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const resources = join(root, 'apps', 'shell', 'resources', 'freecode');
const phoenixDir = join(resources, 'phoenix');
const executable = join(phoenixDir, 'freellmpool-win-x64.exe');
const helper = join(resources, 'headless-host.exe');
const READY_TIMEOUT_MS = 60_000;

function listenPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a Phoenix smoke port'));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function waitForClose(closedPromise, timeoutMs) {
  return Promise.race([closedPromise.then(() => true), delay(timeoutMs).then(() => false)]);
}

async function waitUntilReady(url, proc, stderr) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      throw new Error(`Phoenix exited before readiness (code=${proc.exitCode}, signal=${proc.signalCode}): ${stderr()}`);
    }
    try {
      const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2_000) });
      if (response.status === 200) return;
    } catch {
      // Poll only the private loopback listener while the isolated process starts.
    }
    await delay(250);
  }
  throw new Error(`Phoenix did not become ready within ${READY_TIMEOUT_MS} ms: ${stderr()}`);
}

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Phoenix runtime package smoke requires Windows x64 and the verified headless-host');
  }
  const receipt = verifyPhoenixGateway(root);
  headlessHostPolicy.configure(helper);
  const binaryHash = createHash('sha256').update(readFileSync(executable)).digest('hex');
  if (binaryHash !== receipt.binarySha256) throw new Error('Phoenix package smoke binary differs from its verified build receipt');

  const tempRoot = resolve(tmpdir());
  const stateDir = mkdtempSync(join(tempRoot, 'freecode-phoenix-smoke-'));
  if (!resolve(stateDir).startsWith(`${tempRoot}${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`Refusing unexpected Phoenix smoke directory: ${stateDir}`);
  }
  const key = randomBytes(32).toString('hex');
  const port = await listenPort();
  const url = `http://127.0.0.1:${port}`;
  let proc;
  let closedPromise;
  let closed = false;
  let stderrTail = '';
  const appendStderr = (chunk) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-12_000);
  };
  try {
    proc = launchHidden({
      executable,
      args: createPhoenixArgs(port, stateDir),
      cwd: stateDir,
      env: createPhoenixEnvironment(process.env, key),
      stdio: ['ignore', 'ignore', 'pipe'],
    }).proc;
    closedPromise = new Promise((resolveClose) => proc.once('close', resolveClose));
    proc.stderr?.on('data', appendStderr);
    proc.on('error', (error) => { stderrTail = `${stderrTail}\n${error.message}`.slice(-12_000); });

    await waitUntilReady(url, proc, () => stderrTail);
    const response = await fetch(`${url}/v1/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status !== 200) throw new Error(`Phoenix model inventory returned HTTP ${response.status}: ${stderrTail}`);
    const expectedIds = JSON.parse(readFileSync(join(phoenixDir, 'phoenix-model-ids.json'), 'utf8'));
    const ids = validatePhoenixModels(await response.json(), expectedIds);
    console.log(`Phoenix clean-profile smoke passed: version=${receipt.version}, models=${ids.length}, binarySha256=${receipt.binarySha256}`);
  } finally {
    if (proc && proc.exitCode === null && proc.signalCode === null) {
      proc.kill('SIGTERM');
      closed = await waitForClose(closedPromise, 6_000);
      if (!closed) {
        // This is the exact helper ChildProcess launched above, owned only by
        // this test; Job closure cleans its contained child tree.
        proc.kill('SIGKILL');
        closed = await waitForClose(closedPromise, 3_000);
      }
    } else {
      closed = true;
    }
    if (!closed) {
      console.error(`Phoenix smoke helper failed to exit; preserving isolated profile at ${stateDir}`);
      throw new Error('Phoenix smoke could not close its own contained process; refusing to delete its profile');
    }
    rmSync(stateDir, { recursive: true, force: true });
  }
}

await main();
