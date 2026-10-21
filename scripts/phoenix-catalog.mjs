import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PHOENIX_PROVIDER_ORDER = Object.freeze(['pollinations', 'llm7', 'ovh', 'kilo']);

// FreeLLMpool's bundled capability values (benchmarks where known, its
// documented name heuristic otherwise) are the primary selector quality
// signal. Kilo's live catalog does not share that scale, so use its published
// Code-agent usage rank as a weaker cross-catalog proxy for direct Kilo routes.
// This is real usage, not an objective capability score, and changes over time.
// Kilo snapshot checked 2026-10-21. Its free catalog revalidates every 60s;
// source cards publish Code-agent ranks and the anonymous 200 req/hour/IP cap:
// https://kilo.ai/landing/free-models
// https://kilo.ai/docs/gateway/authentication
const MODEL_QUALITY_SCORES = Object.freeze({
  'pollinations/openai': 0.5,
  'pollinations/openai-fast': 0.5,
  'pollinations/gpt-oss': 0.5,
  'pollinations/ovh-reasoning': 0.62,
  'llm7/default': 0.5,
  'llm7/fast': 0.5,
  'llm7/codestral-latest': 0.3759,
  'llm7/gpt-oss:20b': 0.46,
  'ovh/Meta-Llama-3_3-70B-Instruct': 0.638,
  'ovh/Qwen3.5-397B-A17B': 0.85,
  'ovh/gpt-oss-120b': 0.78,
  'ovh/Mistral-Small-3.2-24B-Instruct-2506': 0.6224,
  'ovh/Mistral-Nemo-Instruct-2407': 0.5,
  'ovh/Qwen3.6-27B': 0.7969,
  'ovh/Qwen3.5-9B': 0.38,
  'ovh/Qwen2.5-VL-72B-Instruct': 0.6328,
  'ovh/Mistral-7B-Instruct-v0.3': 0.2214,
  'ovh/gpt-oss-20b': 0.46,
  'ovh/Qwen3-Coder-30B-A3B-Instruct': 0.7969,
  'ovh/Qwen3.8-27B': 0.46,
});

const KILO_CODE_AGENT_RANKS = Object.freeze({
  // Official model-card Code-agent ranks, not benchmark scores.
  'kilo/minimax/minimax-m3.1-flash:free': 14,
  'kilo/poolside/laguna-s-2.1:free': 98,
  'kilo/dots-studio/dots-3-note-preview:free': 99,
});
// Kilo's leaderboard says 500+ models are supported. Use 500 as a conservative
// normalization floor for its rank percentile; this only positions Kilo routes
// approximately alongside FreeLLMpool's separate 0..1 capability scale.
const KILO_RANK_NORMALIZATION_FLOOR = 500;
const KILO_FREE_MODEL_NAMES = Object.freeze(Object.keys(KILO_CODE_AGENT_RANKS).map((id) => id.slice('kilo/'.length)));
const FORBIDDEN_KILO_MODEL_IDS = new Set(['kilo/openrouter/free', 'kilo/kilo-auto/free']);

export function phoenixModelQualityScore(id) {
  const kiloRank = KILO_CODE_AGENT_RANKS[id];
  if (kiloRank !== undefined) {
    return (KILO_RANK_NORMALIZATION_FLOOR - kiloRank) / (KILO_RANK_NORMALIZATION_FLOOR - 1);
  }
  const score = MODEL_QUALITY_SCORES[id];
  if (score === undefined) throw new Error(`Phoenix model is missing a reviewed quality rank: ${id}`);
  return score;
}

function parseProviderId(block) {
  const match = block.match(/^id\s*=\s*["']([^"']+)["']\s*$/m);
  if (!match) throw new Error('FreeLLMpool provider block is missing a literal id');
  return match[1];
}

