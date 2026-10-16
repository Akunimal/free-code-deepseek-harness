import { dialog, BrowserWindow, shell } from 'electron';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { extname, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { statSync } from 'node:fs';
import { launchInteractiveGui } from './interactive-gui.js';
import { t } from './i18n.js';

const TOKEN_HEADER = 'x-freecode-dialog-token';

export interface DialogBridge {
  endpoint: string;
  fileOpenEndpoint: string;
  token: string;
  close(): Promise<void>;
}

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 64 * 1024) {
      req.resume();
      throw new BridgeBodyTooLargeError('GUI bridge request exceeds 64 KiB');
    }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

class BridgeBodyTooLargeError extends Error {}

/**
 * Loopback HTTP bridge that exposes Electron's native dialog.showOpenDialog
 * to the Harness child process. On win32 the Harness's koffi-backed folder
 * picker crashes under ELECTRON_RUN_AS_NODE; this bridge lets the Harness
 * delegate to the Electron main process instead.
 */
export async function createDialogBridge(allowedRoot: string): Promise<DialogBridge> {
  console.log('[DEBUG-DIALOG-BRIDGE] 1/4 starting createDialogBridge');
  const token = randomBytes(32).toString('hex');
  const root = resolve(allowedRoot);

  console.log('[DEBUG-DIALOG-BRIDGE] 2/4 creating server');
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || !['/pick-directory', '/open-text-file', '/launch-gui', '/open-directory', '/open-path'].includes(req.url ?? '')) {
      reply(res, 404, { error: 'not found' });
      return;
    }
    if (req.headers[TOKEN_HEADER] !== token) {
      reply(res, 401, { error: 'unauthorized' });
      return;
    }
    void (async () => {
      try {
        const body = await readBody(req);
        if (req.url === '/launch-gui') {
          await launchInteractiveGui(JSON.parse(body));
          reply(res, 200, { opened: true });
          return;
        }
        if (req.url === '/open-path') {
          const parsed = JSON.parse(body) as { path?: unknown; intent?: unknown };
          if (typeof parsed.path !== 'string' || !isAbsolute(parsed.path) || parsed.path.includes('\0')
            || !['default', 'association', 'text-editor', 'reveal'].includes(String(parsed.intent))) {
            reply(res, 400, { error: 'absolute path and supported open intent are required' });
            return;
          }
          const target = resolve(parsed.path);
          const info = statSync(target);
          if (parsed.intent === 'reveal') {
            shell.showItemInFolder(target);
          } else if (parsed.intent === 'text-editor' && info.isFile()) {
            await launchInteractiveGui({ command: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'notepad.exe'), args: [target] });
          } else {
            const extension = extname(target).toLowerCase();
            if (info.isFile() && new Set(['.exe', '.com', '.scr', '.bat', '.cmd', '.ps1', '.vbs', '.vbe', '.js', '.jse',
              '.wsf', '.wsh', '.hta', '.lnk', '.url', '.msi']).has(extension)) {
              reply(res, 403, { error: 'executable/script associations must be opened as text, not executed' });
              return;
            }
            if (parsed.intent === 'default' && ['.html', '.htm', '.xhtml', '.svg'].includes(extension)) {
              await shell.openExternal(pathToFileURL(target).href);
            } else {
              const failure = await shell.openPath(target);
              if (failure) throw new Error(failure);
            }
          }
          reply(res, 200, { opened: true });
          return;
        }
        if (req.url === '/open-directory') {
          const parsed = JSON.parse(body) as { path?: unknown };
          if (typeof parsed.path !== 'string' || !isAbsolute(parsed.path) || parsed.path.includes('\0')) {
            reply(res, 400, { error: 'absolute directory path is required' });
            return;
          }
          const target = resolve(parsed.path);
          if (!statSync(target).isDirectory()) {
            reply(res, 400, { error: 'directory path is required' });
            return;
          }
          const failure = await shell.openPath(target);
          reply(res, failure ? 500 : 200, failure ? { error: failure } : { opened: true });
          return;
        }
        if (req.url === '/open-text-file') {
          const parsed = JSON.parse(body) as { path?: unknown };
          if (typeof parsed.path !== 'string' || !isAbsolute(parsed.path)) {
            reply(res, 400, { error: 'absolute file path is required' });
            return;
          }
          const target = resolve(parsed.path);
          if (target !== root && !target.startsWith(`${root}${sep}`)) {
            reply(res, 403, { error: 'file path is outside the FreeCode settings directory' });
            return;
          }
          const failure = await shell.openPath(target);
          if (failure) {
            reply(res, 500, { error: failure });
            return;
          }
          reply(res, 200, { opened: true });
          return;
        }
        const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined;
        const result = await dialog.showOpenDialog(
          ...(parent ? [parent] : []) as [BrowserWindow],
          {
            properties: ['openDirectory'],
            title: t('dialog.selectWorkspace'),
          },
        );
        reply(res, 200, { path: result.canceled ? null : (result.filePaths[0] ?? null) });
      } catch (error: unknown) {
        reply(res, error instanceof BridgeBodyTooLargeError ? 413 : 500, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('dialog bridge did not bind');
  const endpoint = `http://127.0.0.1:${address.port}/pick-directory`;

  return {
    endpoint,
    fileOpenEndpoint: endpoint.replace('/pick-directory', '/open-text-file'),
    token,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
