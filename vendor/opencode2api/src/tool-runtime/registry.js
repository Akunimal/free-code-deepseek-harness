import { EXTERNAL_TOOL_PREFIX } from './contracts.js';

function normalizeDescription(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeParameters(parameters) {
  if (parameters && typeof parameters === 'object' && !Array.isArray(parameters)) {
    return parameters;
  }
  return { type: 'object', properties: {} };
}

/**
 * Normalizes the two function-tool shapes the proxy receives.
 *
 * Chat Completions nests the definition:  { type:'function', function:{ name, parameters } }
 * The Responses API keeps it flat:        { type:'function', name, parameters }
 *
 * Callers used to read `tool.function.name` directly, so every Responses-API tool was
 * silently dropped from the registry. An empty registry means no tool contract reaches the
 * prompt and no tool-call markup is ever parsed back out, which is indistinguishable from
 * a model that simply refuses to call tools.
 */
export function normalizeToolDefinition(tool) {
  if (!tool || tool.type !== 'function') return null;
  const definition = tool.function && typeof tool.function === 'object' ? tool.function : tool;
  const name = String(definition.name || '').trim();
  if (!name) return null;
  return {
    name,
    description: definition.description,
    parameters: definition.parameters
  };
}

export function buildExternalToolRegistry(tools, options = {}) {
  if (!Array.isArray(tools) || tools.length === 0) return [];
  const prefix = options.prefix || EXTERNAL_TOOL_PREFIX;
  const registry = [];
  const seenNamespaced = new Set();

  tools.forEach((tool) => {
    const definition = normalizeToolDefinition(tool);
    if (!definition) return;
    const originalName = definition.name;

    let namespacedName = `${prefix}${originalName}`;
    let counter = 2;
    while (seenNamespaced.has(namespacedName)) {
      namespacedName = `${prefix}${originalName}_${counter}`;
      counter += 1;
    }
    seenNamespaced.add(namespacedName);

    registry.push({
      originalName,
      namespacedName,
      description: normalizeDescription(definition.description),
      parameters: normalizeParameters(definition.parameters)
    });
  });

  return registry;
}

export function findExternalToolByName(registry, name) {
    if (!name || !Array.isArray(registry)) return null;
    const exact = registry.find((tool) => tool.namespacedName === name || tool.originalName === name);
    if (exact) return exact;

    // Models frequently drop separators or change case when emitting a tool name
    // (e.g. the request declares `web_fetch` but the model writes `webfetch`).
    // Fall back to a separator/case-insensitive match, but only when it is
    // unambiguous — an exact match always wins and a tie resolves to nothing.
    const normalized = normalizeToolNameForMatch(name);
    if (!normalized) return null;
    const matches = registry.filter((tool) =>
        normalizeToolNameForMatch(tool.namespacedName) === normalized ||
        normalizeToolNameForMatch(tool.originalName) === normalized
    );
    return matches.length === 1 ? matches[0] : null;
}

function normalizeToolNameForMatch(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
