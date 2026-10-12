const OS_ALIASES = new Map([
  ['win', 'win32'], ['windows', 'win32'], ['win32', 'win32'],
  ['mac', 'darwin'], ['macos', 'darwin'], ['darwin', 'darwin'],
  ['linux', 'linux'], ['android', 'android'],
  ['freebsd', 'freebsd'], ['openbsd', 'openbsd'], ['netbsd', 'netbsd'],
  ['aix', 'aix'], ['sunos', 'sunos'],
]);

const ARCH_ALIASES = new Map([
  ['x64', 'x64'], ['x86_64', 'x64'], ['amd64', 'x64'],
  ['arm64', 'arm64'], ['aarch64', 'arm64'],
  ['ia32', 'ia32'], ['x86', 'ia32'],
  ['arm', 'arm'], ['armv7', 'arm'], ['armv7l', 'arm'],
  ['ppc64', 'ppc64'], ['s390x', 's390x'], ['riscv64', 'riscv64'],
  ['loong64', 'loong64'], ['universal', 'universal'],
]);

const TARGET_PATTERN = /(?:^|[\\/_.-])(win32|windows|win|darwin|macos|mac|linux|android|freebsd|openbsd|netbsd|aix|sunos)[-_](x64|x86_64|amd64|arm64|aarch64|ia32|x86|armv7l|armv7|arm|ppc64|s390x|riscv64|loong64|universal)(?:[-_](gnu|gnueabihf|musl|msvc))?(?=$|[\\/_.-])/i;

function normalizePlatform(platform) {
  return OS_ALIASES.get(String(platform).toLowerCase()) ?? String(platform).toLowerCase();
}

function normalizeArch(arch) {
  return ARCH_ALIASES.get(String(arch).toLowerCase()) ?? String(arch).toLowerCase();
}

function hostLibc() {
  if (process.platform !== 'linux') return undefined;
  return process.report?.getReport?.().header?.glibcVersionRuntime ? 'gnu' : 'musl';
}

function parseTarget(filePath) {
  const match = TARGET_PATTERN.exec(String(filePath).replaceAll('\\', '/'));
  if (!match) return undefined;
  return {
    platform: normalizePlatform(match[1]),
    arch: normalizeArch(match[2]),
    variant: match[3]?.toLowerCase() === 'gnueabihf' ? 'gnu' : match[3]?.toLowerCase(),
  };
}

/**
 * Decide whether a native prebuild is applicable to the packaged Electron
 * host. Untagged addons are treated as host-required (and therefore fail
 * closed if they do not load).
 */
export function classifyNativeAddon(filePath, options = {}) {
  const target = parseTarget(filePath);
  if (!target) return { kind: 'host' };

  const platform = normalizePlatform(options.platform ?? process.platform);
  const arch = normalizeArch(options.arch ?? process.arch);
  const linuxLibc = options.linuxLibc ?? hostLibc();
  const hostVariant = platform === 'win32' ? 'msvc' : platform === 'linux' ? linuxLibc : undefined;
  const targetName = `${target.platform}-${target.arch}${target.variant ? `-${target.variant}` : ''}`;

  if (target.platform !== platform) {
    return { kind: 'foreign', target: targetName, reason: `target platform ${target.platform} does not match ${platform}` };
  }
  if (target.arch !== 'universal' && target.arch !== arch) {
    return { kind: 'foreign', target: targetName, reason: `target architecture ${target.arch} does not match ${arch}` };
  }
  if (target.variant && hostVariant && target.variant !== hostVariant) {
    return { kind: 'foreign', target: targetName, reason: `target variant ${target.variant} does not match ${hostVariant}` };
  }
  return { kind: 'host', target: targetName };
}
