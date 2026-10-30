'use strict';

const USEFUL_FIELDS = new Set([
  'content', 'text', 'output_text', 'reasoning', 'reasoning_content', 'analysis',
  'refusal', 'arguments', 'delta', 'partial_json', 'thinking'
]);

function isUsefulValue(value, key = '') {
  if (typeof value === 'string') return USEFUL_FIELDS.has(key) && value.trim().length > 0;
  if (Array.isArray(value)) return value.some(item => isUsefulValue(item, key));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([childKey, child]) => isUsefulValue(child, childKey));
}

function isErrorValue(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.error || value.type === 'error') return true;
  if (value.response && typeof value.response === 'object' && value.response.error) return true;
  return false;
}

function parseSseEvent(raw) {
  const text = raw.toString('utf8');
  const lines = text.split(/\r\n|\r|\n/);
  let event = 'message';
  const data = [];
  let comment = false;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith(':')) { comment = true; continue; }
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  const dataText = data.join('\n');
  let json = null;
  if (dataText && dataText !== '[DONE]') {
    try { json = JSON.parse(dataText); } catch {}
  }
  const type = json?.type || event;
  const errorEvent = /(?:^|[._-])(?:error|failed|incomplete)(?:$|[._-])/i;
  const eventError = errorEvent.test(event) || errorEvent.test(type) || isErrorValue(json);
  const terminal = !eventError && (dataText === '[DONE]' ||
    ['message_stop', 'response.completed', 'response.done', 'done'].includes(type) ||
    json?.choices?.some(choice => typeof choice.finish_reason === 'string' && choice.finish_reason.length > 0));
  const useful = !eventError && dataText !== '[DONE]' && isUsefulValue(json);
  return { raw, event, dataText, json, comment, eventError, useful, terminal: !!terminal };
}

function findEventBoundary(buffer) {
  const text = buffer.toString('latin1');
  const candidates = [
    ['\r\n\r\n', 4],
    ['\n\n', 2],
    ['\r\r', 2]
  ].map(([separator, length]) => ({ index: text.indexOf(separator), length }))
    .filter(candidate => candidate.index >= 0)
    .sort((a, b) => a.index - b.index);
  return candidates[0] || null;
}

class IncrementalSseParser {
  constructor({ maxEventBytes = 1024 * 1024 } = {}) {
    this.maxEventBytes = maxEventBytes;
    this.pending = Buffer.alloc(0);
  }

  feed(chunk) {
    if (chunk?.length) this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : Buffer.from(chunk);
    const events = [];
    while (true) {
      const boundary = findEventBoundary(this.pending);
      if (!boundary) break;
      const length = boundary.index + boundary.length;
      if (length > this.maxEventBytes) throw new Error('SSE event exceeded the configured size limit');
      const raw = this.pending.subarray(0, length);
      this.pending = this.pending.subarray(length);
      events.push(parseSseEvent(raw));
    }
    if (this.pending.length > this.maxEventBytes) throw new Error('SSE event exceeded the configured size limit');
    return events;
  }

  finish() {
    return { incomplete: this.pending.length > 0, pendingBytes: this.pending.length };
  }
}

function jsonHasUsefulContent(payload, { structuredResponse = false } = {}) {
  if (!payload || typeof payload !== 'object' || isErrorValue(payload)) return false;
  // System One carries an opaque typed answer document, including false/zero
  // answers; it does not share the text-message schema. Validate the complete
  // nonempty JSON object without interpreting or rewriting its typed values.
  if (structuredResponse) {
    const hasAnswer = value => typeof value === 'boolean' || typeof value === 'number' ||
      (typeof value === 'string' ? value.trim().length > 0 :
        !!value && typeof value === 'object' && Object.values(value).some(hasAnswer));
    return !Array.isArray(payload) && hasAnswer(payload);
  }
  if (Array.isArray(payload.choices) && payload.choices.length) {
    if (payload.choices.some(choice => isUsefulValue(choice?.delta) || isUsefulValue(choice?.message) || isUsefulValue(choice?.text, 'text'))) {
      return true;
    }
  }
  return isUsefulValue(payload);
}

module.exports = { IncrementalSseParser, parseSseEvent, jsonHasUsefulContent, isUsefulValue, isErrorValue };
