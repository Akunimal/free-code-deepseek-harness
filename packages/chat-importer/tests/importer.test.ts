import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { InterchangeChatSchema, InterchangeChat } from '@freecode/shared-types';
import { OpenCodeImporter, ChatMlImporter, JsonFileMarkerStore, importChats } from '../src/index.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (p: string) => { exec(sql: string): void; prepare(sql: string): { run(...p: unknown[]): unknown }; close(): void };
};

/** Builds a fixture opencode.db matching the real schema (session/message/part). */
function buildFixtureDb(dir: string): string {
  const dbPath = join(dir, 'opencode.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, slug TEXT,
      directory TEXT, title TEXT, version TEXT, share_url TEXT,
      summary_additions TEXT, summary_deletions TEXT, summary_files TEXT,
      summary_diffs TEXT, revert TEXT, permission TEXT,
      time_created INTEGER, time_updated INTEGER, time_compacting INTEGER,
      time_archived INTEGER, workspace_id TEXT, path TEXT
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER,
      time_updated INTEGER, data TEXT
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT,
      time_created INTEGER, time_updated INTEGER, data TEXT
    );
  `);
  db.prepare(
    `INSERT INTO session (id, project_id, directory, title, time_created, time_updated)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    'ses_fixture1',
    'proj1',
    'C:\\Noe\\phoenix-command-console',
    'Auditoría de MCP',
    1777550469031,
    1777551377385,
  );
  db.prepare(
    `INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)`,
  ).run(
    'msg1',
    'ses_fixture1',
    1777550469031,
    JSON.stringify({ role: 'user', model: { providerID: 'opencode', modelID: 'big-pickle' } }),
  );
  db.prepare(
    `INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    'part1',
    'msg1',
    'ses_fixture1',
    1777550469031,
    JSON.stringify({ type: 'text', text: 'audita la app de manera profunda' }),
  );
  db.prepare(
    `INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)`,
  ).run(
    'msg2',
    'ses_fixture1',
    1777550475000,
    JSON.stringify({ role: 'assistant', model: { providerID: 'opencode', modelID: 'big-pickle' } }),
  );
  db.prepare(
    `INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    'part2',
    'msg2',
    'ses_fixture1',
    1777550475000,
    JSON.stringify({ type: 'text', text: 'Voy a revisar el flujo completo.' }),
  );
  db.prepare(
    `INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    'part3',
    'msg2',
    'ses_fixture1',
    1777550475000,
    JSON.stringify({ type: 'reasoning', text: 'pensando...' }), // must be skipped
  );
  db.close();
  return dbPath;
}

describe('chat-importer', () => {
  let dir: string;
  let dbPath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-importer-'));
    dbPath = buildFixtureDb(dir);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('opencode adapter: detect + list + read → valid InterchangeChat', async () => {
    const importer = new OpenCodeImporter(dbPath);
    expect(await importer.detect(dir)).toBe(true);

    const chats = await importer.list();
    expect(chats).toHaveLength(1);
    expect(chats[0]!.id).toBe('ses_fixture1');
    expect(chats[0]!.title).toBe('Auditoría de MCP');
    expect(chats[0]!.messageCount).toBe(2);
    expect(chats[0]!.workspaceRoot).toBe('C:\\Noe\\phoenix-command-console');

    const chat = await importer.read('ses_fixture1');
    const parsed = InterchangeChatSchema.safeParse(chat);
    expect(parsed.success).toBe(true);
    expect(chat.sourceAgent).toBe('opencode');
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]!.content).toBe('audita la app de manera profunda');
    expect(chat.messages[1]!.content).toBe('Voy a revisar el flujo completo.');
    expect(chat.model).toEqual({ provider: 'opencode', id: 'big-pickle' });
  });

  it('chatml adapter: generic messages array → valid InterchangeChat', async () => {
    const file = join(dir, 'chatml.json');
    writeFileSync(
      file,
      JSON.stringify({
        title: 'mi chat',
        messages: [
          { role: 'user', content: 'hola' },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'chau' }],
          },
        ],
      }),
    );
    const importer = new ChatMlImporter();
    expect(await importer.detect(file)).toBe(true);
    const chat = await importer.read(file);
    const parsed = InterchangeChatSchema.safeParse(chat);
    expect(parsed.success).toBe(true);
    expect(chat.messages[1]!.content).toBe('chau');
  });

  it('importChats dedupes by sourceAgent+chatId via marker store', async () => {
    const markers = new JsonFileMarkerStore(join(dir, 'userdata'));
    const importer = new OpenCodeImporter(dbPath);
    const first = await importChats(importer, dir, ['ses_fixture1'], markers);
    expect(first.imported).toHaveLength(1);
    expect(first.skipped).toHaveLength(0);

    const second = await importChats(importer, dir, ['ses_fixture1'], markers);
    expect(second.imported).toHaveLength(0);
    expect(second.skipped).toHaveLength(1);
  });

  it('InterchangeChat fixture file validates against zod (contract test)', async () => {
    // The documented interchange format is the contract — write a sample
    // InterchangeChat to disk and validate it parses.
    const sample: InterchangeChat = {
      version: 1,
      sourceAgent: 'opencode',
      sourceChatId: 'ses_fixture1',
      title: 'Auditoría de MCP',
      createdAt: 1777550469031,
      updatedAt: 1777551377385,
      workspaceRoot: 'C:\\Noe\\phoenix-command-console',
      model: { provider: 'opencode', id: 'big-pickle' },
      messages: [{ role: 'user', content: 'hola' }],
    };
    const fixturePath = join(dir, 'interchange-sample.json');
    writeFileSync(fixturePath, JSON.stringify(sample, null, 2));
    const parsed = InterchangeChatSchema.safeParse(
      JSON.parse(readFileSync(fixturePath, 'utf8')),
    );
    expect(parsed.success).toBe(true);
  });
});