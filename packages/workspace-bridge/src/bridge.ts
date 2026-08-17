import { basename } from 'node:path';
import { InterchangeChat, ImportableChat } from '@freecode/shared-types';
import { ChatImporter } from '@freecode/chat-importer';
import { HarnessRpcClient, buildContinueSystemMessage } from './rpc-client.js';

/**
 * WorkspaceBridge — user picks a working folder + a source agent (OpenCode);
 * matching chats (workspaceRoot == folder) are listed by recency and can be
 * continued inside the harness as a new session.
 */

export interface ContinueOptions {
  /** Folder the user picked (target cwd for the new harness session). */
  folder: string;
  /** Source agent adapter (e.g. OpenCodeImporter). */
  importer: ChatImporter;
  /** Source storage path the importer reads from. */
  sourcePath: string;
  /** Source chat id to continue. */
  sourceChatId: string;
  /** Harness RPC client. */
  rpc: HarnessRpcClient;
  /** Model to use in the new session (default: harness current). */
  model?: { provider: string; id: string };
}

export interface CandidateChat extends ImportableChat {
  /** Full interchange loaded on demand for "Continue here". */
  chat?: InterchangeChat;
  snippet: string;
}

/** Normalizes path separators for folder matching (Windows vs POSIX). */
function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
}

/** Finds up to 5 chats whose workspaceRoot matches the folder, by updatedAt desc. */
export async function findChatsForFolder(
  importer: ChatImporter,
  folder: string,
  sourcePath: string,
  limit = 5,
): Promise<CandidateChat[]> {
  const all = await importer.list(sourcePath);
  const target = norm(folder);
  const matched = all
    .filter((c) => {
      if (!c.workspaceRoot) return false;
      const root = norm(c.workspaceRoot);
      return root === target || target.startsWith(root) || root.startsWith(target);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);

  const out: CandidateChat[] = [];
  for (const c of matched) {
    const chat = await importer.read(c.id, sourcePath);
    const snippet = chat.messages
      .map((m) => (typeof m.content === 'string' ? m.content : '[tool]'))
      .filter((s) => s.trim().length > 0)
      .pop() ?? '';
    out.push({ ...c, chat, snippet: snippet.slice(0, 160) });
  }
  return out;
}

/** Imports the chat into a fresh harness session and prompts it. */
export async function continueChat(opts: ContinueOptions): Promise<{ sessionId: string }> {
  const chat = await opts.importer.read(opts.sourceChatId, opts.sourcePath);
  const created = await opts.rpc.createSession({ cwd: opts.folder });
  const sessionId = created.sessionId ?? (created as { id?: string }).id;
  if (!sessionId) throw new Error('session.create returned no session id');
  const system = buildContinueSystemMessage(chat, opts.folder);
  await opts.rpc.prompt(undefined, sessionId, system, opts.model);
  return { sessionId };
}