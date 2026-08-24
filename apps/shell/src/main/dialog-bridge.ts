import { dialog, BrowserWindow } from 'electron';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { t } from './i18n.js';

const TOKEN_HEADER = 'x-freecode-dialog-token';

export interface DialogBridge {
  endpoint: string;
  token: string;
  close(): Promise<void>;
}

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += String(chunk);
  return body;
}

/**
 * Loopback HTTP bridge that exposes Electron's native dialog.showOpenDialog
 * to the Harness child process. On win32 the Harness's koffi-backed folder
 * picker crashes under ELECTRON_RUN_AS_NODE; this bridge lets the Harness
 * delegate to the Electron main process instead.
 */
export async function createDialogBridge(): Promise<DialogBridge> {
  const token = randomBytes(32).toString('hex');

  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/pick-directory') {
      reply(res, 404, { error: 'not found' });
      return;
    }
    if (req.headers[TOKEN_HEADER] !== token) {
      reply(res, 401, { error: 'unauthorized' });
      return;
    }
    void (async () => {
      try {
        await readBody(req);
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
        reply(res, 500, { error: error instanceof Error ? error.message : String(error) });
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
    token,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
