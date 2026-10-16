import { spawn } from 'node:child_process';
import { openSync, readSync, closeSync, fstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';

/** GUI requests cross the desktop boundary explicitly; scripts never do. */
export function validateGuiLaunch(value: unknown): { command: string; args: string[]; electronCli?: true } {
  if (typeof value !== 'object' || value === null) throw new Error('GUI request must be an object');
  const { command, args, electronCli } = value as { command?: unknown; args?: unknown; electronCli?: unknown };
  if (typeof command !== 'string' || !isAbsolute(command) || command.includes('\0')
    || !Array.isArray(args) || args.length > 128
    || args.some(arg => typeof arg !== 'string' || arg.length > 32768 || arg.includes('\0'))) {
    throw new Error('GUI launch requires an absolute executable and bounded string argv');
  }
  const canonical = realpathSync.native(command);
  if (electronCli !== undefined && electronCli !== true) throw new Error('Invalid Electron CLI mode');
  if (electronCli === true && (basename(canonical).toLowerCase() !== 'githubdesktop.exe' || args.length !== 3
    || args[1] !== 'open' || args[0] !== join(dirname(canonical), 'resources', 'app', 'cli.js'))) {
    throw new Error('Electron CLI mode is limited to the installed GitHub Desktop open command');
  }
  const denied = new Set(['cmd.exe', 'pwsh.exe', 'powershell.exe', 'wscript.exe', 'cscript.exe', 'mshta.exe',
    'rundll32.exe', 'regsvr32.exe', 'conhost.exe', 'openconsole.exe', 'pythonw.exe']);
  if (denied.has(basename(canonical).toLowerCase())) throw new Error('Interpreters cannot use the explicit GUI exception');
  const fd = openSync(canonical, 'r');
  try {
    // Read only headers. An installed GUI executable can be hundreds of MB.
    const dos = Buffer.alloc(64);
    if (readSync(fd, dos, 0, dos.length, 0) !== dos.length || dos.toString('ascii', 0, 2) !== 'MZ') {
      throw new Error('GUI executable requires a Windows PE header');
    }
    const pe = dos.readUInt32LE(0x3c);
    const header = Buffer.alloc(94);
    if (pe < 64 || pe + header.length > fstatSync(fd).size || readSync(fd, header, 0, header.length, pe) !== header.length
      || header.toString('ascii', 0, 4) !== 'PE\0\0' || header.readUInt16LE(92) !== 2) {
      throw new Error('Interactive exception requires a Windows GUI-subsystem PE, not a console or script');
    }
  } finally {
    closeSync(fd);
  }
  return { command: canonical, args: args as string[], ...(electronCli === true ? { electronCli: true } : {}) };
}

export function guiLaunchEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = new Set(['path', 'systemroot', 'windir', 'userprofile', 'homedrive', 'homepath', 'temp', 'tmp',
    'appdata', 'localappdata', 'programfiles', 'programfiles(x86)', 'commonprogramfiles', 'programdata']);
  return Object.fromEntries(Object.entries(env).filter(([key, value]) => allowed.has(key.toLowerCase()) && value !== undefined));
}

/** Only this explicit GUI broker bypasses background containment. */
export async function launchInteractiveGui(value: unknown): Promise<void> {
  const { command, args, electronCli } = validateGuiLaunch(value);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      // This is an already validated GUI PE. windowsHide also sets SW_HIDE for
      // GUI apps, so using it here could make an intentional editor invisible.
      windowsHide: false, shell: false, detached: true, stdio: 'ignore',
      env: { ...guiLaunchEnvironment(process.env), ...(electronCli ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
    });
    let settled = false;
    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.unref();
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => settle(), 500);
    child.once('error', settle);
    child.once('exit', code => settle(code === 0 ? undefined : new Error(`GUI launcher exited ${code}`)));
  });
}
