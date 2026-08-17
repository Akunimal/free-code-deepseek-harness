import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { InterchangeChat, ImportableChat } from '@freecode/shared-types';
import { ChatImporter } from './index.js';

const require = createRequire(import.meta.url);

/**
 * OpenCodeImporter — reads the OpenCode CLI storage SQLite DB
 * (~/.local/share/opencode/opencode.db on Windows/Linux,
 *  ~/Library/Application Support/opencode/opencode.db on macOS).
 *
 * Schema (investigated from a real install):
 *   session(id, project_id, slug, directory, title, time_created, time_updated, ...)
 *   message(id, session_id, time_created, data {role, model, ...})
 *   part(id, message_id, session_id, data {type: text|tool|reasoning|patch|step-*, ...})
 * Opens read-only; the CLI may hold the DB with WAL — read-only open is safe.
 */

interface SessionRow {
  id: string;
  title: string | null;
  directory: string | null;
  time_created: number;
  time_updated: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  time_created: number;
  data: string;
}

interface PartRow {
  message_id: string;
  data: string;
}

export function defaultOpenCodeDbPath(): string {
  if (process.platform === 'darwin') {
    return join(
      process.env.HOME ?? '',
      'Library/Application Support/opencode/opencode.db',
    );
  }
  return join(process.env.HOME ?? '', '.local/share/opencode/opencode.db');
}

interface DbLike {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown };
  close(): void;
}

function openDb(dbPath: string): DbLike | null {
  try {
    // Prefer better-sqlite3 if present (sync, simple), else node:sqlite.
    const mod = require('better-sqlite3') as unknown;
    if (typeof mod === 'function') {
      const db = (mod as (p: string, o?: object) => DbLike)(dbPath, { readonly: true });
      return db;
    }
  } catch {
    /* not installed */
  }
  try {
    // node:sqlite is available in Node 22.5+/24 (experimental flag on 22).
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (p: string, o?: object) => DbLike;
    };
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
}

export class OpenCodeImporter implements ChatImporter {
  readonly id = 'opencode';

  constructor(private readonly dbPath: string = defaultOpenCodeDbPath()) {}

  async detect(pathOrFolder: string): Promise<boolean> {
    // Accept either the db file itself or the storage folder.
    const candidate = pathOrFolder.endsWith('opencode.db')
      ? pathOrFolder
      : join(pathOrFolder, 'opencode.db');
    return existsSync(candidate);
  }

  async list(): Promise<ImportableChat[]> {
    const db = openDb(this.dbPath);
    if (!db) return [];
    try {
      const rows = db
        .prepare(
          `SELECT s.id, s.title, s.directory, s.time_created, s.time_updated,
                  (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) AS message_count
           FROM session s
           WHERE s.time_archived IS NULL
           ORDER BY s.time_updated DESC`,
        )
        .all() as (SessionRow & { message_count: number })[];
      return rows.map((r) => ({
        id: r.id,
        title: r.title ?? '(sin título)',
        updatedAt: r.time_updated,
        messageCount: r.message_count,
        agent: 'opencode',
        workspaceRoot: r.directory ?? undefined,
      }));
    } finally {
      db.close();
    }
  }

  async read(chatId: string): Promise<InterchangeChat> {
    const db = openDb(this.dbPath);
    if (!db) throw new Error(`cannot open opencode db at ${this.dbPath}`);
    try {
      const session = db
        .prepare(
          `SELECT id, title, directory, time_created, time_updated FROM session WHERE id = ?`,
        )
        .get(chatId) as SessionRow | undefined;
      if (!session) throw new Error(`session not found: ${chatId}`);

      const messages = db
        .prepare(`SELECT id, session_id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC`)
        .all(chatId) as MessageRow[];

      const parts = db
        .prepare(`SELECT message_id, data FROM part WHERE session_id = ? ORDER BY time_created ASC`)
        .all(chatId) as PartRow[];

      const partsByMessage = new Map<string, unknown[]>();
      for (const p of parts) {
        try {
          const parsed = JSON.parse(p.data) as { type?: string };
          const list = partsByMessage.get(p.message_id) ?? [];
          list.push(parsed);
          partsByMessage.set(p.message_id, list);
        } catch {
          /* skip malformed part */
        }
      }

      let model: { provider: string; id: string } | undefined;
      const interchange: InterchangeChat = {
        version: 1,
        sourceAgent: 'opencode',
        sourceChatId: chatId,
        title: session.title ?? '(sin título)',
        createdAt: session.time_created,
        updatedAt: session.time_updated,
        workspaceRoot: session.directory ?? undefined,
        messages: [],
      };

      for (const m of messages) {
        let data: {
          role?: string;
          model?: { providerID?: string; modelID?: string };
        } = {};
        try {
          data = JSON.parse(m.data) as typeof data;
        } catch {
          /* skip malformed */
        }
        const role = (data.role ?? 'user') as 'user' | 'assistant' | 'system';
        if (data.model?.providerID && data.model?.modelID && !model) {
          model = { provider: data.model.providerID, id: data.model.modelID };
        }
        const textParts = (partsByMessage.get(m.id) ?? [])
          .filter((p): p is { type: 'text'; text: string } =>
            typeof (p as { type?: string }).type === 'string' &&
            (p as { type: string }).type === 'text',
          )
          .map((p) => p.text)
          .filter((t): t is string => typeof t === 'string' && t.length > 0);

        if (textParts.length === 0 && role !== 'user') continue;
        interchange.messages.push({
          role: role === 'assistant' ? 'assistant' : role === 'system' ? 'system' : 'user',
          content: textParts.join('\n'),
          timestamp: m.time_created,
        });
      }
      if (model) interchange.model = model;
      return interchange;
    } finally {
      db.close();
    }
  }
}