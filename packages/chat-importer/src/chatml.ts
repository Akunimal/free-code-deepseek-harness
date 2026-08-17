import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { InterchangeChat, ImportableChat } from '@freecode/shared-types';
import { ChatImporter } from './index.js';

/**
 * ChatMlImporter — generic OpenAI-style ChatML JSON fallback.
 * Accepts a single file or a folder of *.json files, each with either:
 *   { messages: [{role, content}] }  or  an array of messages.
 */
export class ChatMlImporter implements ChatImporter {
  readonly id = 'chatml';

  async detect(pathOrFolder: string): Promise<boolean> {
    if (!existsSync(pathOrFolder)) return false;
    if (statSync(pathOrFolder).isFile()) {
      return extname(pathOrFolder).toLowerCase() === '.json';
    }
    try {
      return readdirSync(pathOrFolder).some((f) => extname(f).toLowerCase() === '.json');
    } catch {
      return false;
    }
  }

  async list(pathOrFolder: string): Promise<ImportableChat[]> {
    const files = this.jsonFiles(pathOrFolder);
    return files.map((f) => {
      const st = statSync(f);
      let workspaceRoot: string | undefined;
      let title: string | undefined;
      try {
        const raw = JSON.parse(readFileSync(f, 'utf8')) as { workspaceRoot?: string; title?: string };
        workspaceRoot = raw.workspaceRoot;
        title = raw.title;
      } catch {
        /* no metadata */
      }
      return {
        id: f,
        title: title ?? (f.split(/[\\/]/).pop() ?? f),
        updatedAt: st.mtimeMs,
        messageCount: 0, // filled in read
        agent: 'chatml',
        workspaceRoot,
      };
    });
  }

  async read(chatId: string): Promise<InterchangeChat> {
    const raw = JSON.parse(readFileSync(chatId, 'utf8')) as {
      messages?: unknown[];
      title?: string;
      id?: string;
      workspaceRoot?: string;
    };
    const messages = Array.isArray(raw) ? (raw as unknown[]) : (raw.messages ?? []);
    return {
      version: 1,
      sourceAgent: 'chatml',
      sourceChatId: raw.id ?? chatId,
      title: raw.title ?? (chatId.split(/[\\/]/).pop() ?? 'chatml import'),
      createdAt: 0,
      updatedAt: statSync(chatId).mtimeMs,
      workspaceRoot: raw.workspaceRoot,
      messages: messages.map((m) => {
        const msg = m as { role?: string; content?: unknown };
        const content = Array.isArray(msg.content)
          ? (msg.content as unknown[])
              .filter((p) => typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text')
              .map((p) => (p as { text?: string }).text ?? '')
              .filter((t): t is string => typeof t === 'string')
              .join('\n')
          : String(msg.content ?? '');
        return {
          role: (msg.role === 'assistant' || msg.role === 'system' ? msg.role : 'user') as
            | 'user'
            | 'assistant'
            | 'system',
          content,
        };
      }),
    };
  }

  private jsonFiles(pathOrFolder: string): string[] {
    if (statSync(pathOrFolder).isFile()) return [pathOrFolder];
    return readdirSync(pathOrFolder)
      .filter((f) => extname(f).toLowerCase() === '.json')
      .map((f) => join(pathOrFolder, f));
  }
}