import { Writable } from 'node:stream';
import { closeSync, existsSync, mkdirSync, openSync, renameSync, statSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import pino, { type Logger } from 'pino';

export interface RotatingLoggerOptions {
  maxBytes?: number;
  maxFiles?: number;
}

class RotatingDestination extends Writable {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private fd: number;
  private bytes: number;

  constructor(dir: string, options: RotatingLoggerOptions = {}) {
    super();
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, 'app.log');
    this.maxBytes = Math.max(1_024, options.maxBytes ?? 5 * 1024 * 1024);
    this.maxFiles = Math.max(1, options.maxFiles ?? 3);
    this.fd = openSync(this.filePath, 'a');
    this.bytes = existsSync(this.filePath) ? statSync(this.filePath).size : 0;
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    try {
      if (this.bytes > 0 && this.bytes + chunk.byteLength > this.maxBytes) this.rotate();
      const written = writeSync(this.fd, chunk);
      this.bytes += written;
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  override _final(callback: (error?: Error | null) => void): void {
    try {
      closeSync(this.fd);
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private rotate(): void {
    closeSync(this.fd);
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const from = `${this.filePath}.${i}`;
      const to = `${this.filePath}.${i + 1}`;
      if (existsSync(from)) {
        try { renameSync(from, to); } catch { /* best effort rotation */ }
      }
    }
    if (existsSync(this.filePath)) {
      try { renameSync(this.filePath, `${this.filePath}.1`); } catch { /* best effort */ }
    }
    this.fd = openSync(this.filePath, 'a');
    this.bytes = 0;
  }
}

export interface AppLogger {
  logger: Logger;
  close(): Promise<void>;
}

/** JSONL app logging with bounded local retention. Secrets are never logged by
 * this layer; callers should pass identifiers and status, not credentials. */
export function createAppLogger(dir: string, options?: RotatingLoggerOptions): AppLogger {
  const destination = new RotatingDestination(dir, options);
  const logger = pino({
    level: 'info',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  }, destination);
  return {
    logger,
    close: () => new Promise<void>((resolve, reject) => {
      logger.flush(() => {
        destination.end((error?: Error | null) => error ? reject(error) : resolve());
      });
    }),
  };
}
