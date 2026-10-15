import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256File } from './sha256-file.mjs';

/** Describe a local unpublished candidate without touching installed state. */
export async function writeLocalCandidateBundle({ directory, version, runtimeVersion }) {
  const semver = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
  if (!semver.test(version) || !semver.test(runtimeVersion)) throw new Error('invalid candidate version');
  const names = [
    `FreeCode-DeepSeek-Harness-${version}-win-x64-setup.exe`,
    `FreeCode-DeepSeek-Harness-${version}-win-x64-portable.exe`,
    `deepseek-harness-runtime-${runtimeVersion}-win32-x64.tar.gz`,
  ];
  const artifacts = [];
  for (const name of names) artifacts.push({ name, size: statSync(join(directory, name)).size,
    sha256: await sha256File(join(directory, name)) });
  const manifest = { schemaVersion: 1, version, platform: 'win32-x64',
    runtime: { version: runtimeVersion, nodeModuleVersion: '149', assetName: names[2] }, artifacts };
  copyFileSync(new URL('local-candidate-preflight.ps1', import.meta.url), join(directory, 'Prepare-Local-Runtime.ps1'));
  writeFileSync(join(directory, 'local-candidate.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(join(directory, 'LOCAL-TEST-README.txt'), [
    `FreeCode ${version} — local unpublished candidate / candidata local sin publicar`,
    '',
    'CHECK ONLY / SOLO VERIFICAR (no cache writes, no install):',
    'powershell.exe -NoProfile -File .\Prepare-Local-Runtime.ps1',
    '',
    'Only after YOU close FreeCode / Solo despues de cerrar FreeCode:',
    'powershell.exe -NoProfile -File .\Prepare-Local-Runtime.ps1 -PrepareRuntime -FreeCodeIsClosed',
    '',
    'This verifies SHA-256, precaches the exact runtime, and preserves the previous cache as backups.',
    'Verifica SHA-256, precarga el runtime exacto y conserva la cache previa como backups.',
    'It does NOT start setup or FreeCode, inspect processes, or stop anything.',
    'NO ejecuta setup ni FreeCode, no inspecciona procesos ni detiene nada.',
    'After successful preparation, run setup yourself or ask the assistant to run it.',
    'Luego de la precarga correcta, ejecuta el setup o pide al asistente que lo ejecute.',
    '',
    'Do not run the standalone setup on a clean machine before the matching runtime asset is published.',
    'No ejecutes el setup solo en una maquina limpia hasta publicar su runtime correspondiente.',
  ].join('\r\n'), { flag: 'wx' });
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(import.meta.dirname, '..');
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const runtimeVersion = JSON.parse(readFileSync(join(root, 'apps/shell/harness-runtime.json'), 'utf8')).version;
  if (!process.argv[2]) throw new Error('usage: local-candidate-bundle.mjs <existing candidate directory>');
  console.log(await writeLocalCandidateBundle({ directory: resolve(process.argv[2]), version, runtimeVersion }));
}
