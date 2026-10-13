/** Contract tests for the vendored DeepSeek Messages SSE wire protocol. */

import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';

const VENDOR = join(import.meta.dirname, '../../..', 'vendor/deepseek-harness');
let parseSse: (body: ReadableStream<BufferSource>, activity: () => void) => AsyncIterable<Record<string, unknown>>;
let translate: (events: AsyncIterable<Record<string, unknown>>, model: string) => AsyncIterable<any>;
let EMPTY_RESPONSE_CODE: string;

beforeAll(async () => {
  const sseModule = await import(join(VENDOR, 'packages/llm/llm-deepseek/src/sse.ts'));
  parseSse = sseModule.parseSse;
  const translateModule = await import(join(VENDOR, 'packages/llm/llm-deepseek/src/translate.ts'));
  translate = translateModule.translate;
  const llmModule = await import(join(VENDOR, 'packages/llm/llm/src/index.ts'));
  EMPTY_RESPONSE_CODE = llmModule.EMPTY_RESPONSE_CODE;
});

const MODEL = 'deepseek-test-model';

function wireEvent(type: string, body: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`;
}

function byteStream(parts: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      const next = parts[index++];
      if (next) controller.enqueue(next);
      else controller.close();
    },
  });
}

function textStream(text: string): ReadableStream<Uint8Array> {
  return byteStream([new TextEncoder().encode(text)]);
}

async function* of(...events: Record<string, unknown>[]): AsyncGenerator<Record<string, unknown>> {
  yield* events;
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}

const started = (usage: Record<string, unknown> = {}) => ({ type: 'message_start', message: { usage } });
const blockStart = (index: number, content_block: Record<string, unknown>) => ({ type: 'content_block_start', index, content_block });
const delta = (index: number, value: Record<string, unknown>) => ({ type: 'content_block_delta', index, delta: value });
const blockStop = (index: number) => ({ type: 'content_block_stop', index });
const messageDelta = (stop_reason: string, usage: Record<string, unknown> = {}) => ({ type: 'message_delta', delta: { stop_reason }, usage });
const stopped = { type: 'message_stop' };

describe('DeepSeek Messages stream contract — SSE framing', () => {
  it('decodes UTF-8 split across byte boundaries and pulses activity for frames and heartbeat comments', async () => {
    const body = `: keepalive\n${wireEvent('message_start', { message: { usage: { input_tokens: 2 } } })}${wireEvent('extension-消息', {})}`;
    const unicodeBytes = new TextEncoder().encode(body);
    const unicodeSplit = unicodeBytes.findIndex((byte) => byte === 0xe6);
    const chunks = unicodeSplit > 0
      ? [unicodeBytes.subarray(0, unicodeSplit + 1), unicodeBytes.subarray(unicodeSplit + 1)]
      : [unicodeBytes];
    let activity = 0;
    const events = await collect(parseSse(byteStream(chunks), () => activity++));
    expect(events.map((event) => event.type)).toEqual(['message_start', 'extension-消息']);
    expect(activity).toBeGreaterThanOrEqual(3);
  });

  it('rejects malformed JSON and frame/data event type mismatches as provider failures', async () => {
    await expect(collect(parseSse(textStream('event: message_start\ndata: {bad json}\n\n'), () => {})))
      .rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    await expect(collect(parseSse(textStream('event: message_stop\ndata: {"type":"message_start"}\n\n'), () => {})))
      .rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });

  it('treats an in-band provider error frame as a server failure', async () => {
    const body = wireEvent('error', { error: { type: 'api_error', message: 'fixture unavailable' } });
    await expect(collect(parseSse(textStream(body), () => {}))).rejects.toMatchObject({ code: 'SERVER' });
  });

  it('ignores an incomplete trailing SSE frame instead of inventing a completed event', async () => {
    const body = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{}}}';
    const frames = await collect(parseSse(textStream(body), () => {}));
    expect(frames).toEqual([]);
  });
});

describe('DeepSeek Messages stream contract — translation', () => {
  it('preserves initial text, UTF-8 deltas, usage, stop reason, and replay model', async () => {
    const chunks = await collect(translate(of(
      started({ input_tokens: 10 }),
      blockStart(0, { type: 'text', text: 'Hola ' }),
      delta(0, { type: 'text_delta', text: 'mundo 世界' }),
      blockStop(0),
      messageDelta('end_turn', { output_tokens: 5 }),
      stopped,
    ), MODEL));

    expect(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text)).toEqual(['Hola ', 'mundo 世界']);
    expect(chunks.find((chunk) => chunk.type === 'block-end')?.block).toEqual({ type: 'text', text: 'Hola mundo 世界' });
    expect(chunks.find((chunk) => chunk.type === 'usage')?.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    expect(chunks.find((chunk) => chunk.type === 'finish')).toMatchObject({ reason: { kind: 'stop' }, replayState: { response: { model: MODEL } } });
    expect(chunks.at(-1)?.type).toBe('finish');
  });

  it('translates thinking and text blocks in arrival order', async () => {
    const chunks = await collect(translate(of(
      started(),
      blockStart(0, { type: 'thinking', thinking: 'razono', signature: 'sig-a' }),
      delta(0, { type: 'thinking_delta', thinking: ' en privado' }),
      delta(0, { type: 'signature_delta', signature: '-b' }),
      blockStop(0),
      blockStart(1, { type: 'text', text: 'respuesta' }),
      blockStop(1),
      messageDelta('stop_sequence'),
      stopped,
    ), MODEL));

    expect(chunks.filter((chunk) => chunk.type === 'block-start').map((chunk) => chunk.blockType)).toEqual(['reasoning', 'text']);
    expect(chunks.find((chunk) => chunk.type === 'block-end' && chunk.block.type === 'reasoning')?.block)
      .toMatchObject({ type: 'reasoning', text: 'razono en privado' });
    expect(chunks.find((chunk) => chunk.type === 'finish')?.reason.kind).toBe('stop');
  });

  it('emits the tool identity and completed JSON arguments, then maps tool_use to tool-calls', async () => {
    const chunks = await collect(translate(of(
      started(),
      blockStart(3, { type: 'tool_use', id: 'call_7', name: 'search', input: {} }),
      delta(3, { type: 'input_json_delta', partial_json: '{"q":"hello"}' }),
      blockStop(3),
      messageDelta('tool_use'),
      stopped,
    ), MODEL));

    expect(chunks.find((chunk) => chunk.type === 'tool-call-delta')).toMatchObject({ id: 'call_7', name: 'search', argumentsDelta: '' });
    expect(chunks.find((chunk) => chunk.type === 'block-end')?.block).toMatchObject({
      type: 'tool-call', id: 'call_7', name: 'search', arguments: '{"q":"hello"}',
    });
    expect(chunks.find((chunk) => chunk.type === 'finish')?.reason.kind).toBe('tool-calls');
  });

  it('maps max_tokens and reports an empty stop as EMPTY_RESPONSE', async () => {
    const truncated = await collect(translate(of(
      started(), blockStart(0, { type: 'text', text: 'partial' }), blockStop(0), messageDelta('max_tokens'), stopped,
    ), MODEL));
    expect(truncated.find((chunk) => chunk.type === 'finish')?.reason.kind).toBe('max-tokens');

    await expect(collect(translate(of(started(), messageDelta('end_turn'), stopped), MODEL)))
      .rejects.toMatchObject({ code: EMPTY_RESPONSE_CODE });
  });

  it('fails closed on invalid lifecycle ordering, unsupported blocks, stop reasons, usage, and tool JSON', async () => {
    await expect(collect(translate(of(blockStart(0, { type: 'text', text: '' })), MODEL)))
      .rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    await expect(collect(translate(of(started(), blockStart(0, { type: 'image', source: {} })), MODEL)))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' });
    await expect(collect(translate(of(started(), messageDelta('content_filter'), stopped), MODEL)))
      .rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    await expect(collect(translate(of(started(), messageDelta('end_turn', { output_tokens: -1 })), MODEL)))
      .rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    await expect(collect(translate(of(
      started(), blockStart(0, { type: 'tool_use', id: 'call_8', name: 'search', input: {} }),
      delta(0, { type: 'input_json_delta', partial_json: '{oops' }), blockStop(0), messageDelta('tool_use'), stopped,
    ), MODEL))).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });

  it('reports STREAM_CLOSED when a provider ends before message_stop', async () => {
    await expect(collect(translate(of(started()), MODEL))).rejects.toMatchObject({ code: 'STREAM_CLOSED' });
  });
});
