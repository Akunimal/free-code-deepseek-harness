export interface TorrcOptions {
  socksPort: number;
  controlPort: number;
  dataDirectory: string;
  controlCookiePath: string;
  geoipFile?: string;
  geoip6File?: string;
}

/** Quote an absolute path for torrc and normalize Windows separators. */
export function quoteTorrcPath(value: string): string {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Tor configuration paths cannot contain control characters');
  }
  return `"${value.replace(/\\/g, '/').replace(/"/g, '\\"')}"`;
}

export function buildTorrcContent(options: TorrcOptions): string {
  return [
    `SocksPort 127.0.0.1:${options.socksPort} IsolateSOCKSAuth`,
    `ControlPort 127.0.0.1:${options.controlPort}`,
    `DataDirectory ${quoteTorrcPath(options.dataDirectory)}`,
    ...(options.geoipFile ? [`GeoIPFile ${quoteTorrcPath(options.geoipFile)}`] : []),
    ...(options.geoip6File ? [`GeoIPv6File ${quoteTorrcPath(options.geoip6File)}`] : []),
    // Tor's special `Log ... file` grammar on Windows treats a quoted path
    // as part of the filename and aborts startup. TorManager captures these
    // notices from the child stdout pipe instead.
    'Log notice stdout',
    'CookieAuthentication 1',
    `CookieAuthFile ${quoteTorrcPath(options.controlCookiePath)}`,
    'ClientOnly 1',
    // Keep Tor's adaptive circuit-build timeout learning; the old fixed 5s
    // timeout rejected ordinary slow circuits and disabled learning.
    'LearnCircuitBuildTimeout 1',
    'NumEntryGuards 3',
    // Long model streams should keep their exit; rotation remains explicit.
    'MaxCircuitDirtiness 600',
    'ExitNodes {ch},{de},{nl},{se},{fr},{at},{is}',
    'StrictNodes 0',
    'ExcludeExitNodes {cn},{ru},{ir},{sy},{kp}',
  ].join('\n');
}
