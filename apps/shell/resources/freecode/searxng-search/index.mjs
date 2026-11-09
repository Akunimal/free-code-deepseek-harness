/**
 * SearXNG-backed WebSearchProvider for ctx.web. Mounted by the FreeCode shell from
 * a file URL, so it must stay one file with no bare imports: packages inside the
 * DSH runtime do not resolve from here. Errors carry the seam's `code` values.
 */

export const name = 'web-search-searxng'
export const inject = ['web']
export const SEARXNG_PROVIDER_ID = 'searxng'
export const DEFAULT_TIMEOUT_MS = 15000

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

function webError(message, code, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause })
  error.name = 'WebError'
  error.code = code
  return error
}

/** Plain HTTP only for loopback, and never embedded credentials. */
export function isAllowedBaseUrl(value) {
  if (typeof value !== 'string' || !URL.canParse(value)) return false
  const url = new URL(value)
  if (url.username !== '' || url.password !== '') return false
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
}

function isHttpUrl(value) {
  if (typeof value !== 'string' || !URL.canParse(value)) return false
  const { protocol } = new URL(value)
  return protocol === 'http:' || protocol === 'https:'
}

function mapResult(result) {
  if (result === null || typeof result !== 'object' || !isHttpUrl(result.url)) return undefined
  const title = typeof result.title === 'string' ? result.title.trim() : ''
  const snippet = typeof result.content === 'string' ? result.content.trim() : ''
  const published = typeof result.publishedDate === 'string' ? result.publishedDate : ''
  return {
    url: result.url,
    ...title.length > 0 ? { title } : {},
    ...snippet.length > 0 ? { snippet } : {},
    ...published.length > 0 ? { publishedAt: published } : {},
  }
}

/** Map a SearXNG JSON body. No results with failed engines is an error, not "nothing". */
export function mapResponse(payload) {
  const raw = Array.isArray(payload?.results) ? payload.results : []
  const seen = new Set()
  const sources = []
  for (const entry of raw) {
    const source = mapResult(entry)
    if (source === undefined || seen.has(source.url)) continue
    seen.add(source.url)
    sources.push(source)
  }
  const failed = Array.isArray(payload?.unresponsive_engines) ? payload.unresponsive_engines : []
  if (sources.length === 0 && failed.length > 0) {
    const names = failed.map(item => (Array.isArray(item) ? item[0] : String(item))).join(', ')
    throw webError(`SearXNG returned no results; engines failed: ${names}`, 'WEB_PROVIDER_ERROR')
  }
  return { sources, truncated: false }
}

export class SearxngSearchProvider {
  id = SEARXNG_PROVIDER_ID

  constructor(options = {}) {
    this.baseURL = String(options.baseURL ?? '').replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  available() {
    return isAllowedBaseUrl(this.baseURL) && Number.isInteger(this.timeoutMs) && this.timeoutMs > 0
  }

  async search(request, signal) {
    const url = new URL(`${this.baseURL}/search`)
    url.searchParams.set('q', request.query)
    url.searchParams.set('format', 'json')
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const aborted = cause => webError('SearXNG search aborted', 'WEB_ABORTED', cause)

    let response
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json', 'user-agent': 'freecode-searxng/1' },
        signal: combined,
      })
    } catch (error) {
      if (signal?.aborted) throw aborted(error)
      throw webError(
        'The local search service is not reachable. It may still be starting; retry shortly. If it persists, restart FreeCode and check its log.',
        'WEB_PROVIDER_ERROR',
        error,
      )
    }

    if (!response.ok) {
      throw webError(`SearXNG error (HTTP ${response.status}).`, 'WEB_PROVIDER_ERROR')
    }

    let payload
    try {
      payload = await response.json()
    } catch (error) {
      if (signal?.aborted) throw aborted(error)
      throw webError(`SearXNG returned an unreadable body: ${String(error)}`, 'WEB_PROVIDER_ERROR', error)
    }
    return mapResponse(payload)
  }
}

export function apply(ctx, config = {}) {
  ctx.web.registerSearchProvider(new SearxngSearchProvider(config))
}
