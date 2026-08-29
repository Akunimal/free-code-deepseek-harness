# Finally, a FREE & No Authentication Perplexity AI API

An OpenAI-compatible API server that proxies requests through Perplexity AI. Any application or library that supports the OpenAI API format can connect to this server and use Perplexity's models without modification.

Built in Rust using Axum (just because) and curl-impersonate for TLS fingerprinting.

## Features

- **OpenAI API compatibility** -- works with any OpenAI SDK or client out of the box
- **Real-time streaming** -- true server-sent events, not buffered chunking
- **Image uploads** -- send images via URL or base64 data URI in the `image_url` content type
- **Multiple models** -- access to GPT-5.2, Claude Sonnet 4.5, Claude Opus 4.6, Gemini 3, Grok 4.1, Kimi K2.5, and Sonar
- **API key authentication** -- optional Bearer token auth to secure your instance
- **No Perplexity account required** -- works anonymously for basic queries; add a session cookie for Pro features

## Requirements

- Linux (x86_64)
- Rust 1.70+

The `curl-impersonate` binary is included in the `curl/` directory.

## Setup

```bash
cp .env.example .env
```

Edit `.env` to configure:

```env
# Required: secures your API server
API_KEY=sk-your-secret-key-here

# Optional: Perplexity session cookie for authenticated access
# Without this, requests are made anonymously (still functional)
PERPLEXITY_COOKIE=""

# Optional: server port (default: 3030)
PORT=3030
```

### Getting a Perplexity cookie (optional)

A session cookie is only needed if you want authenticated access (Pro models, higher rate limits, image uploads on a free account). To get one:

1. Open [perplexity.ai](https://www.perplexity.ai) in your browser and log in
2. Open DevTools (F12) and go to the Network tab
3. Send any query on Perplexity
4. Find a request to `perplexity.ai` and copy the `Cookie` header value
5. Paste the full string into `PERPLEXITY_COOKIE` in your `.env`

OR

use a extension and output as a raw header string.

Without a cookie, the server runs in anonymous mode. Basic text queries still work. Image uploads require at minimum a free account cookie.

## Build and Run

```bash
cargo build --release
cargo run --release
```

The server starts on `http://localhost:3030` (or whatever `PORT` is set to).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/v1/chat/completions` | Chat completions |
| GET | `/v1/models` | List available models |
| GET | `/v1/models/{model}` | Get model details |

## Available Models

| Model ID | Name |
|----------|------|
| `experimental` | Sonar |
| `gemini30flash` | Gemini 3 Flash |
| `gemini30pro` | Gemini 3 Pro |
| `gpt52` | GPT-5.2 |
| `claude45sonnet` | Claude Sonnet 4.5 |
| `claude45sonnetthinking` | Claude Sonnet 4.5 (Thinking) |
| `claude46opus` | Claude Opus 4.6 |
| `grok41nonreasoning` | Grok 4.1 |
| `kimik25thinking` | Kimi K2.5 |

## Usage

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3030/v1",
    api_key="sk-your-secret-key-here"
)

response = client.chat.completions.create(
    model="gpt52",
    messages=[{"role": "user", "content": "What is quantum computing?"}]
)

print(response.choices[0].message.content)
```

### Streaming

```python
stream = client.chat.completions.create(
    model="gpt52",
    messages=[{"role": "user", "content": "Explain general relativity"}],
    stream=True
)

for chunk in stream:
    content = chunk.choices[0].delta.content
    if content:
        print(content, end="", flush=True)
```

### Image Input

```python
response = client.chat.completions.create(
    model="gpt52",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe this image"},
            {"type": "image_url", "image_url": {"url": "https://example.com/photo.jpg"}}
        ]
    }]
)
```

Base64 data URIs are also supported in the `url` field.

### curl

```bash
curl http://localhost:3030/v1/chat/completions \
  -H "Authorization: Bearer sk-your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt52",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Multi-turn Conversations

The API is stateless, following the OpenAI convention. The client maintains conversation history by including all previous messages in each request:

```python
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is Rust?"}
]

r1 = client.chat.completions.create(model="gpt52", messages=messages)
messages.append({"role": "assistant", "content": r1.choices[0].message.content})
messages.append({"role": "user", "content": "Show me a hello world example"})

r2 = client.chat.completions.create(model="gpt52", messages=messages)
```

## Project Structure

```
src/
  main.rs             -- server setup, routing, auth middleware
  openai_compat.rs    -- OpenAI API translation layer
  perplexity.rs       -- Perplexity client, curl-impersonate integration
  routes.rs           -- health check endpoint
curl/
  curl-impersonate    -- patched curl binary with browser TLS fingerprinting
  curl_chrome116      -- Chrome 116 wrapper script
.env.example          -- configuration template
Cargo.toml            -- dependencies
```

## License

MIT
