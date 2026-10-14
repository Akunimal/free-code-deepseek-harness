import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';

/** Validate the tar itself before handing it to a native extractor. No links,
 * special files, alternate streams, traversal, or unrelated roots are allowed. */
export async function validateOmniRouteArchive(
  archivePath: string, maxBytes = 8 * 1024 ** 3, signal?: AbortSignal,
): Promise<number> {
  const input = createReadStream(archivePath);
  const stream = input.pipe(createGunzip());
  input.on('error', error => stream.destroy(error));
  const reader = new TarReader(stream[Symbol.asyncIterator](), maxBytes);
  let pax: Record<string, string> = {};
  let zeroBlocks = 0;
  let entries = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const header = await reader.take(512, true);
      if (header === null) break;
      if (header.every(byte => byte === 0)) {
        if (++zeroBlocks > 2048) throw new Error('Tar end-padding limit exceeded');
        continue;
      }
      if (zeroBlocks) throw new Error('Tar contains data after its end marker');
      const checksum = octal(header.subarray(148, 156));
      let sum = 0;
      for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i]!;
      if (sum !== checksum) throw new Error('Tar header checksum mismatch');
      const type = String.fromCharCode(header[156]!);
      const isMetadata = type === 'x' || type === 'g';
      const size = isMetadata || pax.size === undefined ? octal(header.subarray(124, 136)) : Number(pax.size);
      if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) throw new Error('Tar size limit exceeded');
      if (type === 'x' || type === 'g') {
        if (size > 1024 ** 2) throw new Error('Tar PAX metadata limit exceeded');
        const metadata = parsePax((await reader.take(size))!);
        if (metadata.linkpath !== undefined) throw new Error('Tar links are forbidden');
        if (type === 'g' && (metadata.path !== undefined || metadata.size !== undefined)) {
          throw new Error('Global tar path/size overrides are forbidden');
        }
        if (type === 'x') pax = { ...pax, ...metadata };
      } else {
        if (!['0', '\0', '5'].includes(type)) throw new Error(`Tar link or unsupported entry type: ${type}`);
        const prefix = text(header.subarray(345, 500));
        const path = pax.path ?? [prefix, text(header.subarray(0, 100))].filter(Boolean).join('/');
        validatePath(path);
        if (type === '5' && size !== 0) throw new Error('Tar directory contains unexpected data');
        if (++entries > 200_000) throw new Error('Tar entry limit exceeded');
        await reader.skip(size);
        pax = {};
      }
      await reader.skip((512 - size % 512) % 512);
    }
    if (zeroBlocks < 2 || entries === 0 || Object.keys(pax).length) throw new Error('Tar archive is truncated or incomplete');
    return entries;
  } finally {
    input.destroy();
    stream.destroy();
  }
}

function validatePath(value: string): void {
  const path = value.replace(/\/$/, '').replace(/^\.\//, '');
  const parts = path.split('/');
  if (!path || value.startsWith('/') || /[\\:\x00-\x1f<>"|?*]/.test(value)
    || parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Unsafe tar install path: ${value}`);
  }
  if (parts[0] !== 'node_modules' && path !== 'runtime-manifest.json') {
    throw new Error(`Unexpected tar install root: ${value}`);
  }
}

function text(bytes: Buffer): string { return bytes.toString('utf8').split('\0', 1)[0]!; }
function octal(bytes: Buffer): number {
  const value = text(bytes).trim();
  if (value && !/^[0-7]+$/.test(value)) throw new Error('Invalid tar numeric header');
  return value ? Number.parseInt(value, 8) : 0;
}
function parsePax(bytes: Buffer): Record<string, string> {
  // System32 bsdtar adds this harmless timestamp on Windows. Do not permit
  // arbitrary LIBARCHIVE/GNU/SCHILY extensions (notably sparse-file maps).
  const allowed = new Set(['path', 'size', 'linkpath', 'mtime', 'atime', 'ctime', 'uid', 'gid', 'uname', 'gname', 'hdrcharset', 'LIBARCHIVE.creationtime']);
  const result: Record<string, string> = {};
  for (let offset = 0; offset < bytes.length;) {
    const space = bytes.indexOf(32, offset);
    const size = Number(bytes.subarray(offset, space).toString('ascii'));
    if (space < offset || !Number.isSafeInteger(size) || size <= space - offset + 1 || offset + size > bytes.length) {
      throw new Error('Invalid tar PAX record');
    }
    const record = bytes.subarray(space + 1, offset + size).toString('utf8');
    const equal = record.indexOf('=');
    if (equal < 1 || !record.endsWith('\n')) throw new Error('Invalid tar PAX record');
    const key = record.slice(0, equal);
    const value = record.slice(equal + 1, -1);
    if (!allowed.has(key) || (key === 'size' && !/^\d+$/.test(value))
      || (key === 'LIBARCHIVE.creationtime' && !/^-?\d{1,20}(?:\.\d{1,20})?$/.test(value))) {
      throw new Error(`Unsupported tar PAX metadata: ${key}`);
    }
    result[key] = value;
    offset += size;
  }
  return result;
}

class TarReader {
  private chunk: Buffer = Buffer.alloc(0);
  private offset = 0;
  private consumed = 0;
  constructor(private readonly iterator: AsyncIterator<unknown>, private readonly limit: number) {}
  async take(count: number, allowEof = false): Promise<Buffer | null> {
    const parts: Buffer[] = [];
    const got = await this.consume(count, bytes => parts.push(bytes));
    if (!got && count && allowEof) return null;
    if (got !== count) throw new Error('Tar archive is truncated');
    return Buffer.concat(parts, count);
  }
  async skip(count: number): Promise<void> {
    if (await this.consume(count) !== count) throw new Error('Tar archive is truncated');
  }
  private async consume(count: number, collect?: (bytes: Buffer) => void): Promise<number> {
    let got = 0;
    while (got < count) {
      if (this.offset === this.chunk.length) {
        const next = await this.iterator.next();
        if (next.done) break;
        this.chunk = Buffer.from(next.value as Uint8Array);
        this.offset = 0;
      }
      const size = Math.min(count - got, this.chunk.length - this.offset);
      if ((this.consumed += size) > this.limit) throw new Error('Tar expanded size limit exceeded');
      collect?.(this.chunk.subarray(this.offset, this.offset + size));
      this.offset += size;
      got += size;
    }
    return got;
  }
}
