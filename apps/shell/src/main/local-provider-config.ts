/** Local OpenAI-compatible bridges exposed by the desktop shell. */

export const GEMINI_WEB_PROVIDER = 'gemini-web';
export const GEMINI_WEB_DISPLAY_NAME = 'Gemini Web (local)';
export const DEFAULT_GEMINI_WEB2API_PORT = 8081;
export const GEMINI_WEB_FALLBACK_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-thinking',
  'gemini-3.1-pro',
  'gemini-3.1-pro-enhanced',
  'gemini-auto',
  'gemini-3.5-flash-thinking-lite',
  'gemini-flash-lite',
] as const;

export const PERPLEXITY_FREE_PROVIDER = 'perplexity-free';
export const PERPLEXITY_FREE_DISPLAY_NAME = 'Perplexity Free (local)';
export const DEFAULT_PERPLEXITY_API_PORT = 3030;
export const PERPLEXITY_FREE_FALLBACK_MODELS = [
  'experimental',
  'gemini30flash',
  'gemini30pro',
  'gpt52',
  'claude45sonnet',
  'claude45sonnetthinking',
  'claude46opus',
  'grok41nonreasoning',
  'kimik25thinking',
] as const;
