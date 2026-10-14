import { existsSync, lstatSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { load, dump } from 'js-yaml';

const RETIRED_PROVIDER = 'freecode-omniroute';
const RETIRED_MODEL = 'auto/coding:free';

/** Next-start migration only. Never run this against the active app from tooling. */
export async function retireRemovedRuntime(userDataDir: string): Promise<void> {
  const root = resolve(userDataDir);
  const settingsPath = join(root, 'dsh-home', 'settings.yaml');
  const leasePath = join(root, 'model-fallback-state.json');
  const lease = json(leasePath);
  const ownedLease = lease?.previous?.provider === 'deepseek-free'
    && typeof lease.previous.model === 'string'
    && lease.assigned?.provider === RETIRED_PROVIDER && lease.assigned.model === RETIRED_MODEL;
  if (existsSync(settingsPath)) {
    const settings = load(readFileSync(settingsPath, 'utf8')) as any;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid settings; retirement refused');
    const providers = settings['llm-pi-ai']?.providers;
    const legacy = providers?.[RETIRED_PROVIDER];
    const ownedRoute = legacy && /^http:\/\/127\.0\.0\.1:\d+\/v1\/?$/.test(legacy.baseURL)
      && Array.isArray(legacy.models) && legacy.models.every((m: any) => m?.id === RETIRED_MODEL);
    let changed = false;
    if (ownedRoute) { delete providers[RETIRED_PROVIDER]; changed = true; }
    const current = settings['agent-default-model'];
    if ((ownedRoute || ownedLease) && current?.provider === RETIRED_PROVIDER && current.model === RETIRED_MODEL) {
      const ids = providers?.['deepseek-free']?.models?.map((m: any) => m?.id).filter((id: unknown) => typeof id === 'string') ?? [];
      // Restore the user's recorded choice even while the live route catalog
      // is empty; the Host blocks stale selections until a verified model is
      // available. Without a lease, choose an already configured model or
      // leave the default unset for model-refresher to seed after HTTP 200.
      const replacement = ownedLease
        ? lease.previous
        : ids[0] === undefined ? undefined : { provider: 'deepseek-free', model: ids[0] };
      if (replacement) settings['agent-default-model'] = replacement;
      else delete settings['agent-default-model'];
      changed = true;
    }
    if (changed) atomic(settingsPath, dump(settings, { noRefs: true, lineWidth: 120 }));
  }
  if (ownedLease) await rm(leasePath, { force: true });
  const catalogPath = join(root, 'model-catalog.json');
  const catalog = json(catalogPath);
  if (catalog?.providers && Object.hasOwn(catalog.providers, RETIRED_PROVIDER)) {
    delete catalog.providers[RETIRED_PROVIDER];
    atomic(catalogPath, JSON.stringify(catalog));
  }

  // Exact, app-private paths only; never follow a root junction into another app.
  const cache = join(root, 'omniroute-runtime');
  const data = join(root, 'omniroute-data');
  for (const path of [cache, data]) {
    try { if (lstatSync(path).isSymbolicLink()) throw new Error('Retired cache symlink/junction refused'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const pendingPath = join(root, '.freecode-retired-runtime-cleanup.json');
  const receipt = json(join(cache, '.freecode-verified.json'));
  const pending = json(pendingPath);
  if (!(receipt?.version === '3.8.51' && /^[a-f0-9]{64}$/.test(receipt.sha256)) && pending?.schemaVersion !== 1) return;
  // The marker makes a partially interrupted deletion retryable, even if its
  // original cache receipt was already removed. No paths are taken from JSON.
  atomic(pendingPath, JSON.stringify({ schemaVersion: 1 }));
  await rm(cache, { recursive: true, force: true });
  await rm(data, { recursive: true, force: true });
  await rm(pendingPath, { force: true });
}

function json(path: string): any {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; }
}
function atomic(path: string, value: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  const next = `${path}.retirement-tmp`;
  writeFileSync(next, value, { mode: 0o600 });
  renameSync(next, path);
}
