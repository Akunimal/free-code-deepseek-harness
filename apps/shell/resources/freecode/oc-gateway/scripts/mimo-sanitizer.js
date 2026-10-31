'use strict';

const STANDARD_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a bash command',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read',
      description: 'Read a file from the filesystem',
      parameters: {
        type: 'object',
        properties: { filePath: { type: 'string' } },
        required: ['filePath']
      }
    }
  }
];

const MAX_ALLOWED_TOKENS = 16384;

function normalizeModelName(model) {
  if (typeof model !== 'string') return model;
  return model.trim().replace(/^(opencode2api\/|opencode\/)+/, '');
}

function sanitizeMimoPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }
  const result = { ...body };

  // 1. Model name normalization (strip opencode2api/ and opencode/ prefixes)
  if (typeof result.model === 'string') {
    result.model = normalizeModelName(result.model);
  }

  // 2. Tool injection & tool_choice
  if (!Array.isArray(result.tools) || result.tools.length === 0) {
    result.tools = STANDARD_TOOLS;
    result.tool_choice = 'none';
  }

  // 3. Output token clamping
  if (typeof result.max_tokens === 'number' && result.max_tokens > MAX_ALLOWED_TOKENS) {
    result.max_tokens = MAX_ALLOWED_TOKENS;
  }
  if (typeof result.max_completion_tokens === 'number' && result.max_completion_tokens > MAX_ALLOWED_TOKENS) {
    result.max_completion_tokens = MAX_ALLOWED_TOKENS;
  }
  if (typeof result.max_output_tokens === 'number' && result.max_output_tokens > MAX_ALLOWED_TOKENS) {
    result.max_output_tokens = MAX_ALLOWED_TOKENS;
  }

  return result;
}

function resolveSessionId(reqHeaders, body, fallbackPrefix = 'mimo-ses') {
  // 1. Canonical session injected by the Electron supervisor (highest priority)
  const envSession = process.env.OC_CANONICAL_SESSION;
  if (envSession && typeof envSession === 'string' && /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/.test(envSession.trim())) {
    return envSession.trim();
  }
  // 2. Per-request header override (advanced clients)
  if (!reqHeaders) reqHeaders = {};
  const headerSession = reqHeaders['x-session-id'] || reqHeaders['x-opencode-session-id'] || reqHeaders['x-conversation-id'];
  if (headerSession && typeof headerSession === 'string' && headerSession.trim()) {
    return headerSession.trim();
  }
  // 3. Body-embedded session
  if (body && typeof body === 'object') {
    if (typeof body.session_id === 'string' && body.session_id.trim()) return body.session_id.trim();
    if (typeof body.conversation_id === 'string' && body.conversation_id.trim()) return body.conversation_id.trim();
  }
  // 4. Generate ephemeral fallback (should not reach here in normal operation)
  return `${fallbackPrefix}-${Date.now().toString(36)}`;
}

module.exports = {
  STANDARD_TOOLS,
  MAX_ALLOWED_TOKENS,
  normalizeModelName,
  sanitizeMimoPayload,
  resolveSessionId
};
