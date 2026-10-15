import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { connect } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findFreePort } from '../src/main/tor-manager.js';
import { getTorBootstrapProgress } from '../src/main/tor-control.js';
import { buildTorrcContent } from '../src/main/tor-config.js';

const shellRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packagedTorDir = join(shellRoot, 'resources', 'freecode', 'tor');
const packagedTorExe = join(packagedTorDir, 'tor.exe');
const windowsTorAvailable = process.platform === 'win32' && existsSync(packagedTorExe);

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(750);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

async function verifyTorSocksEgress(port: number): Promise<void> {
  const host = 'check.torproject.org';
  const socket = connect(port, '127.0.0.1');
  socket.setTimeout(20_000);
  socket.once('timeout', () => socket.destroy(new Error('Tor SOCKS egress timed out')));
  const reader = socket[Symbol.asyncIterator]();
  let buffered = Buffer.alloc(0);
  const readExactly = async (length: number): Promise<Buffer> => {
    while (buffered.length < length) {
      const next = await reader.next();
      if (next.done) throw new Error('Tor SOCKS connection closed before completing its handshake');
      buffered = Buffer.concat([buffered, Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value)]);
    }
    const value = buffered.subarray(0, length);
    buffered = buffered.subarray(length);
    return value;
  };

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    socket.write(Buffer.from([5, 1, 0]));
    expect([...await readExactly(2)]).toEqual([5, 0]);

    const hostname = Buffer.from(host, 'ascii');
    socket.write(Buffer.concat([
      Buffer.from([5, 1, 0, 3, hostname.length]),
      hostname,
      Buffer.from([0x01, 0xbb]),
    ]));
    const reply = await readExactly(4);
    expect(reply[0]).toBe(5);
    expect(reply[1]).toBe(0);
    let addressLength: number;
    if (reply[3] === 1) addressLength = 4;
    else if (reply[3] === 4) addressLength = 16;
    else if (reply[3] === 3) addressLength = (await readExactly(1))[0]!;
    else throw new Error(`Tor SOCKS reply used an unsupported address type: ${reply[3]}`);
    await readExactly(addressLength + 2);

    const secure = connectTls({ socket, servername: host });
    secure.setTimeout(20_000);
    secure.once('timeout', () => secure.destroy(new Error('Tor SOCKS HTTPS request timed out')));
    await new Promise<void>((resolve, reject) => {
      secure.once('secureConnect', resolve);
      secure.once('error', reject);
    });
    secure.write(`GET /api/ip HTTP/1.1\r\nHost: ${host}\r\nAccept: application/json\r\nConnection: close\r\n\r\n`);

    const chunks: Buffer[] = [];
    for await (const chunk of secure) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const response = Buffer.concat(chunks);
    const boundary = response.indexOf('\r\n\r\n');
    if (boundary < 0) throw new Error('Tor SOCKS HTTPS response had no HTTP header boundary');
    const headers = response.subarray(0, boundary).toString('latin1');
    if (!/^HTTP\/1\.1 200\b/m.test(headers)) {
      throw new Error(`Tor SOCKS HTTPS request returned ${headers.split('\r\n', 1)[0] ?? 'no status'}`);
    }
    let body = response.subarray(boundary + 4);
    if (/^transfer-encoding:\s*chunked\s*$/im.test(headers)) {
      const decoded: Buffer[] = [];
      let offset = 0;
      while (offset < body.length) {
        const lineEnd = body.indexOf('\r\n', offset);
        if (lineEnd < 0) throw new Error('Tor SOCKS HTTPS response had an invalid chunk header');
        const size = Number.parseInt(body.subarray(offset, lineEnd).toString('ascii').split(';', 1)[0] ?? '', 16);
        if (!Number.isFinite(size)) throw new Error('Tor SOCKS HTTPS response had an invalid chunk size');
        offset = lineEnd + 2;
        if (size === 0) break;
        decoded.push(body.subarray(offset, offset + size));
        offset += size + 2;
      }
      body = Buffer.concat(decoded);
    }
    const result = JSON.parse(body.toString('utf8')) as { IsTor?: boolean; isTor?: boolean };
    if (result.IsTor !== true && result.isTor !== true) {
      throw new Error('check.torproject.org did not confirm that this request used Tor');
    }
  } finally {
    socket.destroy();
  }
}

