'use strict';

const http = require('http');
const { IncrementalSseParser, jsonHasUsefulContent } = require('./sse-parser');

const MAX_ERROR_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_PRECONTENT_BYTES = 256 * 1024;
const MAX_SSE_EVENT_BYTES = 1024 * 1024;
const CONNECTION_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'x-gateway-upstream-response', 'x-gateway-transport-failure']);

function classifyStatus(status, retryAfter, now = Date.now()) {
  if (status === 429) {
    let retryAfterMs = 0;
    if (retryAfter !== undefined && retryAfter !== null) {
      const value = String(retryAfter).trim();
      if (/^\d+(?:\.\d+)?$/.test(value)) retryAfterMs = Math.ceil(Number(value) * 1000);
      else {
        const date = Date.parse(value);
        if (Number.isFinite(date)) retryAfterMs = Math.max(0, date - now);
      }
    }
    return { outcome: 'quota', retryAfterMs: Math.max(0, retryAfterMs), status };
  }
  if (status === 401) return { outcome: 'client_error', status };
  if (status === 403) return { outcome: 'provider_rejected', status };
  if (status === 400 || status === 404 || status === 422) return { outcome: 'model_error', status };
  if (status === 408 || status === 425 || status === 502 || status === 503 || status === 504 || status >= 500) {
    return { outcome: 'transport_egress', status };
  }
  if (status >= 400) return { outcome: 'client_error', status };
  return { outcome: 'model_error', status: 502 };
}