function parseEnabledModelIds(block, providerId) {
  const models = block.match(/^models\s*=\s*\[([\s\S]*?)^\s*\]/m)?.[1];
  if (models === undefined) throw new Error(`FreeLLMpool provider ${providerId} has no literal models array`);
  const ids = [];
  for (const match of models.matchAll(/\{([^{}]*)\}/g)) {
    const name = match[1].match(/\bname\s*=\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    if (name === undefined) throw new Error(`FreeLLMpool provider ${providerId} has a model without a literal name`);
    if (/\benabled\s*=\s*false\b/.test(match[1])) continue;
    ids.push(`${providerId}/${name}`);
  }
  return ids;
}

function readModelEntries(block, providerId) {
  const models = block.match(/^models\s*=\s*\[([\s\S]*?)^\s*\]/m)?.[1];
  if (models === undefined) throw new Error(`FreeLLMpool provider ${providerId} has no literal models array`);
  return [...models.matchAll(/\{([^{}]*)\}/g)].map((match) => match[0]);
}

function replaceModelEntries(block, entries, providerId) {
  const modelsArray = /^([ \t]*models[ \t]*=[ \t]*\[)([\s\S]*?)(^[ \t]*\])/m;
  if (!modelsArray.test(block)) throw new Error(`FreeLLMpool provider ${providerId} has no replaceable models array`);
  return block.replace(modelsArray, (_whole, opening, _body, closing) =>
    `${opening}\n${entries.map((entry) => `    ${entry.trim()},`).join('\n')}\n${closing}`);
}

function applyPhoenixModelPolicy(block, providerId) {
  if (providerId === 'kilo') {
    return replaceModelEntries(block, KILO_FREE_MODEL_NAMES.map((name) => `{ name = "${name}", rpd = 0 }`), providerId);
  }

  const entries = readModelEntries(block, providerId);
  const allowed = entries.filter((entry) => {
    const name = entry.match(/\bname\s*=\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    if (name === undefined) throw new Error(`FreeLLMpool provider ${providerId} has a model without a literal name`);
    return !/nemotron/i.test(name);
  });
  return allowed.length === entries.length ? block : replaceModelEntries(block, allowed, providerId);
}

function compareModelQuality(a, b, order) {
  const scoreDifference = phoenixModelQualityScore(b) - phoenixModelQualityScore(a);
  return scoreDifference || order.get(a) - order.get(b);
}

function trimTrailingSectionComments(block) {
  const lines = block.split('\n');
  while (lines.length > 0 && (lines.at(-1).trim() === '' || lines.at(-1).trimStart().startsWith('#'))) lines.pop();
  return lines.join('\n').trim();
}

export function extractPhoenixCatalog(upstreamToml) {
  const lines = upstreamToml.replaceAll('\r\n', '\n').split('\n');
  const sections = [];
  const providerIds = [];
  const concreteModelIds = [];
  for (let start = 0; start < lines.length; start++) {
    if (lines[start] !== '[[provider]]') continue;
    let end = start + 1;
    while (end < lines.length && !/^\[\[(?:provider|embedder|transcriber)\]\]$/.test(lines[end])) end++;
    // FreeLLMpool places the next provider's explanatory comments before its
    // `[[provider]]` marker. Do not accidentally carry those into this slice.
    const originalBlock = trimTrailingSectionComments(lines.slice(start, end).join('\n'));
    const id = parseProviderId(originalBlock);
    if (PHOENIX_PROVIDER_ORDER.includes(id)) {
      const block = applyPhoenixModelPolicy(originalBlock, id);
      sections.push(block);
      providerIds.push(id);
      concreteModelIds.push(...parseEnabledModelIds(block, id));
    }
    start = end - 1;
  }
  if (providerIds.join('\0') !== PHOENIX_PROVIDER_ORDER.join('\0')) {
    throw new Error(`FreeLLMpool catalog provider set/order changed: ${providerIds.join(', ')}`);
  }

  const text = `${sections.join('\n\n')}\n`;
  if (/nemotron/i.test(text)) throw new Error('Phoenix provider slice still contains a Nemotron route or reference');
  if (concreteModelIds.some((id) => FORBIDDEN_KILO_MODEL_IDS.has(id))) {
    throw new Error('Phoenix Kilo catalog contains a dynamic route that could select an unreviewed model');
  }
  // Fail closed if an upstream edit adds a paid provider or a secret value to
  // one of the selected entries. Variable names such as LLM7_API_KEY are safe.
  if (/^auth\s*=\s*["'](?:key|api_key)["']\s*$/mi.test(text)
    || /^api[_-]?key\s*=\s*["'][^"']{20,}["']\s*$/mi.test(text)) {
    throw new Error('Phoenix provider slice contains an API-key-only route or credential literal');
  }
  if (new Set(concreteModelIds).size !== concreteModelIds.length) throw new Error('Phoenix model catalog contains duplicate IDs');
  const order = new Map(concreteModelIds.map((id, index) => [id, index]));
  const modelIds = ['auto', ...concreteModelIds.toSorted((a, b) => compareModelQuality(a, b, order))];
  return { providerIds, modelIds, text };
}

export function verifyPhoenixCatalog(root) {
  const upstreamPath = join(root, 'vendor', 'freellmpool', 'src', 'freellmpool', 'providers.toml');
  const outputPath = join(root, 'apps', 'shell', 'resources', 'phoenix', 'phoenix-providers.toml');
  const expected = extractPhoenixCatalog(readFileSync(upstreamPath, 'utf8'));
  const actual = readFileSync(outputPath, 'utf8').replaceAll('\r\n', '\n');
  if (actual !== expected.text) throw new Error('Phoenix provider catalog is stale or includes routes outside its pinned source slice');
  const idsPath = join(root, 'apps', 'shell', 'resources', 'phoenix', 'phoenix-model-ids.json');
  const actualIds = JSON.parse(readFileSync(idsPath, 'utf8'));
  if (JSON.stringify(actualIds) !== JSON.stringify(expected.modelIds)) throw new Error('Phoenix model ID allowlist is stale or differs from the pinned provider catalog');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const outputPath = join(root, 'apps', 'shell', 'resources', 'phoenix', 'phoenix-providers.toml');
  const idsPath = join(root, 'apps', 'shell', 'resources', 'phoenix', 'phoenix-model-ids.json');
  if (process.argv[2] === '--write') {
    const upstreamPath = join(root, 'vendor', 'freellmpool', 'src', 'freellmpool', 'providers.toml');
    const { providerIds, modelIds, text } = extractPhoenixCatalog(readFileSync(upstreamPath, 'utf8'));
    writeFileSync(outputPath, text, 'utf8');
    writeFileSync(idsPath, `${JSON.stringify(modelIds, null, 2)}\n`, 'utf8');
    console.log(`Phoenix catalog generated from pinned providers: ${providerIds.join(', ')} (${modelIds.length} model IDs)`);
  } else if (process.argv[2] === '--verify') {
    verifyPhoenixCatalog(root);
    console.log('Phoenix catalog matches the pinned FreeLLMpool provider slice');
  } else {
    throw new Error('use --write or --verify');
  }
}
