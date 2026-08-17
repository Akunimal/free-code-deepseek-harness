import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, Server } from 'node:http';
import { InterchangeChat } from '@freecode/shared-types';
import { ChatMlImporter } from '@freecode/chat-importer';
import { HarnessRpcClient, findChatsForFolder, continueChat } from '../src/index.js';

/** Fake harness host: answers session.create + session.prompt RPC. */
function fakeHarness(): Promise<{ server: Server; baseUrl: string; calls: { method: string; payload: unknown }[] }> {
  return new Promise((resolve) => {
    const calls: { method: string; payload: unknown }[] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const msg = JSON.parse(body) as { method: string; payload: unknown };
        calls.push({ method: msg.method, payload: msg.payload });
        const value =
          msg.method === 'session.create'
            ? { sessionId: 'ses_created_1' }
            : msg.method === 'session.prompt'
              ? { ok: true }
              : {};
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'server-response', rpcId: msg.method, result: { ok: true, value } }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr !== null && typeof addr !== 'string' ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, calls });
    });
  });
}

describe('workspace-bridge', () => {
  let dir: string;
  let harness: Awaited<ReturnType<typeof fakeHarness>>;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-bridge-'));
    harness = await fakeHarness();
    // Two chats: one matching the workspace, one not.
    writeFileSync(
      join(dir, 'matching.json'),
      JSON.stringify({
        title: 'match',
        workspaceRoot: 'C:/Noe/phoenix-command-console',
        updatedAt: 1777551377385,
        messages: [
          { role: 'user', content: 'primer mensaje' },
          { role: 'assistant', content: 'respuesta final del agente' },
        ],
      }),
    );
    writeFileSync(
      join(dir, 'other.json'),
      JSON.stringify({
        title: 'other',
        workspaceRoot: 'C:/Other/project',
        updatedAt: 1777000000000,
        messages: [{ role: 'user', content: 'nada que ver' }],
      }),
    );
  });

  afterAll(() => {
    harness.server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('findChatsForFolder filters by workspaceRoot and orders by recency', async () => {
    const importer = new ChatMlImporter();
    const chats = await findChatsForFolder(importer, 'C:\\Noe\\phoenix-command-console', dir, 5);
    expect(chats).toHaveLength(1);
    expect(chats[0]!.title).toBe('match');
    expect(chats[0]!.snippet).toContain('respuesta final');
  });

  it('continueChat creates a harness session and prompts with the handoff system message', async () => {
    const importer = new ChatMlImporter();
    const rpc = new HarnessRpcClient(harness.baseUrl);
    const result = await continueChat({
      folder: 'C:\\Noe\\phoenix-command-console',
      importer,
      sourcePath: dir,
      sourceChatId: join(dir, 'matching.json'),
      rpc,
      model: { provider: 'deepseek-free', id: 'deepseek-v3.2-free' },
    });
    expect(result.sessionId).toBe('ses_created_1');

    const methods = harness.calls.map((c) => c.method);
    expect(methods).toContain('session.create');
    expect(methods).toContain('session.prompt');

    const createCall = harness.calls.find((c) => c.method === 'session.create')!;
    expect((createCall.payload as { cwd: string }).cwd).toBe('C:\\Noe\\phoenix-command-console');

    const promptCall = harness.calls.find((c) => c.method === 'session.prompt')!;
    const payload = promptCall.payload as { sessionId: string; content: string; model: { provider: string; id: string } };
    expect(payload.sessionId).toBe('ses_created_1');
    expect(payload.content).toContain('Continuando una sesión previa');
    expect(payload.content).toContain('respuesta final del agente');
    expect(payload.model).toEqual({ provider: 'deepseek-free', id: 'deepseek-v3.2-free' });
  });
});