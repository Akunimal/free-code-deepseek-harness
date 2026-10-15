/** The current DSH Host watches profile patches, not the removed settings.yaml. */
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isMap, isSeq, parseDocument, YAMLMap, YAMLSeq } from 'yaml';

type Settings = Record<string, any>;
const MANAGED_PROVIDER = 'deepseek-free';
const MANAGED_KEYS = new Set([MANAGED_PROVIDER, 'opencode-free', 'perplexity-free', 'gemini-web']);
const ENTRY_NAMES: Record<string, string> = {
  'llm-pi-ai': '@deepseek-ai/dsh-llm-pi-ai',
  'agent-default-model': '@deepseek-ai/dsh-agent-default-model',
};
export function harnessSettingsPath(home: string): string {
  return join(home, 'profiles', 'web', 'cordis.patch.yml');
}
function document(path: string, initial: string) {
  // Unknown !!js nodes remain inert CST nodes. Never evaluate them, and never
  // rebuild untouched user nodes from their JSON projection.
  const doc = parseDocument(existsSync(path) ? readFileSync(path, 'utf8') : initial);
  if (doc.errors.length) throw new Error(`Invalid DSH configuration at ${path}: ${doc.errors[0]!.message}`);
  return doc;
}
function profileDocument(home: string) {
  const path = harnessSettingsPath(home);
  const doc = document(path, '[]\n');
  if (!isSeq(doc.contents)) throw new Error(`DSH profile must be an entry list: ${path}`);
  return { path, doc, entries: doc.contents as YAMLSeq };
}
function entry(entries: YAMLSeq, id: string): YAMLMap | undefined {
  const matches = entries.items.filter(node => isMap(node) && node.get('id') === id);
  if (matches.length > 1) throw new Error(`Duplicate DSH profile entry: ${id}`);
  return matches[0] as YAMLMap | undefined;
}
export function readHarnessSettings(home: string): Settings {
  const legacyPath = join(home, 'settings.yaml');
  const legacy = existsSync(legacyPath) ? document(legacyPath, '{}\n').toJS() as Settings : {};
  const { entries } = profileDocument(home);
  const result: Settings = { ...legacy };
  for (const ns of Object.keys(ENTRY_NAMES)) {
    const node = entry(entries, ns);
    if (node === undefined) continue;
    const config = node.get('config');
    if (!isMap(config)) continue;
    const active = config.toJSON() as Settings;
    result[ns] = ns === 'llm-pi-ai'
      ? { ...legacy[ns], ...active, providers: { ...legacy[ns]?.providers, ...active.providers } }
      : active;
  }
  return result;
}
function atomicWrite(path: string, text: string): boolean {
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, text, 'utf8');
  renameSync(temporary, path);
  return true;
}

/** Apply only changed model-profile nodes; preserve unrelated tags/comments. */
export function writeHarnessSettings(home: string, settings: Settings): boolean {
  const { path, doc, entries } = profileDocument(home);
  const providers = settings['llm-pi-ai']?.providers ?? {};
  // DSH refuses a hand-declared route with an empty catalog. Absence, not an
  // invalid models:[], is its supported dormant state.
  if (Array.isArray(providers[MANAGED_PROVIDER]?.models) && providers[MANAGED_PROVIDER].models.length === 0) {
    delete providers[MANAGED_PROVIDER];
  }
  const selected = settings['agent-default-model'];
  if (selected?.provider === MANAGED_PROVIDER && !providers[MANAGED_PROVIDER]?.models?.some(
    (model: any) => (typeof model === 'string' ? model : model?.id) === selected.model,
  )) delete settings['agent-default-model'];

  for (const [ns, name] of Object.entries(ENTRY_NAMES)) {
    let node = entry(entries, ns);
    const desired = settings[ns];
    if (desired === undefined) {
      const selectedProvider = node?.getIn(['config', 'provider']);
      if (ns === 'agent-default-model' && typeof selectedProvider === 'string'
        && !MANAGED_KEYS.has(selectedProvider)) continue;
      if (node) entries.items.splice(entries.items.indexOf(node), 1);
      continue;
    }
    if (!node) {
      node = doc.createNode({ id: ns, name, config: {} }) as YAMLMap;
      entries.add(node);
    }
    if (!isMap(node.get('config'))) node.set('config', doc.createNode({}));
    const config = node.get('config') as YAMLMap;
    if (ns === 'llm-pi-ai') {
      const existing = isMap(config.get('providers')) ? config.get('providers') as YAMLMap : undefined;
      if (!existing) config.set('providers', doc.createNode({}));
      const target = config.get('providers') as YAMLMap;
      for (const pair of [...target.items]) {
        const key = String(pair.key);
        if (MANAGED_KEYS.has(key) && !Object.hasOwn(providers, key)) target.delete(key);
      }
      for (const [key, value] of Object.entries(providers)) {
        // A user may edit another route between the snapshot read and this
        // write. Never replay our snapshot over an existing user-owned node.
        if (!MANAGED_KEYS.has(key) && target.has(key)) continue;
        const current = target.get(key);
        const currentValue = isMap(current) ? current.toJSON() : current;
        if (JSON.stringify(currentValue) !== JSON.stringify(value)) target.set(key, doc.createNode(value));
      }
    } else if (config.get('provider') !== undefined && config.get('provider') !== MANAGED_PROVIDER) {
      // Do not overwrite a concurrent user selection of another provider.
      continue;
    } else if (JSON.stringify(config.toJSON()) !== JSON.stringify(desired)) {
      node.set('config', doc.createNode(desired));
    }
  }
  let changed = atomicWrite(path, String(doc));

  // Older shells keep recreating this migration-only input. Preserve a backup
  // before retiring managed sections so the Host cannot re-import stale IDs or
  // ports over the live profile; unrelated legacy settings still migrate normally.
  const legacyPath = join(home, 'settings.yaml');
  if (existsSync(legacyPath)) {
    const legacy = document(legacyPath, '{}\n');
    if (!isMap(legacy.contents)) throw new Error(`Legacy DSH settings must be a mapping: ${legacyPath}`);
    legacy.delete('llm-pi-ai');
    legacy.delete('agent-default-model');
    try { copyFileSync(legacyPath, `${legacyPath}.freecode-profile-backup`, constants.COPYFILE_EXCL); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    changed = atomicWrite(legacyPath, String(legacy)) || changed;
  }
  return changed;
}
