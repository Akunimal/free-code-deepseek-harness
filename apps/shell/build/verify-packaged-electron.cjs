const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');

module.exports.default = async function verifyPackagedElectron(context) {
  // The current release target is Windows. Keep other platform builds on their
  // existing path until their executable layout is explicitly supported.
  if (context.electronPlatformName !== 'win32') return;

  const headlessVerifierPath = path.resolve(__dirname, '../../../scripts/verify-headless-desktop.mjs');
  const { verifyHeadlessDesktop } = await import(pathToFileURL(headlessVerifierPath).href);
  await verifyHeadlessDesktop(path.join(context.appOutDir, 'resources', 'freecode'));

  const verifierPath = path.resolve(__dirname, '../../../scripts/verify-packaged-electron-runtime.mjs');
  const { verifyPackagedElectronRuntime } = await import(pathToFileURL(verifierPath).href);
  const productFilename = context.packager.appInfo.productFilename;
  const result = verifyPackagedElectronRuntime({
    appOutDir: context.appOutDir,
    executableName: `${productFilename}.exe`,
  });
  if (!result.ok) {
    throw new Error(`Packaged Electron runtime verification failed: ${result.error}`);
  }
  console.log(`verify-packaged-electron-runtime: PASS — Electron ${result.electronVersion}, Node ${result.nodeVersion}, ABI ${result.nodeModuleVersion}`);

  const bootstrapVerifierPath = path.resolve(__dirname, '../../../scripts/verify-packaged-shell-bootstrap.mjs');
  const { verifyPackagedShellBootstrap } = await import(pathToFileURL(bootstrapVerifierPath).href);
  const bootstrapResult = verifyPackagedShellBootstrap({ appOutDir: context.appOutDir });
  if (!bootstrapResult.ok) {
    throw new Error(`Packaged shell bootstrap verification failed: ${bootstrapResult.error}`);
  }
  console.log(`verify-packaged-shell-bootstrap: PASS — ${bootstrapResult.entryPath} contains first-run runtime setup`);

  const torVerifierPath = path.resolve(__dirname, '../../../scripts/tor-runtime-assets.mjs');
  const { verifyTorRuntimeAssets } = await import(pathToFileURL(torVerifierPath).href);
  const dependencyManifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../resources/runtime-deps.json'), 'utf8'));
  const torDependency = dependencyManifest.dependencies.find((dependency) => dependency.id === 'tor' && dependency.required === true);
  if (!torDependency || typeof torDependency.sha256 !== 'string') {
    throw new Error('Packaged Tor runtime verification failed: required Tor asset is not SHA-256 pinned');
  }
  const torResult = verifyTorRuntimeAssets(path.join(context.appOutDir, 'resources', 'freecode'), torDependency.sha256);
  console.log(`verify-packaged-tor-runtime: PASS — ${torResult.sha256} and GeoIP databases present`);
};