function executeGatewayAttempt({
  clientReq,
  clientRes,
  route,
  attemptId,
  requestId,
  timeoutMs,
  streamIdleTimeoutMs = 120_000,
  streamMaxDurationMs = 600_000,
  signal,
  requestPayload,
  requestPath = '/v1/chat/completions',
  structuredResponse = false,
  headers,
  port,
  onFirstContent
}) {
  return new Promise(resolve => {
    let settled = false;
    let committed = false;
    let firstTimer = null;
    let streamIdleTimer = null;
    let streamMaxTimer = null;
    let upstreamReq;
    let upstreamRes;
    let upstreamResponded = false;
    let transportFailure = false;

    const clearTimers = () => {
      if (firstTimer) clearTimeout(firstTimer);
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      if (streamMaxTimer) clearTimeout(streamMaxTimer);
      firstTimer = streamIdleTimer = streamMaxTimer = null;
    };
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimers();
      signal?.removeEventListener('abort', onAbort);
      clientRes.removeListener('close', onClientClose);
      resolve({ ...result, upstreamResponded, transportFailure, committed, attemptId, requestId, route });
    };
    const failCommittedStream = detail => {
      try { upstreamReq?.destroy(); } catch {}
      try { upstreamRes?.destroy(); } catch {}
      if (clientRes.destroyed) return finish({ outcome: 'stream_error', status: 502, detail, committed: true });
      try { clientRes.destroy(); } catch {}
      finish({ outcome: 'stream_error', status: 502, detail, committed: true });
    };
    const onAbort = () => {
      try { upstreamReq?.destroy(); } catch {}
      try { upstreamRes?.destroy(); } catch {}
      finish({ outcome: 'cancelled', status: 499 });
    };
    const onClientClose = () => {
      if (clientRes.writableFinished || settled) return;
      try { upstreamReq?.destroy(); } catch {}
      try { upstreamRes?.destroy(); } catch {}
      finish({ outcome: 'cancelled', status: 499 });
    };
    const abortAttempt = (outcome, detail) => {
      try { upstreamReq?.destroy(); } catch {}
      try { upstreamRes?.destroy(); } catch {}
      if (committed) failCommittedStream(detail || outcome);
      else finish({ outcome, status: outcome === 'slow' ? 504 : 502, detail });
    };

    if (signal?.aborted) return finish({ outcome: 'cancelled', status: 499 });
    signal?.addEventListener('abort', onAbort, { once: true });
    clientRes.once('close', onClientClose);
    firstTimer = setTimeout(() => abortAttempt('slow', 'first_content_timeout'), timeoutMs);

    try {
      upstreamReq = http.request({
        hostname: '127.0.0.1',
        port,
        path: requestPath,
        method: 'POST',
        headers: { ...headers, 'x-request-id': requestId, 'x-attempt-id': attemptId }
      }, response => {
        upstreamRes = response;
        upstreamResponded = response.headers['x-gateway-upstream-response'] === '1';
        transportFailure = response.headers['x-gateway-transport-failure'] === '1';
        if (response.statusCode !== 200) {
          const chunks = [];
          let size = 0;
          response.on('data', chunk => {
            if (size < MAX_ERROR_BYTES) {
              const kept = chunk.subarray(0, MAX_ERROR_BYTES - size);
              chunks.push(kept);
              size += kept.length;
            }
          });
          response.on('end', () => {
            if (settled) return;
            const body = Buffer.concat(chunks);
            const bodyText = body.toString('utf8');
            const emptyPool = /(?:no healthy anonymous proxies available|all proxies are unavailable)/i.test(bodyText);
            const result = emptyPool
              ? { outcome: 'local_unavailable', status: 503 }
              : classifyStatus(response.statusCode || 502, response.headers['retry-after']);
            finish({ ...result, headers: response.headers, body, retryAfter: response.headers['retry-after'] });
          });
          response.on('error', error => {
            if (settled) return;
            finish({ outcome: 'transport_egress', status: response.statusCode || 502, detail: error.code || error.message });
          });
          response.on('aborted', () => {
            if (settled) return;
            finish({ outcome: 'transport_egress', status: response.statusCode || 502, detail: 'upstream_error_body_aborted' });
          });
          return;
        }

        const cleanHeaders = {};
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined && !CONNECTION_HEADERS.has(name.toLowerCase())) cleanHeaders[name] = value;
        }
        cleanHeaders['x-egress-route'] = route === 'pool' ? 'proxy' : route;
        cleanHeaders['x-request-id'] = requestId;

        const resetStreamIdle = () => {
          if (streamIdleTimer) clearTimeout(streamIdleTimer);
          streamIdleTimer = setTimeout(() => abortAttempt('stream_error', 'stream_inactivity_timeout'), streamIdleTimeoutMs);
        };
        const commitHeaders = (streaming, bodyLength) => {
          if (committed) return;
          committed = true;
          clearTimeout(firstTimer);
          firstTimer = null;
          onFirstContent?.();
          const outputHeaders = { ...cleanHeaders };
          if (streaming) {
            delete outputHeaders['content-length'];
            delete outputHeaders['content-encoding'];
          } else {
            outputHeaders['content-length'] = bodyLength;
            delete outputHeaders['transfer-encoding'];
            delete outputHeaders['content-encoding'];
          }
          clientRes.writeHead(200, outputHeaders);
          streamMaxTimer = setTimeout(() => abortAttempt('stream_error', 'stream_max_duration'), streamMaxDurationMs);
        };
        const writeBody = chunk => {
          if (!chunk?.length || settled) return;
          resetStreamIdle();
          if (!clientRes.write(chunk)) {
            response.pause();
            clientRes.once('drain', () => { if (!settled) response.resume(); });
          }
        };
        const endSuccessfulResponse = () => {
          clearTimers();
          if (clientRes.destroyed) return finish({ outcome: 'cancelled', status: 499 });
          if (!clientRes.writableEnded) clientRes.end();
          if (clientRes.writableFinished) finish({ outcome: 'success', status: 200 });
          else clientRes.once('finish', () => finish({ outcome: 'success', status: 200 }));
        };
        const failBeforeContent = (detail, body = Buffer.alloc(0)) => {
          finish({ outcome: 'model_error', status: 502, detail, headers: response.headers, body });
        };
        const isSse = String(response.headers['content-type'] || '').toLowerCase().includes('text/event-stream');

        if (isSse) {
          const parser = new IncrementalSseParser({ maxEventBytes: MAX_SSE_EVENT_BYTES });
          let heldEvents = [];
          let heldBytes = 0;
          let sawTerminalEvent = false;
          response.on('data', chunk => {
            if (settled || !chunk.length) return;
            const wasCommitted = committed;
            let events;
            try { events = parser.feed(chunk); }
            catch (error) {
              if (committed) failCommittedStream(error.message);
              else failBeforeContent(error.message);
              return;
            }
            if (events.some(event => event.terminal)) sawTerminalEvent = true;

            if (wasCommitted) {
              if (events.some(event => event.eventError)) {
                failCommittedStream('upstream_sse_error_after_content');
                return;
              }
              writeBody(chunk);
              return;
            }
            if (parser.pending.length + heldBytes > MAX_PRECONTENT_BYTES) {
              failBeforeContent('pre_content_buffer_limit');
              return;
            }

            let usefulIndex = -1;
            for (let i = 0; i < events.length; i++) {
              const event = events[i];
              if (event.eventError) {
                failBeforeContent('upstream_sse_error', Buffer.from(event.dataText || event.event, 'utf8'));
                return;
              }
              if (event.useful) {
                if (heldBytes + event.raw.length > MAX_PRECONTENT_BYTES) {
                  failBeforeContent('pre_content_buffer_limit');
                  return;
                }
                usefulIndex = i;
                commitHeaders(true);
                writeBody(Buffer.concat([...heldEvents, event.raw]));
                heldEvents = [];
                heldBytes = 0;
                break;
              }
              if (!event.comment && event.dataText && event.dataText !== '[DONE]') {
                heldEvents.push(event.raw);
                heldBytes += event.raw.length;
              }
              if (heldBytes + parser.pending.length > MAX_PRECONTENT_BYTES) {
                failBeforeContent('pre_content_buffer_limit');
                return;
              }
            }
            if (usefulIndex >= 0) {
              const following = events.slice(usefulIndex + 1);
              if (following.some(event => event.eventError)) {
                failCommittedStream('upstream_sse_error_after_content');
                return;
              }
              const tail = [ ...following.map(event => event.raw), parser.pending ];
              writeBody(Buffer.concat(tail.filter(part => part?.length)));
            } else if (heldBytes + parser.pending.length > MAX_PRECONTENT_BYTES) {
              failBeforeContent('pre_content_buffer_limit');
            }
          });
          response.on('end', () => {
            if (settled) return;
            const end = parser.finish();
            if (!committed) {
              failBeforeContent(end.incomplete ? 'incomplete_sse_before_content' : 'empty_sse_response');
              return;
            }
            if (end.incomplete) {
              failCommittedStream('incomplete_sse_event');
              return;
            }
            if (!sawTerminalEvent) {
              failCommittedStream('missing_stream_termination');
              return;
            }
            endSuccessfulResponse();
          });
          response.on('error', error => {
            if (settled) return;
            if (committed) failCommittedStream(error.code || error.message);
            else finish({ outcome: 'transport_egress', status: 502, detail: error.code || error.message });
          });
          response.on('aborted', () => {
            if (settled) return;
            if (committed) failCommittedStream('upstream_stream_aborted');
            else finish({ outcome: 'transport_egress', status: 502, detail: 'upstream_response_aborted' });
          });
          return;
        }

        const bodyChunks = [];
        let bodySize = 0;
        response.on('data', chunk => {
          if (settled) return;
          bodySize += chunk.length;
          if (bodySize > MAX_RESPONSE_BYTES) {
            abortAttempt('model_error', 'upstream_response_too_large');
            return;
          }
          bodyChunks.push(chunk);
        });
        response.on('end', () => {
          if (settled) return;
          const body = Buffer.concat(bodyChunks);
          let parsed;
          try { parsed = JSON.parse(body.toString('utf8')); }
          catch { failBeforeContent(body.length ? 'invalid_json_completion' : 'empty_upstream_response', body); return; }
          if (!jsonHasUsefulContent(parsed, { structuredResponse: structuredResponse || requestPath === '/v1/systemone' })) {
            failBeforeContent('completion_contains_no_useful_content', body);
            return;
          }
          commitHeaders(false, body.length);
          writeBody(body);
          endSuccessfulResponse();
        });
        response.on('error', error => {
          if (settled) return;
          finish({ outcome: 'transport_egress', status: 502, detail: error.code || error.message });
        });
        response.on('aborted', () => {
          if (settled) return;
          finish({ outcome: 'transport_egress', status: 502, detail: 'upstream_response_aborted' });
        });
      });
      upstreamReq.on('error', error => {
        if (settled) return;
        finish({ outcome: 'transport_local', status: 502, detail: error.code || error.message });
      });
      upstreamReq.end(requestPayload);
    } catch (error) {
      finish({ outcome: 'transport_local', status: 502, detail: error.code || error.message });
    }
  });
}

module.exports = { executeGatewayAttempt, classifyStatus };
