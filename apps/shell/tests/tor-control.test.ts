import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getTorBootstrapProgress, signalTorNewnym } from '../src/main/tor-control.js';

const SERVER_KEY = 'Tor safe cookie authentication server-to-controller hash';
const CLIENT_KEY = 'Tor safe cookie authentication controller-to-server hash';

function cookieHmac(key: Buffer, label: string, clientNonce: Buffer, serverNonce: Buffer): Buffer {
  return createHmac('sha256', key).update(label).update(clientNonce).update(serverNonce).digest();
}

async function startFakeControl(cookie: Buffer, progress = 100): Promise<{
  port: number;
  commands: string[];
  close: () => Promise<void>;
}> {
  const commands: string[] = [];
  const server = createServer((socket: Socket) => {
    let pending = '';
    let clientNonce = '';
    const serverNonce = Buffer.alloc(32, 7);
    let authenticated = false;
    socket.on('data', (chunk) => {
      pending += chunk.toString('utf8');
      for (;;) {
        const end = pending.indexOf('\r\n');
        if (end < 0) break;
        const command = pending.slice(0, end);
        pending = pending.slice(end + 2);
        commands.push(command);
        if (command === 'PROTOCOLINFO 1') {
          socket.write('250-PROTOCOLINFO 1\r\n250-AUTH METHODS=COOKIE,SAFECOOKIE COOKIEFILE="fake"\r\n250-VERSION Tor=0.4.8.0\r\n250 OK\r\n');
        } else if (command.startsWith('AUTHCHALLENGE SAFECOOKIE ')) {
          clientNonce = command.slice('AUTHCHALLENGE SAFECOOKIE '.length);
          const serverHash = cookieHmac(cookie, SERVER_KEY, Buffer.from(clientNonce, 'hex'), serverNonce);
          socket.write(`250 AUTHCHALLENGE SERVERHASH=${serverHash.toString('hex')} SERVERNONCE=${serverNonce.toString('hex')}\r\n`);
        } else if (command.startsWith('AUTHENTICATE ')) {
          const received = Buffer.from(command.slice('AUTHENTICATE '.length), 'hex');
          const expected = cookieHmac(cookie, CLIENT_KEY, Buffer.from(clientNonce, 'hex'), serverNonce);
          authenticated = received.length === expected.length && timingSafeEqual(received, expected);
          socket.write(authenticated ? '250 OK\r\n' : '515 Authentication failed\r\n');
        } else if (command === 'GETINFO status/bootstrap-phase') {
          socket.write(authenticated
            ? `250-status/bootstrap-phase=NOTICE BOOTSTRAP PROGRESS=${progress} TAG=done SUMMARY="Done"\r\n250 OK\r\n`
            : '515 Authentication required\r\n');
        } else if (command === 'SIGNAL NEWNYM') {
          socket.write(authenticated ? '250 OK\r\n' : '515 Authentication required\r\n');
        } else {
          socket.write('510 Unrecognized command\r\n');
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    port,
    commands,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

describe('Tor SAFECOOKIE control protocol', () => {
  let directory = '';

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = '';
  });

  it('authenticates before reading bootstrap status and rotating identity', async () => {
    directory = mkdtempSync(join(tmpdir(), 'tor-control-test-'));
    const cookie = randomBytes(32);
    const cookiePath = join(directory, 'control_auth_cookie');
    writeFileSync(cookiePath, cookie);
    const control = await startFakeControl(cookie, 100);
    try {
      await expect(getTorBootstrapProgress(control.port, cookiePath)).resolves.toBe(100);
      await expect(signalTorNewnym(control.port, cookiePath)).resolves.toBe(true);
      expect(control.commands.some((command) => command.startsWith('AUTHCHALLENGE SAFECOOKIE '))).toBe(true);
      expect(control.commands).toContain('GETINFO status/bootstrap-phase');
      expect(control.commands).toContain('SIGNAL NEWNYM');
      expect(control.commands).not.toContain('AUTHENTICATE ""');
    } finally {
      await control.close();
    }
  });

  it('rejects a control server that cannot prove possession of the cookie', async () => {
    directory = mkdtempSync(join(tmpdir(), 'tor-control-test-'));
    const serverCookie = randomBytes(32);
    const wrongCookiePath = join(directory, 'wrong_cookie');
    writeFileSync(wrongCookiePath, randomBytes(32));
    const control = await startFakeControl(serverCookie, 100);
    try {
      await expect(getTorBootstrapProgress(control.port, wrongCookiePath)).rejects.toThrow(/SAFECOOKIE server proof/i);
      expect(control.commands).not.toContain('GETINFO status/bootstrap-phase');
      expect(control.commands.some((command) => command.startsWith('AUTHENTICATE '))).toBe(false);
    } finally {
      await control.close();
    }
  });
});