describe('packaged Windows Tor startup', () => {
  const integrationIt = windowsTorAvailable ? it : it.skip;
  const disableNetwork = process.env.FREECODE_TOR_NETWORK_SMOKE !== '1';

  integrationIt(disableNetwork
    ? 'starts authenticated ControlPort from a spaced temp path with networking disabled'
    : 'bootstraps the packaged Tor daemon and opens SOCKS on the public Tor network', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'FreeCode Tor Startup '));
    let child: ReturnType<typeof spawn> | undefined;
    let output = '';

    try {
      const usedPorts = new Set<number>();
      const socksPort = await findFreePort(49_200, usedPorts);
      const controlPort = await findFreePort(49_200, usedPorts);
      const cookiePath = join(tempRoot, 'tor data', 'control_auth_cookie');
      const dataDirectory = dirname(cookiePath);
      const torrcPath = join(tempRoot, 'torrc');
      mkdirSync(dataDirectory, { recursive: true });
      const torrc = `${buildTorrcContent({
        socksPort,
        controlPort,
        dataDirectory,
        controlCookiePath: cookiePath,
        geoipFile: join(packagedTorDir, 'geoip'),
        geoip6File: join(packagedTorDir, 'geoip6'),
      })}${disableNetwork ? '\nDisableNetwork 1\n' : '\n'}`;
      writeFileSync(torrcPath, torrc, 'utf8');

      child = spawn(packagedTorExe, ['-f', torrcPath], {
        cwd: tempRoot,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout?.on('data', (chunk: Buffer) => { output = `${output}${chunk.toString('utf8')}`.slice(-8_192); });
      child.stderr?.on('data', (chunk: Buffer) => { output = `${output}${chunk.toString('utf8')}`.slice(-8_192); });

      const deadline = Date.now() + (disableNetwork ? 10_000 : 180_000);
      let controlReady = false;
      let bootstrapProgress: number | null = null;
      while (Date.now() < deadline) {
        if (child.exitCode !== null) {
          throw new Error(`packaged Tor exited with code ${child.exitCode}: ${output}`);
        }
        controlReady = await canConnect(controlPort);
        if (controlReady && existsSync(cookiePath)) {
          try {
            bootstrapProgress = await getTorBootstrapProgress(controlPort, cookiePath);
          } catch {
            // Tor may not yet have initialized SAFECOOKIE or bootstrap status.
          }
          if ((disableNetwork && bootstrapProgress !== null) || bootstrapProgress === 100) break;
        }
        await new Promise((resolve) => setTimeout(resolve, disableNetwork ? 100 : 1_000));
      }

      expect(controlReady, output).toBe(true);
      expect(existsSync(cookiePath), output).toBe(true);
      expect(output).toContain('Opened Control listener connection (ready)');
      expect(output).not.toMatch(/Path for (?:CookieAuthFile|DataDirectory|GeoIPFile|GeoIPv6File) .* is relative and will resolve to/);
      expect(output).not.toContain("Couldn't open file for");
      expect(bootstrapProgress).not.toBeNull();
      if (disableNetwork) {
        expect(output).toContain('DisableNetwork is set');
        expect(bootstrapProgress).toBeLessThan(100);
      } else {
        expect(bootstrapProgress).toBe(100);
        expect(await canConnect(socksPort)).toBe(true);
        await verifyTorSocksEgress(socksPort);
      }
      expect(child.exitCode).toBeNull();
    } finally {
      if (child && child.exitCode === null) {
        const exited = new Promise<void>((resolve) => child?.once('exit', () => resolve()));
        child.kill();
        await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
      }
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }, disableNetwork ? 15_000 : 190_000);
});
