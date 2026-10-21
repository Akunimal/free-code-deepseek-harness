import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PHOENIX_PROVIDER_ORDER = Object.freeze(['pollinations', 'llm7', 'ovh', 'kilo']);

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

export function extractPhoenixCatalog(upstreamToml) {
  const lines = upstreamToml.replaceAll('\r\n', '\n').split('\n');
  const sections = [];
  const providerIds = [];
  const modelIds = ['auto'];
  for (let start = 0; start < lines.length; start++) {
    if (lines[start] !== '[[provider]]') continue;
    let end = start + 1;
    while (end < lines.length && !/^\[\[(?:provider|embedder|transcriber)\]\]$/.test(lines[end])) end++;
    const block = lines.slice(start, end).join('\n').trim();
    const id = parseProviderId(block);
    if (PHOENIX_PROVIDER_ORDER.includes(id)) {
      sections.push(block);
      providerIds.push(id);
      modelIds.push(...parseEnabledModelIds(block, id));
    }
    start = end - 1;
  }
  if (providerIds.join('\0') !== PHOENIX_PROVIDER_ORDER.join('\0')) {
    throw new Error(`FreeLLMpool catalog provider set/order changed: ${providerIds.join(', ')}`);
  }

  const text = `${sections.join('\n\n')}\n`;
  // Fail closed if an upstream edit adds a paid provider or a secret value to
  // one of the selected entries. Variable names such as LLM7_API_KEY are safe.
  if (/^auth\s*=\s*["'](?:key|api_key)["']\s*$/mi.test(text)
    || /^api[_-]?key\s*=\s*["'][^"']{20,}["']\s*$/mi.test(text)) {
    throw new Error('Phoenix provider slice contains an API-key-only route or credential literal');
  }
  if (new Set(modelIds).size !== modelIds.length) throw new Error('Phoenix model catalog contains duplicate IDs');
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
