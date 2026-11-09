import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SearxngSearchProvider,
  apply,
  isAllowedBaseUrl,
  mapResponse,
} from '../apps/shell/resources/freecode/searxng-search/index.mjs'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function stubFetch(handler) {
  const calls = []
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init })
    return handler(String(input), init)
  }
  return calls
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('mapResponse', () => {
  it('maps url, title, content and publishedDate', () => {
    const result = mapResponse({
      results: [{
        url: 'https://nodejs.org/en/about/releases',
        title: '  Node.js Releases ',
        content: ' Long Term Support ',
        publishedDate: '2026-01-02T00:00:00',
      }],
    })
    assert.deepEqual(result, {
      sources: [{
        url: 'https://nodejs.org/en/about/releases',
        title: 'Node.js Releases',
        snippet: 'Long Term Support',
        publishedAt: '2026-01-02T00:00:00',
      }],
      truncated: false,
    })
  })

  it('omits blank optional fields and keeps URL-only results', () => {
    const result = mapResponse({
      results: [{ url: 'https://example.com/a', title: '   ', content: '', publishedDate: null }],
    })
    assert.deepEqual(result.sources, [{ url: 'https://example.com/a' }])
  })

  it('drops duplicate URLs and non-HTTP URLs', () => {
    const result = mapResponse({
      results: [
        { url: 'https://example.com/a', title: 'first' },
        { url: 'https://example.com/a', title: 'second' },
        { url: 'javascript:alert(1)', title: 'bad' },
      ],
    })
    assert.deepEqual(result.sources.map(source => source.url), ['https://example.com/a'])
    assert.equal(result.sources[0].title, 'first')
  })

  it('throws WEB_PROVIDER_ERROR on no results with failed engines, and returns empty when none failed', () => {
    assert.throws(
      () => mapResponse({ results: [], unresponsive_engines: [['duckduckgo', 'CAPTCHA']] }),
      error => error.code === 'WEB_PROVIDER_ERROR' && /duckduckgo/.test(error.message),
    )
    assert.deepEqual(mapResponse({ results: [], unresponsive_engines: [] }), { sources: [], truncated: false })
  })
})

describe('isAllowedBaseUrl', () => {
  it('accepts loopback http and https, rejects remote http, credentials and non-URLs', () => {
    assert.equal(isAllowedBaseUrl('http://127.0.0.1:8888'), true)
    assert.equal(isAllowedBaseUrl('http://localhost:8888'), true)
    assert.equal(isAllowedBaseUrl('https://search.example.com'), true)
    assert.equal(isAllowedBaseUrl('http://search.example.com'), false)
    assert.equal(isAllowedBaseUrl('https://user:pw@example.com'), false)
    assert.equal(isAllowedBaseUrl('not a url'), false)
  })
})

describe('SearxngSearchProvider.search', () => {
  it('sends GET to <base>/search with q, format and redirect error, trailing slash tolerated', async () => {
    const calls = stubFetch(() => jsonResponse({ results: [{ url: 'https://example.com/a' }] }))
    const provider = new SearxngSearchProvider({ baseURL: 'http://127.0.0.1:8888/' })
    const result = await provider.search({ query: 'typescript handbook' })
    assert.equal(result.sources.length, 1)
    assert.equal(calls.length, 1)
    const url = new URL(calls[0].url)
    assert.equal(url.origin + url.pathname, 'http://127.0.0.1:8888/search')
    assert.equal(url.searchParams.get('q'), 'typescript handbook')
    assert.equal(url.searchParams.get('format'), 'json')
    assert.equal(calls[0].init.method, 'GET')
    assert.equal(calls[0].init.redirect, 'error')
  })

  it('maps a network failure to WEB_PROVIDER_ERROR with the not-reachable message', async () => {
    stubFetch(() => { throw new TypeError('fetch failed') })
    const provider = new SearxngSearchProvider({ baseURL: 'http://127.0.0.1:8888' })
    await assert.rejects(
      provider.search({ query: 'x' }),
      error => error.code === 'WEB_PROVIDER_ERROR' && /not reachable/.test(error.message),
    )
  })

  it('maps HTTP 403 and 500 to WEB_PROVIDER_ERROR', async () => {
    for (const status of [403, 500]) {
      stubFetch(() => new Response('nope', { status }))
      const provider = new SearxngSearchProvider({ baseURL: 'http://127.0.0.1:8888' })
      await assert.rejects(provider.search({ query: 'x' }), error => error.code === 'WEB_PROVIDER_ERROR')
    }
  })

  it('maps an already aborted caller signal to WEB_ABORTED', async () => {
    stubFetch((_url, init) => {
      if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return jsonResponse({ results: [] })
    })
    const provider = new SearxngSearchProvider({ baseURL: 'http://127.0.0.1:8888' })
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(provider.search({ query: 'x' }, controller.signal), error => error.code === 'WEB_ABORTED')
  })
})

describe('apply and available', () => {
  it('registers a provider with id searxng on ctx.web', () => {
    const registered = []
    const ctx = { web: { registerSearchProvider: provider => registered.push(provider) } }
    apply(ctx, { baseURL: 'http://127.0.0.1:8888' })
    assert.equal(registered.length, 1)
    assert.equal(registered[0].id, 'searxng')
    assert.equal(registered[0].available(), true)
  })

  it('is not available without a baseURL', () => {
    assert.equal(new SearxngSearchProvider({}).available(), false)
  })
})
