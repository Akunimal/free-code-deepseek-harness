#!/usr/bin/env node
// Build generated metadata without rewriting the user's declared config/models.json.
//   node scripts/sync-models.js         # write data/models.catalog.generated.json
//   node scripts/sync-models.js --dry   # print to stdout, write nothing
//
// Source of truth: config.json.models.catalog.json -> metadata.zen (context_window, max_output,
// reasoning, tool_call, input_modalities). We keep only "-free" models that are listed in zen,
// have metadata, are not in unsupported.zen, and (if availability data exists) are not disabled.
// A per-model OVERRIDES map records values verified by hand that differ from the catalog.
const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('./runtime-config');

const GATEWAY_HOME = process.env.OC_GATEWAY_HOME || path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(GATEWAY_HOME, 'config');
const CATALOG = [
  path.join(GATEWAY_HOME, 'data', 'direct-config.json.models.catalog.json'),
  path.join(GATEWAY_HOME, 'data', 'pool-config.json.models.catalog.json'),
  path.join(CONFIG_DIR, 'config.json.models.catalog.json')
].find(candidate => fs.existsSync(candidate));
const MODELS_OUT = path.join(GATEWAY_HOME, 'data', 'models.catalog.generated.json');

// Verified overrides (catalog is sometimes conservative). Keep the reason with each.
const OVERRIDES = {
  // Live test 2026-10-16 accepted 249,100 prompt tokens; catalog lists 200000. Keeping mimo at
  // 256000 stops the proxy routing MiMo's large agent requests away from mimo too early.
  'mimo-v2.6-flash-free': { context_window: 256000 },
  // Live test 2026-10-16: deepseek-v4.1-flash-free accepted 265,711 prompt tokens (HTTP 200) direct to
  // opencode2api; catalog lists 200000. Without this the proxy filters deepseek out of long Prime Desk chats.
  'deepseek-v4.1-flash-free': { context_window: 1000000 },
  // catalog@2026-10-16 reports max_output equal to the whole context window, which is wrong:
  // a max_output equal to context_window leaves no room for input. Correcting it to 32000 so
  // the stored metadata is not misleading (routing does not use max_output today, but a future
  // change could start relying on it).
  'nemotron-3.5-lightning-free': { max_output: 32000 }
};

const COOLDOWN_CAP_SECONDS = 300;
const DEFAULT_MODEL = 'mimo-v2.6-flash-free';

function findAvailability() {
  // availability file name carries a config hash: config.json.<hash>.availability.json
  const f = fs.readdirSync(CONFIG_DIR).find((n) => /\.availability\.json$/.test(n));
  if (!f) return {};
  try { return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, f), 'utf8')); } catch { return {}; }
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const zenMeta = (catalog.metadata && catalog.metadata.zen) || {};
  const unsupported = (catalog.unsupported && catalog.unsupported.zen) || {};
  const availability = findAvailability();

  const freeNames = (catalog.zen || []).filter((m) => m.endsWith('-free'));
  const models = {};
  const skipped = [];

  for (const name of freeNames) {
    const meta = zenMeta[name];
    if (!meta) { skipped.push(`${name} (no metadata)`); continue; }
    if (unsupported[name]) { skipped.push(`${name} (unsupported)`); continue; }
    if (availability[name] && availability[name].disabled) { skipped.push(`${name} (disabled)`); continue; }

    // Normalize modalities to what proxy.js understands (text/image/audio/video); keep pdf out.
    const mods = (meta.input_modalities || ['text']).filter((m) => ['text', 'image', 'audio', 'video'].includes(m));
    const entry = {
      modalities: mods.length ? mods : ['text'],
      context_window: meta.context_window || 200000,
      max_output: meta.max_output || 32000,
      supports_reasoning: !!meta.reasoning,
      supports_tools: !!meta.tool_call
    };
    if (OVERRIDES[name]) Object.assign(entry, OVERRIDES[name]);
    models[name] = entry;
  }

  // Fallback order: probe_succeeded first, then larger context first. Keeps text-only models usable.
  const rank = (m) => {
    const ok = availability[m] && availability[m].reason === 'probe_succeeded' ? 0 : 1;
    return [ok, -(models[m].context_window || 0)];
  };
  const ordered = Object.keys(models).sort((a, b) => {
    const [ra, ca] = rank(a), [rb, cb] = rank(b);
    return ra - rb || ca - cb;
  });

  const chainFor = (requested) => ordered.filter((m) => m !== requested);
  const fallback_chains = { default: chainFor(DEFAULT_MODEL) };
  if (models[DEFAULT_MODEL]) fallback_chains[DEFAULT_MODEL] = chainFor(DEFAULT_MODEL);

  const out = {
    _generated: { by: 'scripts/sync-models.js', from: path.basename(CATALOG), at: new Date().toISOString() },
    cooldown_cap_seconds: COOLDOWN_CAP_SECONDS,
    models,
    fallback_chains
  };

  const json = JSON.stringify(out, null, 2) + '\n';
  if (process.argv.includes('--dry')) {
    process.stdout.write(json);
  } else {
    // Only rewrite when the catalog-derived content changed (ignore the generation timestamp).
    const withoutStamp = (o) => {
      const { _generated, ...rest } = o; // eslint-disable-line no-unused-vars
      return JSON.stringify(rest);
    };
    let current = null;
    try { current = JSON.parse(fs.readFileSync(MODELS_OUT, 'utf8')); } catch {}
    if (current && withoutStamp(current) === withoutStamp(out)) {
      process.stderr.write('models.json already up to date\n');
    } else {
    atomicWriteJson(MODELS_OUT, out);
      process.stderr.write(`Wrote ${Object.keys(models).length} models to ${MODELS_OUT}\n`);
    }
  }
  if (skipped.length) process.stderr.write('Skipped: ' + skipped.join(', ') + '\n');
}

main();
