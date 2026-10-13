import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Socket } from 'node:net';

const CONTROL_TIMEOUT_MS = 5_000;
const SERVER_TO_CONTROLLER = 'Tor safe cookie authentication server-to-controller hash';
const CONTROLLER_TO_SERVER = 'Tor safe cookie authentication controller-to-server hash';

interface TorControlReply {
  code: number;
  lines: string[];
}

interface ParsedReply {
  reply: TorControlReply;
  consumed: number;
}

interface ReplyWaiter {
  resolve: (reply: TorControlReply) => void;
  reject: (error: Error) => void;
}

function parseReply(buffer: string): ParsedReply | null {
  const lines: string[] = [];
  let code: number | null = null;
  let offset = 0;

  for (;;) {
    const end = buffer.indexOf('\r\n', offset);
    if (end < 0) return null;
    const line = buffer.slice(offset, end);
    const match = /^(\d{3})([-+ ])(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid Tor control reply line: ${line}`);
    const lineCode = Number(match[1]);
    if (code !== null && code !== lineCode) {
      throw new Error(`Tor control reply changed status code from ${code} to ${lineCode}`);
    }
    code = lineCode;
    lines.push(line);
    offset = end + 2;
    if (match[2] === '+') {
      // No authenticated command used here returns a data block. Fail closed
      // instead of accidentally treating its contents as another status line.
      throw new Error('Unexpected Tor control data block');
    }
    if (match[2] === ' ') return { reply: { code, lines }, consumed: offset };
  }
}

class TorControlConnection {
  private buffer = '';
  private readonly waiters: ReplyWaiter[] = [];
  private failure: Error | null = null;

  constructor(private readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      this.flush();
    });
    socket.on('error', (error: Error) => this.fail(error));
    socket.on('timeout', () => this.fail(new Error('Tor control connection timed out')));
  }

  connect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        this.socket.off('connect', onConnect);
        this.socket.off('error', onError);
      };
      this.socket.once('connect', onConnect);
      this.socket.once('error', onError);
      this.socket.connect(port, '127.0.0.1');
    });
  }

  async command(command: string): Promise<TorControlReply> {
    const replyPromise = this.readReply();
    this.socket.write(`${command}\r\n`, (error) => {
      if (error) this.fail(error);
    });
    const reply = await replyPromise;
    if (reply.code !== 250) {
      throw new Error(`Tor control command failed (${reply.code}): ${reply.lines.join(' | ')}`);
    }
    return reply;
  }

  close(): void {
    this.socket.destroy();
  }

  private readReply(): Promise<TorControlReply> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.flush();
    });
  }

  private flush(): void {
    while (this.waiters.length > 0) {
      let parsed: ParsedReply | null;
      try {
        parsed = parseReply(this.buffer);
      } catch (error) {
        this.fail(error as Error);
        return;
      }
      if (!parsed) return;
      this.buffer = this.buffer.slice(parsed.consumed);
      if (parsed.reply.code === 650) continue; // asynchronous Tor event
      this.waiters.shift()?.resolve(parsed.reply);
    }
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    while (this.waiters.length > 0) this.waiters.shift()?.reject(error);
    this.socket.destroy();
  }
}

function safeCookieHmac(secret: Buffer, label: string, clientNonce: Buffer, serverNonce: Buffer): Buffer {
  return createHmac('sha256', secret).update(label).update(clientNonce).update(serverNonce).digest();
}

async function authenticatedCommand(port: number, cookieFile: string, command: string): Promise<TorControlReply> {
  const cookie = readFileSync(cookieFile);
  if (cookie.length !== 32) throw new Error(`Tor control cookie must be 32 bytes; found ${cookie.length}`);

  const socket = new Socket();
  socket.setTimeout(CONTROL_TIMEOUT_MS);
  const control = new TorControlConnection(socket);
  try {
    await control.connect(port);
    const protocol = await control.command('PROTOCOLINFO 1');
    const authLine = protocol.lines.find((line) => /\bAUTH\s+METHODS=/i.test(line));
    const methodList = authLine?.match(/\bMETHODS=([^\s]+)/i)?.[1];
    const methods = methodList?.split(',') ?? [];
    if (!methods.includes('SAFECOOKIE')) throw new Error('Tor ControlPort does not offer SAFECOOKIE authentication');

    const clientNonce = randomBytes(32);
    const challenge = await control.command(`AUTHCHALLENGE SAFECOOKIE ${clientNonce.toString('hex')}`);
    const challengeLine = challenge.lines.find((line) => line.includes('AUTHCHALLENGE')) ?? '';
    const serverHashHex = challengeLine.match(/\bSERVERHASH=([0-9a-f]{64})\b/i)?.[1];
    const serverNonceHex = challengeLine.match(/\bSERVERNONCE=([0-9a-f]{64})\b/i)?.[1];
    if (!serverHashHex || !serverNonceHex) throw new Error('Tor SAFECOOKIE challenge is incomplete');

    const serverHash = Buffer.from(serverHashHex, 'hex');
    const serverNonce = Buffer.from(serverNonceHex, 'hex');
    const expectedServerHash = safeCookieHmac(cookie, SERVER_TO_CONTROLLER, clientNonce, serverNonce);
    if (serverHash.length !== expectedServerHash.length || !timingSafeEqual(serverHash, expectedServerHash)) {
      throw new Error('Tor SAFECOOKIE server proof is invalid');
    }

    const clientHash = safeCookieHmac(cookie, CONTROLLER_TO_SERVER, clientNonce, serverNonce);
    await control.command(`AUTHENTICATE ${clientHash.toString('hex')}`);
    return await control.command(command);
  } finally {
    control.close();
  }
}

export async function getTorBootstrapProgress(port: number, cookieFile: string): Promise<number | null> {
  const reply = await authenticatedCommand(port, cookieFile, 'GETINFO status/bootstrap-phase');
  const phase = reply.lines.find((line) => line.includes('status/bootstrap-phase='));
  const progress = phase?.match(/\bPROGRESS=(\d{1,3})\b/i)?.[1];
  return progress === undefined ? null : Number(progress);
}

export async function signalTorNewnym(port: number, cookieFile: string): Promise<boolean> {
  try {
    await authenticatedCommand(port, cookieFile, 'SIGNAL NEWNYM');
    return true;
  } catch {
    return false;
  }
}
