import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ImportMarkerStore } from './index.js';

/** JSON-file-backed dedup store at <userData>/imported-chats.json. */
export class JsonFileMarkerStore implements ImportMarkerStore {
  private markers = new Set<string>();
  private readonly file: string;

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'imported-chats.json');
    if (existsSync(this.file)) {
      try {
        const data = JSON.parse(readFileSync(this.file, 'utf8')) as string[];
        if (Array.isArray(data)) for (const k of data) this.markers.add(k);
      } catch {
        /* corrupt store: start fresh */
      }
    }
  }

  private key(agent: string, chatId: string): string {
    return `${agent}:${chatId}`;
  }

  async isImported(agent: string, chatId: string): Promise<boolean> {
    return this.markers.has(this.key(agent, chatId));
  }

  async markImported(agent: string, chatId: string): Promise<void> {
    this.markers.add(this.key(agent, chatId));
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify([...this.markers], null, 2));
  }
}