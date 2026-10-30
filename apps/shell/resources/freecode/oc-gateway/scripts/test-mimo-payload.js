'use strict';

const assert = require('assert');
const {
  STANDARD_TOOLS,
  MAX_ALLOWED_TOKENS,
  normalizeModelName,
  sanitizeMimoPayload,
  resolveSessionId
} = require('./mimo-sanitizer');

console.log('[TEST] Running mimo payload sanitizer test suite...');

// Test 1: Empty tools array triggers injection and tool_choice = 'none'
{
  const input = {
    model: 'mimo-v2.6-flash-free',
    messages: [{ role: 'user', content: 'Resumí este texto' }],
    tools: []
  };
  const sanitized = sanitizeMimoPayload(input);
  assert.strictEqual(sanitized.tools.length, 2, 'Should inject 2 standard tools');
  assert.strictEqual(sanitized.tools[0].function.name, 'bash');
  assert.strictEqual(sanitized.tools[1].function.name, 'read');
  assert.strictEqual(sanitized.tool_choice, 'none', 'Should set tool_choice to none');
  console.log('  OK: Empty tools injected with tool_choice=none');
}

// Test 2: Missing tools field triggers injection and tool_choice = 'none'
{
  const input = {
    model: 'mimo-v2.6-flash-free',
    messages: [{ role: 'user', content: 'Generar título' }]
  };
  const sanitized = sanitizeMimoPayload(input);
  assert.strictEqual(sanitized.tools.length, 2, 'Should inject 2 standard tools');
  assert.strictEqual(sanitized.tool_choice, 'none', 'Should set tool_choice to none');
  console.log('  OK: Missing tools injected with tool_choice=none');
}

// Test 3: Existing tools must NOT be overwritten, tool_choice must remain untouched
{
  const customTool = {
    type: 'function',
    function: {
      name: 'custom_search',
      parameters: { type: 'object', properties: {} }
    }
  };
  const input = {
    model: 'mimo-v2.6-flash-free',
    messages: [{ role: 'user', content: 'Buscar archivos' }],
    tools: [customTool],
    tool_choice: 'auto'
  };
  const sanitized = sanitizeMimoPayload(input);
  assert.strictEqual(sanitized.tools.length, 1);
  assert.strictEqual(sanitized.tools[0].function.name, 'custom_search');
  assert.strictEqual(sanitized.tool_choice, 'auto', 'Should preserve existing tool_choice');
  console.log('  OK: Existing tools and tool_choice preserved');
}

// Test 4: Clamping max_tokens, max_completion_tokens, max_output_tokens to 16384
{
  const input = {
    model: 'mimo-v2.6-flash-free',
    messages: [{ role: 'user', content: 'Hola' }],
    max_tokens: 32000,
    max_completion_tokens: 65536,
    max_output_tokens: 20000
  };
  const sanitized = sanitizeMimoPayload(input);
  assert.strictEqual(sanitized.max_tokens, MAX_ALLOWED_TOKENS, 'Should clamp max_tokens to 16384');
  assert.strictEqual(sanitized.max_completion_tokens, MAX_ALLOWED_TOKENS, 'Should clamp max_completion_tokens to 16384');
  assert.strictEqual(sanitized.max_output_tokens, MAX_ALLOWED_TOKENS, 'Should clamp max_output_tokens to 16384');
  console.log('  OK: Tokens clamped to 16384');
}

// Test 5: Tokens below threshold remain untouched
{
  const input = {
    model: 'mimo-v2.6-flash-free',
    messages: [{ role: 'user', content: 'Hola' }],
    max_tokens: 4096
  };
  const sanitized = sanitizeMimoPayload(input);
  assert.strictEqual(sanitized.max_tokens, 4096, 'Should keep 4096 untouched');
  console.log('  OK: Tokens <= 16384 preserved');
}

// Test 6: resolveSessionId extraction
{
  const h1 = { 'x-session-id': 'ses_custom123' };
  assert.strictEqual(resolveSessionId(h1, {}), 'ses_custom123');

  const h2 = { 'x-opencode-session-id': 'ses_opencode456' };
  assert.strictEqual(resolveSessionId(h2, {}), 'ses_opencode456');

  const b1 = { conversation_id: 'conv_789' };
  assert.strictEqual(resolveSessionId({}, b1), 'conv_789');

  const fallback = resolveSessionId({}, {}, 'prefix');
  assert.ok(fallback.startsWith('prefix-'), 'Fallback session ID generated');
  console.log('  OK: Session ID resolution verified');
}

// Test 7: Model name prefix stripping (opencode2api/, opencode/)
{
  assert.strictEqual(normalizeModelName('opencode2api/mimo-v2.6-flash-free'), 'mimo-v2.6-flash-free');
  assert.strictEqual(normalizeModelName('opencode/mimo-v2.6-flash-free'), 'mimo-v2.6-flash-free');
  assert.strictEqual(normalizeModelName('opencode2api/opencode/mimo-v2.6-flash-free'), 'mimo-v2.6-flash-free');
  assert.strictEqual(normalizeModelName('mimo-v2.6-flash-free'), 'mimo-v2.6-flash-free');

  const input = {
    model: 'opencode2api/opencode/mimo-v2.6-flash-free',
    messages: [{ role: 'user', content: 'test' }]
  };
  const sanitized = sanitizeMimoPayload(input);
  assert.strictEqual(sanitized.model, 'mimo-v2.6-flash-free', 'Should normalize model name in payload');
  console.log('  OK: Model name prefixes cleanly stripped');
}

console.log('[TEST] All mimo payload sanitizer tests PASSED!');
