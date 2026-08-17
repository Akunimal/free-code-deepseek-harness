// Fake OpenAI-compatible worker for LB contract tests.
// Prints "READY 127.0.0.1:<port>" then serves /v1/models + SSE chat completions.
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'fake-model' }, { id: 'fake-model-2' }] }));
    return;
  }
  if (req.url === '/v1/chat/completions') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"hel"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n');
    res.end('data: [DONE]\n\n');
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  const port = addr && typeof addr !== 'string' ? addr.port : 0;
  console.log(`READY 127.0.0.1:${port}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));