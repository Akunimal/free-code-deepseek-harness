import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** No environment-variable opt-out: background Windows roots must be contained. */
export function createHeadlessHostPolicy(platform: NodeJS.Platform, defaultPath?: () => string) {
  let host: string | undefined;
  const configure = (executable: string): void => {
    host = undefined;
    if (!isAbsolute(executable)) throw new Error('headless-host requires an absolute helper path');
    const bytes = readFileSync(executable);
    const manifest = JSON.parse(readFileSync(join(dirname(executable), 'headless-host.json'), 'utf8')) as {
      schemaVersion?: number; source?: string; sha256?: string;
    };
    const pe = bytes.length >= 64 ? bytes.readUInt32LE(0x3c) : 0;
    if (pe < 64 || pe + 94 > bytes.length || bytes.toString('ascii', 0, 2) !== 'MZ'
      || bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0' || bytes.readUInt16LE(pe + 4) !== 0x8664
      || bytes.readUInt16LE(pe + 24) !== 0x20b || bytes.readUInt16LE(pe + 92) !== 2) {
      throw new Error('headless-host must be a Windows x64 GUI-subsystem executable');
    }
    if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.source ?? '')
      || manifest.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
      throw new Error('headless-host binary attestation does not match');
    }
    host = executable;
  };
  return {
    configure,
    invocation(executable: string, args: readonly string[]): { executable: string; args: string[] } {
      if (platform !== 'win32') return { executable, args: [...args] };
      if (!host && defaultPath) configure(defaultPath());
      if (!host) throw new Error('headless-host is not configured; refusing uncontained Windows launch');
      return { executable: host, args: ['--', executable, ...args] };
    },
  };
}

export const headlessHostPolicy = createHeadlessHostPolicy(process.platform, () => {
  if (process.resourcesPath) return join(process.resourcesPath, 'freecode', 'headless-host.exe');
  // Source tests and locally compiled shell modules; packaged startup configures
  // the exact production resources path before its first background operation.
  const source = fileURLToPath(new URL('../../resources/freecode/headless-host.exe', import.meta.url));
  return existsSync(source) ? source : fileURLToPath(new URL('../../../resources/freecode/headless-host.exe', import.meta.url));
});
