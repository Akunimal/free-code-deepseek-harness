import { BrowserWindow, session } from 'electron'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

const DEFAULT_URL = 'about:blank'
const TOKEN_HEADER = 'x-freecode-browser-token'
type Action = 'status' | 'navigate' | 'snapshot' | 'click' | 'type' | 'key' | 'scroll' | 'back' | 'forward' | 'reload' | 'screenshot'
interface Request { action: Action; url?: string; ref?: number; text?: string; key?: string; deltaX?: number; deltaY?: number }
interface State { url?: string }
export interface EmbeddedBrowser { endpoint: string; token: string; show(): Promise<void>; hide(): void; toggle(): Promise<void>; close(): Promise<void> }

function allowedUrl(value: string): boolean {
  if (value === DEFAULT_URL) return true
  try { const protocol = new URL(value).protocol; return protocol === 'http:' || protocol === 'https:' } catch { return false }
}
function reply(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}
async function readRequest(req: IncomingMessage): Promise<Request> {
  let body = ''
  for await (const chunk of req) body += String(chunk)
  if (body.length > 32768) throw new Error('browser request is too large')
  return JSON.parse(body) as Request
}

/** Visible Chromium with a durable profile and a small authenticated computer-use bridge. */
export async function createEmbeddedBrowser(userDataDir: string): Promise<EmbeddedBrowser> {
  const dataDir = join(userDataDir, 'browser-data')
  const stateFile = join(userDataDir, 'browser-state.json')
  mkdirSync(dataDir, { recursive: true })
  const browserSession = session.fromPath(dataDir)
  const token = randomBytes(32).toString('hex')
  let state: State = {}
  if (existsSync(stateFile)) {
    try { state = JSON.parse(readFileSync(stateFile, 'utf8')) as State } catch { state = {} }
  }
  let win: BrowserWindow | null = null
  let url = allowedUrl(state.url ?? '') ? (state.url ?? DEFAULT_URL) : DEFAULT_URL
  const save = (): void => { try { writeFileSync(stateFile, JSON.stringify({ url }, null, 2)) } catch {} }
  const ensureWindow = (): BrowserWindow => {
    if (win && !win.isDestroyed()) return win
    win = new BrowserWindow({
      width: 1200, height: 820, title: 'FreeCode Embedded Browser', show: false,
      webPreferences: { session: browserSession, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
    })
    win.webContents.setWindowOpenHandler(({ url: target }) => {
      if (allowedUrl(target)) void win?.loadURL(target)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event, target) => { if (!allowedUrl(target)) event.preventDefault() })
    win.webContents.on('did-navigate', (_event, target) => { url = target; save() })
    win.webContents.on('did-navigate-in-page', (_event, target) => { url = target; save() })
    win.on('closed', () => { save(); win = null })
    void win.loadURL(url)
    return win
  }
  const interactiveSelector = 'a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]'
  const rpc = async (request: Request): Promise<unknown> => {
    const browser = ensureWindow()
    const contents = browser.webContents
    if (request.action === 'status') return { visible: browser.isVisible(), url: contents.getURL() || url, title: contents.getTitle() }
    if (request.action === 'navigate') {
      if (typeof request.url !== 'string' || !allowedUrl(request.url)) throw new Error('only http(s) URLs are allowed')
      await browser.loadURL(request.url)
      return { url: contents.getURL() || request.url }
    }
    if (request.action === 'back') { if (contents.canGoBack()) contents.goBack(); return { url: contents.getURL() } }
    if (request.action === 'forward') { if (contents.canGoForward()) contents.goForward(); return { url: contents.getURL() } }
    if (request.action === 'reload') { await contents.reload(); return { url: contents.getURL() } }
    if (request.action === 'snapshot') {
      const script = '(() => { const nodes = [...document.querySelectorAll(' + JSON.stringify(interactiveSelector) + ')]; return {title: document.title, url: location.href, elements: nodes.slice(0, 200).map((el, ref) => ({ref, tag: el.tagName.toLowerCase(), role: el.getAttribute("role"), text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 240), value: "value" in el ? String(el.value).slice(0, 240) : undefined}))}; })()'
      return contents.executeJavaScript(script)
    }
    if (request.action === 'click' || request.action === 'type') {
      if (!Number.isInteger(request.ref) || request.ref! < 0 || request.ref! >= 200) throw new Error('ref must come from snapshot')
      const value = JSON.stringify(request.text ?? '')
      const action = request.action === 'click'
        ? 'el.click();'
        : 'el.focus(); if ("value" in el) { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set; setter?.call(el, ' + value + '); } else { el.textContent = ' + value + '; } el.dispatchEvent(new InputEvent("input", {bubbles: true})); el.dispatchEvent(new Event("change", {bubbles: true}));'
      const script = '(() => { const nodes = [...document.querySelectorAll(' + JSON.stringify(interactiveSelector) + ')]; const el = nodes[' + String(request.ref) + ']; if (!el) return false; el.scrollIntoView({block:"center"}); ' + action + ' return true; })()'
      if (!await contents.executeJavaScript(script)) throw new Error('interactive ref expired; request a new snapshot')
      return { ok: true, ref: request.ref }
    }
    if (request.action === 'key') {
      const key = request.key?.trim()
      if (!key || key.length > 32) throw new Error('key is required')
      contents.sendInputEvent({ type: 'keyDown', keyCode: key })
      contents.sendInputEvent({ type: 'keyUp', keyCode: key })
      return { ok: true, key }
    }
    if (request.action === 'scroll') {
      const x = Number.isFinite(request.deltaX) ? Math.max(-2000, Math.min(2000, request.deltaX!)) : 0
      const y = Number.isFinite(request.deltaY) ? Math.max(-2000, Math.min(2000, request.deltaY!)) : 800
      await contents.executeJavaScript('window.scrollBy(' + String(x) + ',' + String(y) + ')')
      return { ok: true, deltaX: x, deltaY: y }
    }
    if (request.action === 'screenshot') {
      const image = await contents.capturePage()
      return { url: contents.getURL(), mimeType: 'image/png', base64: image.toPNG().toString('base64') }
    }
    throw new Error('unsupported browser action')
  }
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/rpc') { reply(res, 404, { error: 'not found' }); return }
    if (req.headers[TOKEN_HEADER] !== token) { reply(res, 401, { error: 'unauthorized' }); return }
    try { reply(res, 200, { ok: true, result: await rpc(await readRequest(req)) }) }
    catch (error) { reply(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }) }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('embedded browser bridge did not bind')
  const endpoint = 'http://127.0.0.1:' + String(address.port) + '/rpc'
  const show = async (): Promise<void> => { const browser = ensureWindow(); if (!browser.isVisible()) browser.show(); browser.focus() }
  return {
    endpoint, token,
    show,
    hide() { win?.hide() },
    async toggle() { if (win?.isVisible()) win.hide(); else await show() },
    async close() { save(); if (win && !win.isDestroyed()) win.destroy(); await new Promise<void>(resolve => server.close(() => resolve())) },
  }
}
