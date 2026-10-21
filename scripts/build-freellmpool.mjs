import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stagePhoenixGateway } from './freellmpool-staging.mjs';
import { verifyPhoenixCatalog } from './phoenix-catalog.mjs';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args[0] ?? ''} failed with exit code ${String(result.status)}`);
  }
  return result;
}

function pythonJson(python, root, packageSource) {
  const probe = [
    'import importlib.metadata as md, json, platform',
    'import freellmpool',
    'names = ("httpx", "httpcore", "anyio", "certifi", "idna", "sniffio", "h11")',
    'print(json.dumps({',
    '    "pythonVersion": platform.python_version(),',
    '    "architecture": platform.machine(),',
    '    "pyinstallerVersion": md.version("pyinstaller"),',
    '    "freellmpoolVersion": freellmpool.__version__,',
    '    "runtime": {name: md.version(name) for name in names},',
    '}))',
  ].join('\n');
  const env = {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPATH: [packageSource, process.env.PYTHONPATH].filter(Boolean).join(sep),
  };
  const result = run(python, ['-c', probe], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(result.stdout.trim());
}

function compareBuildLock(actual, expected, upstreamVersion) {
  for (const key of ['pythonVersion', 'architecture', 'pyinstallerVersion']) {
    if (actual[key] !== expected[key]) {
      throw new Error(`FreeLLMpool build requires ${key}=${expected[key]}, found ${String(actual[key])}`);
    }
  }
  if (actual.freellmpoolVersion !== upstreamVersion) {
    throw new Error(`FreeLLMpool source version mismatch: expected ${upstreamVersion}, found ${String(actual.freellmpoolVersion)}`);
  }
  if (JSON.stringify(actual.runtime) !== JSON.stringify(expected.runtime)) {
    throw new Error('FreeLLMpool runtime dependency versions do not match the committed build lock');
  }
  const metadata = { ...actual };
  delete metadata.freellmpoolVersion;
  return metadata;
}

export function createPyInstallerArgs({ vendor, source, tempDir }) {
  const dist = join(tempDir, 'dist');
  const build = join(tempDir, 'work');
  const spec = join(tempDir, 'spec');
  return [
    '-m', 'PyInstaller', '--noconfirm', '--clean', '--onefile', '--console',
    '--name', 'freellmpool-win-x64',
    '--distpath', dist, '--workpath', build, '--specpath', spec,
    '--paths', join(vendor, 'src'),
    // Static analysis includes only imported modules. FreeLLMpool ships many
    // optional CLIs, report renderers and local runtimes; collect-all pulled
    // numpy/Pillow/psutil into this desktop proxy for no runtime benefit.
    '--collect-data', 'certifi',
    '--add-data', `${join(source, 'phoenix-providers.toml')};.`,
    join(source, 'phoenix-entry.py'),
  ];
}

export function buildFreeLLMpool(root = resolve(fileURLToPath(new URL('..', import.meta.url)))) {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('FreeCode Phoenix sidecar build is pinned to Windows x64');
  }
  verifyPhoenixCatalog(root);
  const vendor = join(root, 'vendor', 'freellmpool');
  const source = join(root, 'apps', 'shell', 'resources', 'phoenix');
  const upstream = JSON.parse(readFileSync(join(vendor, 'UPSTREAM.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'scripts', 'freellmpool-build-lock.json'), 'utf8'));
  const python = process.env.PYTHON || 'python';
  const runtimeInfo = pythonJson(python, root, join(vendor, 'src'));
  const metadata = compareBuildLock(runtimeInfo, lock, upstream.version);
  writeFileSync(join(source, 'freecode-build-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);

  const tempDir = mkdtempSync(join(tmpdir(), 'freecode-freellmpool-build-'));
  const resolvedTemp = resolve(tempDir);
  const resolvedTempRoot = resolve(tmpdir());
  if (!resolvedTemp.startsWith(`${resolvedTempRoot}${sep}`)
    || !resolvedTemp.slice(resolvedTempRoot.length + 1).startsWith('freecode-freellmpool-build-')) {
    throw new Error(`Refusing unexpected PyInstaller work directory: ${resolvedTemp}`);
  }
  try {
    const dist = join(tempDir, 'dist');
    const build = join(tempDir, 'work');
    const spec = join(tempDir, 'spec');
    mkdirSync(dist, { recursive: true });
    mkdirSync(build, { recursive: true });
    mkdirSync(spec, { recursive: true });
    const args = createPyInstallerArgs({ vendor, source, tempDir });
    run(python, args, {
      cwd: root,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: join(vendor, 'src') },
      stdio: 'inherit',
    });
    const builtBinary = join(dist, 'freellmpool-win-x64.exe');
    if (!existsSync(builtBinary)) throw new Error(`PyInstaller did not produce ${builtBinary}`);
    copyFileSync(builtBinary, join(source, 'freellmpool-win-x64.exe'));
    return stagePhoenixGateway(root);
  } finally {
    // This is the unique child directory created above and is checked to remain
    // strictly beneath the OS temp root before recursive cleanup.
    rmSync(resolvedTemp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildFreeLLMpool();
  console.log(`Phoenix FreeLLMpool ${result.version} built and staged (${result.binarySha256})`);
}
