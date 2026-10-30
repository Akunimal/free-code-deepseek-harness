'use strict';

const assert = require('node:assert/strict');
const { IncrementalSseParser, parseSseEvent, jsonHasUsefulContent } = require('./sse-parser');

function testFragmentedUtf8AndFraming() {
  const source = Buffer.from('data: {"choices":[{"delta":{"content":"ñandú 🙂"}}]}\r\n\r\n', 'utf8');
  const split = source.indexOf(Buffer.from('🙂')) + 2;
  const parser = new IncrementalSseParser();
  assert.deepEqual(parser.feed(source.subarray(0, split)), []);
  const events = parser.feed(source.subarray(split));
  assert.equal(events.length, 1);
  assert.equal(events[0].json.choices[0].delta.content, 'ñandú 🙂');
  assert.equal(events[0].useful, true);
  assert.equal(parser.finish().incomplete, false);
  console.log('PASS incremental SSE framing preserves split UTF-8');
}

function testKeepaliveEmptyAndPrefixEvents() {
  const parser = new IncrementalSseParser();
  const events = parser.feed(Buffer.from(': keep-alive\n\ndata:\n\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'));
  assert.equal(events.length, 3);
  assert.equal(events[0].comment, true);
  assert.equal(events[0].useful, false);
  assert.equal(events[1].useful, false);
  assert.equal(events[2].useful, false);
  assert.equal(parseSseEvent(Buffer.from('data: [DONE]\n\n')).useful, false);
  assert.equal(parseSseEvent(Buffer.from('data: [DONE]\n\n')).terminal, true);
  console.log('PASS comments, empty events, role prefixes, and DONE are not useful content');
}

function testContentKindsAndErrors() {
  const reasoning = parseSseEvent(Buffer.from('data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n'));
  const tool = parseSseEvent(Buffer.from('data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\"q\\":1}"}}]}}]}\n\n'));
  const error = parseSseEvent(Buffer.from('event: error\ndata: {"error":{"message":"denied"}}\n\n'));
  assert.equal(reasoning.useful, true);
  assert.equal(tool.useful, true);
  assert.equal(error.eventError, true);
  assert.equal(jsonHasUsefulContent({ choices: [{ message: { content: 'answer' } }] }), true);
  assert.equal(jsonHasUsefulContent({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }), false);
  assert.equal(jsonHasUsefulContent({ error: { message: 'denied' } }), false);
  assert.equal(jsonHasUsefulContent({ answers: { arithmetic: false, count: 0 } }, { structuredResponse: true }), true);
  assert.equal(jsonHasUsefulContent({}, { structuredResponse: true }), false);
  assert.equal(jsonHasUsefulContent({ answers: {} }, { structuredResponse: true }), false);
  assert.equal(jsonHasUsefulContent({ answers: [] }, { structuredResponse: true }), false);
  assert.equal(jsonHasUsefulContent({ error: { message: 'denied' } }, { structuredResponse: true }), false);
  assert.equal(parseSseEvent(Buffer.from('event: message_stop\ndata: {"type":"message_stop"}\n\n')).terminal, true);
  assert.equal(parseSseEvent(Buffer.from('event: response.completed\ndata: {"type":"response.completed"}\n\n')).terminal, true);
  assert.equal(parseSseEvent(Buffer.from('event: response.incomplete\ndata: {"type":"response.incomplete"}\n\n')).eventError, true);
  assert.equal(parseSseEvent(Buffer.from('data: {"delta":{"partial_json":"{\\"q\\":"}}\n\n')).useful, true);
  console.log('PASS reasoning/tool content is useful and error/empty completions are rejected');
}

function testEventBound() {
  const parser = new IncrementalSseParser({ maxEventBytes: 16 });
  assert.throws(() => parser.feed(Buffer.from('data: 12345678901234567890')), /size limit/);
  console.log('PASS incomplete SSE event buffer is bounded');
}

testFragmentedUtf8AndFraming();
testKeepaliveEmptyAndPrefixEvents();
testContentKindsAndErrors();
testEventBound();
