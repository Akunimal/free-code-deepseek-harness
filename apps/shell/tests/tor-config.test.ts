import { describe, expect, it } from 'vitest';
import { buildTorrcContent, quoteTorrcPath } from '../src/main/tor-config.js';

describe('Tor configuration generation', () => {
  it('quotes Windows paths with spaces using Tor-compatible forward slashes', () => {
    expect(quoteTorrcPath('C:\\Users\\Inti User\\AppData\\Roaming\\FreeCode'))
      .toBe('"C:/Users/Inti User/AppData/Roaming/FreeCode"');
  });

  it('rejects line breaks that could inject additional torrc directives', () => {
    expect(() => quoteTorrcPath('C:\\Tor Data\\logs\nControlPort 0.0.0.0:9051'))
      .toThrow(/control characters/i);
  });

  it('uses authenticated control, quoted paths, adaptive circuit timing, and stable circuits', () => {
    const torrc = buildTorrcContent({
      socksPort: 9050,
      controlPort: 9051,
      dataDirectory: 'C:\\Users\\Inti User\\Tor Data',
      controlCookiePath: 'C:\\Users\\Inti User\\Tor Data\\control_auth_cookie',
      logPath: 'C:\\Users\\Inti User\\Tor Data\\tor.log',
      geoipFile: 'C:\\Program Files\\Tor\\geoip',
      geoip6File: 'C:\\Program Files\\Tor\\geoip6',
    });

    expect(torrc).toContain('DataDirectory "C:/Users/Inti User/Tor Data"');
    expect(torrc).toContain('GeoIPFile "C:/Program Files/Tor/geoip"');
    expect(torrc).toContain('GeoIPv6File "C:/Program Files/Tor/geoip6"');
    expect(torrc).toContain('Log notice file "C:/Users/Inti User/Tor Data/tor.log"');
    expect(torrc).toContain('CookieAuthentication 1');
    expect(torrc).toContain('CookieAuthFile "C:/Users/Inti User/Tor Data/control_auth_cookie"');
    expect(torrc).toContain('LearnCircuitBuildTimeout 1');
    expect(torrc).toContain('MaxCircuitDirtiness 600');
    expect(torrc).not.toContain('HashedControlPassword');
    expect(torrc).not.toMatch(/^CircuitBuildTimeout\s+5$/m);
  });
});
