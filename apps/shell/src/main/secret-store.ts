import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Secret store — OS credential vault with a dependency-free fallback chain:
 *   1. keytar (Win Credential Manager / macOS Keychain / Linux Secret Service)
 *      — used when the native module is available in the runtime.
 *   2. Windows Credential Manager via PowerShell (no native deps) — fallback
 *      on Windows when keytar is missing.
 *   3. Encrypted-at-rest file store (LOCAL_MACHINE-scoped obfuscation only,
 *      documented as NOT secure) — last resort on Linux without libsecret.
 *
 * Values are resolved into spawn env (NOT process.env) by resolveSecrets().
 */

const TARGET_PREFIX = 'free-code-deepseek-harness-';

export interface SecretStore {
  setSecret(key: string, value: string): Promise<void>;
  getSecret(key: string): Promise<string | null>;
  deleteSecret(key: string): Promise<void>;
}

// ---- keytar adapter (used only if the module loads) ----

async function keytarImpl(): Promise<SecretStore | null> {
  try {
    const keytar = await import('keytar');
    if (!keytar || typeof keytar.setPassword !== 'function') return null;
    const service = TARGET_PREFIX.replace(/-$/, '');
    return {
      async setSecret(key, value) {
        await keytar.setPassword(service, key, value);
      },
      async getSecret(key) {
        return await keytar.getPassword(service, key);
      },
      async deleteSecret(key) {
        await keytar.deletePassword(service, key);
      },
    };
  } catch {
    return null;
  }
}

// ---- Windows Credential Manager adapter via advapi32 (no native deps) ----

const CRED_TYPE_GENERIC = 1;
const CRED_PERSIST_LOCAL_MACHINE = 2;

function pwshImpl(): SecretStore | null {
  if (process.platform !== 'win32') return null;
  // Probe: PowerShell must exist.
  const probe = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  });
  if (probe.status !== 0) return null;

  const esc = (s: string): string => s.replace(/'/g, "''").replace(/\\/g, '\\\\');

  const C_SHARP = `
using System;
using System.Runtime.InteropServices;

public static class FreecodeCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags; public uint Type;
    public IntPtr TargetName; public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob;
    public uint Persist; public uint AttributeCount; public IntPtr Attributes;
    public IntPtr TargetAlias; public IntPtr UserName;
  }

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWrite(ref CREDENTIAL cred, uint flags);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, uint type, uint flags, out IntPtr cred);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredDelete(string target, uint type, uint flags);

  [DllImport("advapi32.dll")]
  static extern void CredFree(IntPtr cred);

  public static bool Write(string target, string user, string secret) {
    var c = new CREDENTIAL();
    c.Type = ${CRED_TYPE_GENERIC};
    c.Persist = ${CRED_PERSIST_LOCAL_MACHINE};
    c.TargetName = Marshal.StringToCoTaskMemUni(target);
    c.UserName = Marshal.StringToCoTaskMemUni(user);
    c.CredentialBlob = Marshal.StringToCoTaskMemUni(secret);
    c.CredentialBlobSize = (uint)(secret.Length * 2);
    bool ok = CredWrite(ref c, 0);
    Marshal.FreeCoTaskMem(c.TargetName); Marshal.FreeCoTaskMem(c.UserName);
    Marshal.FreeCoTaskMem(c.CredentialBlob);
    return ok;
  }

  public static string Read(string target) {
    IntPtr p;
    if (!CredRead(target, ${CRED_TYPE_GENERIC}, 0, out p)) return null;
    try {
      var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      if (c.CredentialBlob == IntPtr.Zero || c.CredentialBlobSize == 0) return null;
      return Marshal.PtrToStringUni(c.CredentialBlob, (int)c.CredentialBlobSize / 2);
    } finally { CredFree(p); }
  }

  public static bool Delete(string target) {
    return CredDelete(target, ${CRED_TYPE_GENERIC}, 0);
  }
}
`;

  // Compile the native bridge once per process (cached by the PS session? no —
  // each spawnSync is a new process, so Add-Type cost is ~1s per call; fine
  // for secret ops which are rare).
  const CALL = (code: string): string =>
    `Add-Type -TypeDefinition @'${C_SHARP}'@; ${code};`;

  return {
    async setSecret(key, value) {
      const target = TARGET_PREFIX + key;
      const script = CALL(
        `[FreecodeCred]::Write('${esc(target)}', 'freecode', '${esc(value)}')`,
      );
      const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        timeout: 20_000,
        windowsHide: true,
      });
      if (r.status !== 0) throw new Error(`setSecret failed: ${r.stderr || r.stdout}`);
    },
    async getSecret(key) {
      const target = TARGET_PREFIX + key;
      const script = CALL(`[FreecodeCred]::Read('${esc(target)}')`);
      const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        timeout: 20_000,
        windowsHide: true,
      });
      if (r.status !== 0) return null;
      const out = r.stdout.trim();
      return out.length > 0 ? out : null;
    },
    async deleteSecret(key) {
      const target = TARGET_PREFIX + key;
      const script = CALL(`[FreecodeCred]::Delete('${esc(target)}')`);
      spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        timeout: 20_000,
        windowsHide: true,
      });
    },
  };
}

