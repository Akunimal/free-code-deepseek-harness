import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dump, load } from 'js-yaml';

export const FALLBACK_PROVIDER = 'freecode-omniroute';
export const FALLBACK_MODEL = 'auto/coding:free';
export type FallbackNotice = 'preparing' | 'unavailable' | 'warming' | 'active' | 'primary';
interface Selection { provider: string; model: string; reasoningEffort?: unknown }
interface Options { homeDir: string; userDataDir: string; now?: () => number }

/** Counts only completed primary probes; manual bursts cannot shorten grace. */
export class ModelFallback {
  private misses = 0;
  private firstMiss?: number;
  private eligible = false;
  private noticeStates = new Set<FallbackNotice>();
  private lease?: { previous: Selection; assigned: Selection };
  private readonly settingsPath: string;
  private readonly receiptPath: string;
  constructor(private readonly options: Options) {
    this.settingsPath = join(options.homeDir, 'settings.yaml');
    this.receiptPath = join(options.userDataDir, 'model-fallback-state.json');
    try {
      const lease = JSON.parse(readFileSync(this.receiptPath, 'utf8'));
      if (lease.previous?.provider === 'deepseek-free' && typeof lease.previous.model === 'string'
        && lease.assigned?.provider === FALLBACK_PROVIDER && lease.assigned.model === FALLBACK_MODEL) this.lease = lease;
    } catch { /* No app-owned selection to restore. */ }
  }

  observePrimary(responders: readonly string[]): boolean {
    if (responders.length) {
      if (this.misses > 0) this.noticeStates.clear();
      this.misses = 0; this.firstMiss = undefined; this.eligible = false;
      this.restore(responders);
    } else {
      this.firstMiss ??= (this.options.now ?? Date.now)();
      this.misses++;
      this.eligible = this.misses >= 9 && (this.options.now ?? Date.now)() - this.firstMiss >= 240_000;
    }
    return this.eligible;
  }

  activate(verifiedResponders: readonly string[]): boolean {
    if (!this.eligible || !verifiedResponders.includes(FALLBACK_MODEL)) return false;
    const settings = this.readSettings();
    const current = settings['agent-default-model'];
    if (this.lease && same(current, this.lease.assigned)) return true;
    if (current?.provider !== 'deepseek-free' || typeof current.model !== 'string') return false;
    const assigned = { provider: FALLBACK_PROVIDER, model: FALLBACK_MODEL };
    this.lease = { previous: { ...current }, assigned };
    mkdirSync(this.options.userDataDir, { recursive: true });
    atomicWrite(this.receiptPath, JSON.stringify(this.lease));
    settings['agent-default-model'] = assigned;
    this.writeSettings(settings);
    return true;
  }

  noticeChanged(state: FallbackNotice): boolean {
    if (this.noticeStates.has(state)) return false;
    this.noticeStates.add(state);
    return true;
  }

  private restore(responders: readonly string[]): void {
    if (!this.lease) return;
    const settings = this.readSettings();
    if (same(settings['agent-default-model'], this.lease.assigned)) {
      settings['agent-default-model'] = responders.includes(this.lease.previous.model)
        ? this.lease.previous : { provider: 'deepseek-free', model: responders[0] };
      this.writeSettings(settings);
    }
    this.lease = undefined;
    rmSync(this.receiptPath, { force: true });
  }

  private readSettings(): Record<string, any> {
    if (!existsSync(this.settingsPath)) return {};
    const settings = load(readFileSync(this.settingsPath, 'utf8'));
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid fallback settings');
    return settings as Record<string, any>;
  }
  private writeSettings(settings: Record<string, any>): void {
    mkdirSync(this.options.homeDir, { recursive: true });
    atomicWrite(this.settingsPath, dump(settings, { noRefs: true, lineWidth: 120 }));
  }
}

function same(a: Selection | undefined, b: Selection): boolean {
  return a?.provider === b.provider && a.model === b.model && a.reasoningEffort === b.reasoningEffort;
}
function atomicWrite(path: string, value: string): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, value, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, path);
}
