import { InterchangeChat, ImportableChat } from '@freecode/shared-types';

/**
 * ChatImporter — plug-in contract. Each adapter knows one source format
 * (OpenCode SQLite, DSH export, generic ChatML JSON) and normalizes it to
 * InterchangeChat.
 */
export interface ChatImporter {
  id: string; // 'opencode' | 'dsh-export' | 'chatml'
  /** Heuristic: does this path/folder look like a source this adapter owns? */
  detect(pathOrFolder: string): Promise<boolean>;
  list(pathOrFolder: string): Promise<ImportableChat[]>;
  read(chatId: string, pathOrFolder: string): Promise<InterchangeChat>;
}

/** Deduplication store: sourceAgent+sourceChatId -> imported marker. */
export interface ImportMarkerStore {
  isImported(sourceAgent: string, sourceChatId: string): Promise<boolean>;
  markImported(sourceAgent: string, sourceChatId: string): Promise<void>;
}

export async function importChats(
  importer: ChatImporter,
  source: string,
  chatIds: string[],
  markers: ImportMarkerStore,
): Promise<{ imported: InterchangeChat[]; skipped: InterchangeChat[] }> {
  const imported: InterchangeChat[] = [];
  const skipped: InterchangeChat[] = [];
  for (const id of chatIds) {
    if (await markers.isImported(importer.id, id)) {
      const chat = await importer.read(id, source);
      skipped.push(chat);
      continue;
    }
    const chat = await importer.read(id, source);
    await markers.markImported(importer.id, id);
    imported.push(chat);
  }
  return { imported, skipped };
}

export { OpenCodeImporter } from './opencode.js';
export { ChatMlImporter } from './chatml.js';
export { JsonFileMarkerStore } from './markers.js';