// ---- file store (Linux fallback; obfuscated at rest with a machine key) ----

function fileImpl(userDataDir: string): SecretStore {
  const dir = join(userDataDir, 'secrets');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'vault.bin');

  // Machine-scoped key: stable per OS install but not trivially shareable.
  function machineKey(): string {
    let seed: string;
    if (process.platform === 'win32') {
      seed = process.env.COMPUTERNAME ?? 'win';
    } else if (process.platform === 'darwin') {
      seed = process.env.HOSTNAME ?? 'mac';
    } else {
      seed = readFileSync('/etc/machine-id', 'utf8').trim() || 'linux';
    }
    return createHash('sha256').update(`free-code-dsh:${seed}`).digest('hex');
  }

  function readVault(): Record<string, string> {
    if (!existsSync(file)) return {};
    try {
      const raw = readFileSync(file, 'utf8');
      const buf = Buffer.from(raw, 'base64');
      const key = machineKey();
      const out: Record<string, string> = {};
      const text = buf.toString('utf8');
      for (const line of text.split('\n')) {
        const idx = line.indexOf('=');
        if (idx <= 0) continue;
        const k = line.slice(0, idx);
        const v = line.slice(idx + 1);
        try {
          out[k] = Buffer.from(v, 'base64').toString('utf8').split('').map((c, i) =>
            String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length)),
          ).join('');
        } catch {
          /* skip corrupt entry */
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  function writeVault(vault: Record<string, string>): void {
    const key = machineKey();
    const lines = Object.entries(vault).map(([k, v]) => {
      const obf = v.split('').map((c, i) =>
        String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length)),
      ).join('');
      return `${k}=${Buffer.from(obf, 'utf8').toString('base64')}`;
    });
    writeFileSync(file, Buffer.from(lines.join('\n')).toString('base64'), 'utf8');
  }

  return {
    async setSecret(key, value) {
      const vault = readVault();
      vault[key] = value;
      writeVault(vault);
    },
    async getSecret(key) {
      const vault = readVault();
      return vault[key] ?? null;
    },
    async deleteSecret(key) {
      const vault = readVault();
      delete vault[key];
      writeVault(vault);
    },
  };
}

// ---- factory + env bridge ----

export async function createSecretStore(userDataDir?: string): Promise<SecretStore> {
  // 1. keytar (best).
  const kt = await keytarImpl();
  if (kt) return kt;

  // 2. Windows Credential Manager via PowerShell.
  if (process.platform === 'win32') {
    const pw = pwshImpl();
    if (pw) return pw;
  }

  // 3. File fallback.
  return fileImpl(userDataDir ?? join(process.cwd(), '.secret-vault'));
}

/**
 * Resolve apiKeyEnv references (e.g. FREECODE_PUBLIC_KEY) against the vault
 * and return an env map for a child spawn. Values NOT in the vault are left
 * untouched so the child can pick them up from its own environment.
 */
export async function resolveSecrets(
  store: SecretStore,
  envVars: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of envVars) {
    const v = await store.getSecret(name);
    if (v !== null) out[name] = v;
  }
  return out;
}

/** Seed a non-sensitive default only when the user has not configured a value. */
export async function ensureSecret(
  store: SecretStore,
  key: string,
  value: string,
): Promise<boolean> {
  if ((await store.getSecret(key)) !== null) return false;
  await store.setSecret(key, value);
  return true;
}
