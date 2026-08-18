import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const STAGE_MODULES = join(ROOT, 'apps/shell/resources/freecode/dsh/node_modules');

// sharp-win32-x64 bundles libvips DLLs inline; linux and darwin have separate
// sharp-libvips-* packages.
const NATIVE_TARGETS: Record<string, { dirs: string[]; magicBytes: number[] }> = {
  win32: {
    dirs: [
      '@img/sharp-win32-x64/lib',
      '@koromix/koffi-win32-x64/win32_x64',
    ],
    magicBytes: [0x4d, 0x5a], // PE
  },
  linux: {
    dirs: [
      '@img/sharp-linux-x64/lib',
      '@img/sharp-libvips-linux-x64/lib',
      '@koromix/koffi-linux-x64/linux_x64',
    ],
    magicBytes: [0x7f, 0x45, 0x4c, 0x46], // ELF
  },
  darwin: {
    dirs: [
      '@img/sharp-darwin-x64/lib',
      '@img/sharp-libvips-darwin-x64/lib',
      '@koromix/koffi-darwin-x64/darwin_x64',
    ],
    magicBytes: [0xcf, 0xfa, 0xed, 0xfe], // Mach-O 64-bit
  },
};

const MACHO_MAGICS = [
  [0xcf, 0xfa, 0xed, 0xfe], // Mach-O 64-bit LE
  [0xce, 0xfa, 0xed, 0xfe], // Mach-O 32-bit LE
  [0xca, 0xfe, 0xba, 0xbe], // FAT universal
];

function hasNativeBinary(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some(
    (f) => f.endsWith('.node') || f.endsWith('.dll') || f.endsWith('.dylib') || f.endsWith('.so'),
  );
}

function checkMagicBytes(filePath: string, expected: number[]): boolean {
  const buf = readFileSync(filePath);
  if (buf.length < expected.length) return false;
  return expected.every((b, i) => buf[i] === b);
}

function findNativeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.node') || f.endsWith('.dll') || f.endsWith('.dylib') || f.endsWith('.so'))
    .map((f) => join(dir, f));
}

function stageHasPlatform(platform: string): boolean {
  const firstDir = NATIVE_TARGETS[platform]?.dirs[0];
  if (!firstDir) return false;
  return existsSync(join(STAGE_MODULES, firstDir.split('/').slice(0, 2).join('/')));
}

describe('runtime stage native binaries', { skip: !stageHasPlatform(process.platform) }, () => {
  it('stage contains native binaries for the host platform at minimum', () => {
    const host = process.platform;
    const target = NATIVE_TARGETS[host];
    if (!target) return;
    for (const relDir of target.dirs) {
      const absDir = join(STAGE_MODULES, relDir);
      expect(existsSync(absDir), `directory missing: ${relDir}`).toBe(true);
      expect(hasNativeBinary(absDir), `no native binaries in ${relDir}`).toBe(true);
    }
  });

  for (const [platform, spec] of Object.entries(NATIVE_TARGETS)) {
    describe(platform, { skip: !stageHasPlatform(platform) }, () => {
      for (const relDir of spec.dirs) {
        const absDir = join(STAGE_MODULES, relDir);

        it(`${relDir} exists and contains native binaries`, () => {
          expect(existsSync(absDir), `directory missing: ${relDir}`).toBe(true);
          expect(hasNativeBinary(absDir), `no .node/.dll/.dylib/.so in ${relDir}`).toBe(true);
        });

        it(`${relDir} binaries have correct magic bytes`, () => {
          const files = findNativeFiles(absDir);
          expect(files.length, `no native files found in ${relDir}`).toBeGreaterThan(0);
          for (const f of files) {
            if (platform === 'darwin') {
              const buf = readFileSync(f);
              const matchesAny = MACHO_MAGICS.some((magic) =>
                magic.every((b, i) => buf[i] === b),
              );
              expect(matchesAny, `${f} does not match any Mach-O magic`).toBe(true);
            } else {
              expect(
                checkMagicBytes(f, spec.magicBytes),
                `${f} does not start with expected magic bytes`,
              ).toBe(true);
            }
          }
        });
      }
    });
  }
});
