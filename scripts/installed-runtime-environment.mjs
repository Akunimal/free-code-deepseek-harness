import { join, resolve } from 'node:path';

/**
 * Give the installed-runtime smoke a disposable Windows profile. Electron's
 * app.getPath('userData') follows APPDATA (and not Chromium's --user-data-dir
 * switch when the application calls app.setPath itself), so a switch alone is
 * not sufficient to keep this smoke out of the maintainer's real profile.
 */
export function createInstalledSmokeEnvironment(installDir, baseEnv = process.env) {
  const profileRoot = join(resolve(installDir), '.release-smoke-profile');
  const env = {
    ...baseEnv,
    APPDATA: join(profileRoot, 'Roaming'),
    LOCALAPPDATA: join(profileRoot, 'Local'),
    USERPROFILE: join(profileRoot, 'Home'),
    HOME: join(profileRoot, 'Home'),
    TEMP: join(profileRoot, 'Temp'),
    TMP: join(profileRoot, 'Temp'),
  };

  return {
    env,
    userDataDir: join(env.APPDATA, '@freecode', 'shell'),
  };
}

