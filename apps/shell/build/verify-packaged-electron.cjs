const path = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports.default = async function verifyPackagedElectron(context) {
  // The current release target is Windows. Keep other platform builds on their
  // existing path until their executable layout is explicitly supported.
  if (context.electronPlatformName !== 'win32') return;

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
  console.log(`verify-packaged-electron-runtime: PASS — Electron ${result.electronVersion}, Node ${result.nodeVersion}`);
};
