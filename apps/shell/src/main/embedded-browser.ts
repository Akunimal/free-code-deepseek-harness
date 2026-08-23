import { WebContentsView, session, type BrowserWindow, type Rectangle } from 'electron'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { t } from './i18n.js'

const DEFAULT_URL = 'about:blank'
const TOKEN_HEADER = 'x-freecode-browser-token'
const MAX_TABS = 20
const SIDEBAR_WIDTH = 220
const TOOLBAR_HEIGHT = 88
const COLLAPSED_RAIL_WIDTH = 44
const MIN_PANEL_WIDTH = 560
const MAX_PANEL_WIDTH = 820

type Action =
  | 'status' | 'navigate' | 'snapshot' | 'click' | 'type' | 'key' | 'scroll'
  | 'back' | 'forward' | 'reload' | 'screenshot'
  | 'tabs' | 'new_tab' | 'select_tab' | 'close_tab' | 'wait'

interface Request {
  action: Action
  url?: string
  tabId?: string
  ref?: number
  text?: string
  key?: string
  deltaX?: number
  deltaY?: number
  timeoutMs?: number
}

interface StoredTab {
  id: string
  url: string
  title?: string
}

interface StoredState {
  version?: number
  activeTabId?: string
  tabs?: StoredTab[]
  /** v0.1.x single-window state; kept for a one-time migration. */
  url?: string
}

interface BrowserTab {
  id: string
  url: string
  title: string
  view: WebContentsView
  loading: boolean
}

interface PublicTab {
  id: string
  url: string
  title: string
  loading: boolean
  active: boolean
}

interface BrowserPublicState {
  visible: boolean
  activeTabId: string | null
  tabs: PublicTab[]
}

interface ChromeCopy {
  title: string
  newTab: string
  browser: string
  open: string
  close: string
  back: string
  forward: string
  reload: string
  go: string
  addressPlaceholder: string
  hide: string
  show: string
  noTabs: string
  loading: string
}

export interface EmbeddedBrowser {
  endpoint: string
  token: string
  /** Attach the browser surfaces to the already-created FreeCode window. */
  attachWindow(window: BrowserWindow): void
  show(): Promise<void>
  hide(): void
  toggle(): Promise<void>
  refreshLocale(): void
  close(): Promise<void>
}

function allowedUrl(value: string): boolean {
  if (value === DEFAULT_URL) return true
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function safeUrl(value: unknown): string {
  return typeof value === 'string' && allowedUrl(value) ? value : DEFAULT_URL
}

function displayTitle(tab: Pick<BrowserTab, 'title' | 'url'>): string {
  if (tab.title.trim()) return tab.title.trim().slice(0, 80)
  if (tab.url === DEFAULT_URL) return 'New tab'
  try { return new URL(tab.url).hostname || tab.url.slice(0, 80) } catch { return tab.url.slice(0, 80) }
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

function copy(): ChromeCopy {
  return {
    title: t('browser.title'),
    newTab: t('browser.newTab'),
    browser: t('browser.browser'),
    open: t('browser.open'),
    close: t('browser.close'),
    back: t('browser.back'),
    forward: t('browser.forward'),
    reload: t('browser.reload'),
    go: t('browser.go'),
    addressPlaceholder: t('browser.addressPlaceholder'),
    hide: t('browser.hide'),
    show: t('browser.show'),
    noTabs: t('browser.noTabs'),
    loading: t('browser.loading'),
  }
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

function sidebarHtml(): string {
  return `<!doctype html><meta charset="utf-8"><style>
    :root { color-scheme: dark; font: 13px system-ui, sans-serif; background: #17191f; color: #e7e9ee; }
    * { box-sizing: border-box; } body { margin: 0; height: 100vh; overflow: hidden; }
    #app { height: 100%; display: flex; flex-direction: column; border-right: 1px solid #343741; }
    header { padding: 14px 12px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    h1 { margin: 0; font-size: 15px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    button, a { border: 0; border-radius: 7px; color: inherit; background: #292c35; padding: 7px 9px; cursor: pointer; text-decoration: none; }
    button:hover, a:hover { background: #3a3e49; } button:active, a:active { background: #4a4f5b; }
    #tabs { overflow-y: auto; flex: 1; padding: 4px 8px 8px; }
    .tab { display: flex; align-items: center; gap: 7px; width: 100%; margin-bottom: 5px; padding: 9px 7px; background: transparent; text-align: left; }
    .tab.active { background: #3b3e47; } .tab-main { min-width: 0; flex: 1; }
    .tab-title, .tab-url { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tab-title { font-weight: 600; } .tab-url { color: #9ca3b2; font-size: 11px; margin-top: 3px; }
    .close { padding: 3px 6px; background: transparent; color: #b9beca; }
    footer { padding: 9px; border-top: 1px solid #343741; display: flex; gap: 7px; }
    #rail { display: none; height: 100%; align-items: center; justify-content: center; writing-mode: vertical-rl; gap: 10px; }
    #rail button { writing-mode: initial; padding: 8px 6px; } #rail span { color: #bfc5d2; font-weight: 650; }
    .collapsed #full { display: none; } .collapsed #rail { display: flex; } .collapsed { border-right: 0; border-left: 1px solid #343741; }
  </style><div id="app"><div id="full"><header><h1 id="title"></h1><button id="new" title=""></button></header><div id="tabs"></div><footer><button id="hide"></button></footer></div><div id="rail"><button id="open"></button><span id="rail-title"></span></div></div><script>
    const app = document.getElementById('app'), title = document.getElementById('title'), tabs = document.getElementById('tabs');
    const esc = (v) => String(v ?? '');
    const command = (value) => { window.location.href = 'freecode://browser/' + value; };
    document.getElementById('new').onclick = () => command('new');
    document.getElementById('hide').onclick = () => command('hide');
    document.getElementById('open').onclick = () => command('show');
    window.__freecodeRender = (state, copy) => {
      title.textContent = copy.title; document.getElementById('new').textContent = '+'; document.getElementById('new').title = copy.newTab;
      document.getElementById('hide').textContent = copy.hide; document.getElementById('open').textContent = copy.show; document.getElementById('rail-title').textContent = copy.browser;
      app.classList.toggle('collapsed', !state.visible); tabs.replaceChildren();
      if (!state.tabs.length) { const empty = document.createElement('div'); empty.textContent = copy.noTabs; empty.style.padding = '18px 8px'; empty.style.color = '#9ca3b2'; tabs.append(empty); return; }
      for (const tab of state.tabs) {
        const row = document.createElement('div'); row.className = 'tab' + (tab.active ? ' active' : '');
        row.onclick = () => command('select?tabId=' + encodeURIComponent(tab.id));
        const main = document.createElement('div'); main.className = 'tab-main';
        const name = document.createElement('div'); name.className = 'tab-title'; name.textContent = tab.loading ? copy.loading : esc(tab.title); main.append(name);
        const url = document.createElement('div'); url.className = 'tab-url'; url.textContent = esc(tab.url); main.append(url); row.append(main);
        const close = document.createElement('button'); close.className = 'close'; close.textContent = '×'; close.title = copy.close; close.onclick = (event) => { event.stopPropagation(); command('close?tabId=' + encodeURIComponent(tab.id)); }; row.append(close); tabs.append(row);
      }
    };
  </script>`
}

function toolbarHtml(): string {
  return `<!doctype html><meta charset="utf-8"><style>
    :root { color-scheme: dark; font: 13px system-ui, sans-serif; background: #20232a; color: #e7e9ee; }
    * { box-sizing: border-box; } body { margin: 0; height: 100vh; overflow: hidden; }
    #bar { height: 100%; display: flex; flex-direction: column; padding: 10px 12px; border-bottom: 1px solid #343741; gap: 9px; }
    #controls { display: flex; align-items: center; gap: 6px; } button { border: 0; border-radius: 7px; color: inherit; background: #30343d; padding: 7px 10px; cursor: pointer; } button:hover { background: #424753; }
    #address-row { display: flex; gap: 7px; } input { min-width: 0; flex: 1; border: 1px solid #424753; border-radius: 8px; background: #17191f; color: #f4f5f7; padding: 9px 11px; outline: none; } input:focus { border-color: #6b8afd; } #go { min-width: 46px; }
    #meta { min-width: 0; color: #9ca3b2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
  </style><div id="bar"><div id="controls"><button data-action="back" id="back"></button><button data-action="forward" id="forward"></button><button data-action="reload" id="reload"></button><span id="meta"></span></div><form id="address-row"><input id="address" type="text" autocomplete="off"><button id="go" type="submit"></button></form></div><script>
    const address = document.getElementById('address'), meta = document.getElementById('meta');
    const command = (value) => { window.location.href = 'freecode://browser/' + value; };
    for (const button of document.querySelectorAll('[data-action]')) button.onclick = () => command('action?name=' + button.dataset.action);
    document.getElementById('address-row').onsubmit = (event) => { event.preventDefault(); command('navigate?url=' + encodeURIComponent(address.value.trim())); };
    window.__freecodeRender = (state, copy) => {
      document.getElementById('back').textContent = '‹'; document.getElementById('back').title = copy.back;
      document.getElementById('forward').textContent = '›'; document.getElementById('forward').title = copy.forward;
      document.getElementById('reload').textContent = '↻'; document.getElementById('reload').title = copy.reload;
      document.getElementById('go').textContent = copy.go; address.placeholder = copy.addressPlaceholder;
      const tab = state.tabs.find((item) => item.active); const value = tab?.url || 'about:blank';
      if (document.activeElement !== address) address.value = value;
      meta.textContent = tab?.loading ? copy.loading : (tab?.title || value);
    };
  </script>`
}

/** Visible Chromium in the main FreeCode window, with a durable profile and computer-use bridge. */
export async function createEmbeddedBrowser(userDataDir: string, getMainWindow: () => BrowserWindow | null = () => null): Promise<EmbeddedBrowser> {
  const dataDir = join(userDataDir, 'browser-data')
  const stateFile = join(userDataDir, 'browser-state.json')
  mkdirSync(dataDir, { recursive: true })
  const browserSession = session.fromPath(dataDir)
  const token = randomBytes(32).toString('hex')
  let stored: StoredState = {}
  if (existsSync(stateFile)) {
    try { stored = JSON.parse(readFileSync(stateFile, 'utf8')) as StoredState } catch { stored = {} }
  }

  let mainWindow: BrowserWindow | null = null
  let sidebarView: WebContentsView | null = null
  let toolbarView: WebContentsView | null = null
  let visible = false
  let activeTabId: string | null = null
  let tabs = new Map<string, BrowserTab>()
  let resizeHandler: (() => void) | null = null
  let closedHandler: (() => void) | null = null

  const savedTabs = Array.isArray(stored.tabs) && stored.tabs.length > 0
    ? stored.tabs.slice(0, MAX_TABS).map((tab, index) => ({ id: tab.id || `tab-${index + 1}`, url: safeUrl(tab.url), title: tab.title ?? '' }))
    : stored.url ? [{ id: 'tab-1', url: safeUrl(stored.url), title: '' }] : [{ id: 'tab-1', url: DEFAULT_URL, title: '' }]
  activeTabId = stored.activeTabId && savedTabs.some(tab => tab.id === stored.activeTabId) ? stored.activeTabId : savedTabs[0]!.id

  const persist = (): void => {
    const state: StoredState = {
      version: 2,
      activeTabId: activeTabId ?? undefined,
      tabs: [...tabs.values()].map(tab => ({ id: tab.id, url: safeUrl(tab.url), title: tab.title })),
    }
    try { writeFileSync(stateFile, JSON.stringify(state, null, 2)) } catch { /* persistence is best effort */ }
  }

  const publicState = (): BrowserPublicState => ({
    visible,
    activeTabId,
    tabs: [...tabs.values()].map(tab => ({ id: tab.id, url: safeUrl(tab.url), title: displayTitle(tab), loading: tab.loading, active: tab.id === activeTabId })),
  })

  const updateChrome = (): void => {
    const state = escapeScriptJson(publicState())
    const labels = escapeScriptJson(copy())
    for (const view of [sidebarView, toolbarView]) {
      if (!view || view.webContents.isDestroyed()) continue
      void view.webContents.executeJavaScript(`window.__freecodeRender && window.__freecodeRender(${state}, ${labels})`).catch(() => undefined)
    }
  }

  const panelBounds = (): { sidebar: Rectangle; toolbar: Rectangle; page: Rectangle } => {
    const size = mainWindow?.getContentSize()
    const width = size?.[0] ?? 1280
    const height = size?.[1] ?? 820
    if (!visible) {
      const rail = { x: Math.max(0, width - COLLAPSED_RAIL_WIDTH), y: 0, width: COLLAPSED_RAIL_WIDTH, height }
      return { sidebar: rail, toolbar: { x: 0, y: 0, width: 0, height: 0 }, page: { x: 0, y: 0, width: 0, height: 0 } }
    }
    const panelWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width * 0.58), SIDEBAR_WIDTH + 320))
    const panelX = Math.max(0, width - panelWidth)
    const contentX = panelX + SIDEBAR_WIDTH
    const contentWidth = Math.max(1, width - contentX)
    return {
      sidebar: { x: panelX, y: 0, width: SIDEBAR_WIDTH, height },
      toolbar: { x: contentX, y: 0, width: contentWidth, height: TOOLBAR_HEIGHT },
      page: { x: contentX, y: TOOLBAR_HEIGHT, width: contentWidth, height: Math.max(1, height - TOOLBAR_HEIGHT) },
    }
  }

  const updateBounds = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const bounds = panelBounds()
    sidebarView?.setBounds(bounds.sidebar)
    toolbarView?.setBounds(bounds.toolbar)
    for (const tab of tabs.values()) tab.view.setBounds(tab.id === activeTabId ? bounds.page : { x: 0, y: 0, width: 0, height: 0 })
    updateChrome()
  }

  async function handleChromeCommand(rawUrl: string): Promise<void> {
    let parsed: URL
    try { parsed = new URL(rawUrl) } catch { return }
    if (parsed.protocol !== 'freecode:' || parsed.hostname !== 'browser') return
    const command = parsed.pathname.replace(/^\//, '')
    try {
      if (command === 'show') await show()
      else if (command === 'hide') hide()
      else if (command === 'new') await newTab()
      else if (command === 'select') selectTab(parsed.searchParams.get('tabId') ?? '')
      else if (command === 'close') await closeTab(parsed.searchParams.get('tabId') ?? '')
      else if (command === 'navigate') await navigate(activeTabId, parsed.searchParams.get('url') ?? '')
      else if (command === 'action') {
        const action = parsed.searchParams.get('name')
        const tab = activeTabId ? tabs.get(activeTabId) : undefined
        if (tab && action === 'back' && tab.view.webContents.canGoBack()) tab.view.webContents.goBack()
        if (tab && action === 'forward' && tab.view.webContents.canGoForward()) tab.view.webContents.goForward()
        if (tab && action === 'reload') void tab.view.webContents.reload()
        updateChrome()
      }
    } catch { updateChrome() }
  }

  const attachChrome = (view: WebContentsView, html: string): void => {
    view.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('freecode://browser/')) {
        event.preventDefault()
        void handleChromeCommand(url)
      } else event.preventDefault()
    })
    view.webContents.on('did-finish-load', updateChrome)
    void view.webContents.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html))
  }

  const ensureChrome = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (!sidebarView) {
      sidebarView = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
      mainWindow.contentView.addChildView(sidebarView)
      attachChrome(sidebarView, sidebarHtml())
    }
    if (!toolbarView) {
      toolbarView = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
      mainWindow.contentView.addChildView(toolbarView)
      attachChrome(toolbarView, toolbarHtml())
    }
    updateBounds()
  }

  const setupTab = (tab: BrowserTab): void => {
    const contents = tab.view.webContents
    contents.on('will-navigate', (event, url) => { if (!allowedUrl(url)) event.preventDefault() })
    contents.on('did-start-loading', () => { tab.loading = true; updateChrome() })
    const updateLocation = (_event: Electron.Event, url: string): void => { tab.url = safeUrl(url); tab.loading = false; persist(); updateChrome() }
    contents.on('did-navigate', updateLocation)
    contents.on('did-navigate-in-page', updateLocation)
    contents.on('did-finish-load', () => { tab.loading = false; tab.title = contents.getTitle() || tab.title; persist(); updateChrome() })
    contents.on('page-title-updated', (_event, title) => { tab.title = title; persist(); updateChrome() })
    contents.on('did-stop-loading', () => { tab.loading = false; updateChrome() })
    contents.on('did-fail-load', (_event, errorCode, _errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) { tab.loading = false; tab.url = safeUrl(validatedURL); updateChrome() }
    })
    contents.setWindowOpenHandler(({ url }) => {
      if (allowedUrl(url)) void navigate(tab.id, url)
      return { action: 'deny' }
    })
  }

  const addTab = (id: string, url: string, title = ''): BrowserTab => {
    const tab: BrowserTab = {
      id, url: safeUrl(url), title, loading: false,
      view: new WebContentsView({ webPreferences: { session: browserSession, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } }),
    }
    tabs.set(id, tab)
    setupTab(tab)
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.addChildView(tab.view)
    return tab
  }

  const ensureTabs = (): void => {
    if (tabs.size > 0) return
    for (const saved of savedTabs) addTab(saved.id, saved.url, saved.title)
    const active = tabs.get(activeTabId ?? '') ?? tabs.values().next().value as BrowserTab | undefined
    activeTabId = active?.id ?? null
    for (const tab of tabs.values()) void tab.view.webContents.loadURL(tab.url).catch(() => undefined)
    persist()
  }

  const navigate = async (tabId: string | null, url: string): Promise<unknown> => {
    if (!allowedUrl(url)) throw new Error('only http(s) URLs are allowed')
    const id = tabId ?? activeTabId
    const tab = id ? tabs.get(id) : undefined
    if (!tab) throw new Error('browser tab is not available')
    await show()
    tab.loading = true; updateChrome()
    await tab.view.webContents.loadURL(url)
    return { tabId: tab.id, url: tab.view.webContents.getURL() || url }
  }

  const selectTab = (tabId: string): unknown => {
    if (!tabs.has(tabId)) throw new Error('browser tab is not available')
    activeTabId = tabId; persist(); updateBounds(); return publicState()
  }

  const newTab = async (url = DEFAULT_URL): Promise<unknown> => {
    if (tabs.size >= MAX_TABS) throw new Error(`maximum of ${MAX_TABS} browser tabs reached`)
    const id = `tab-${randomBytes(6).toString('hex')}`
    const tab = addTab(id, url)
    activeTabId = id; persist(); updateBounds()
    if (url !== DEFAULT_URL) await tab.view.webContents.loadURL(url)
    return publicState()
  }

  const closeTab = async (tabId: string): Promise<unknown> => {
    const tab = tabs.get(tabId)
    if (!tab) throw new Error('browser tab is not available')
    tabs.delete(tabId)
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
    if (activeTabId === tabId) activeTabId = tabs.keys().next().value ?? null
    if (tabs.size === 0) await newTab()
    persist(); updateBounds(); return publicState()
  }

  const waitForTab = async (request: Request): Promise<unknown> => {
    const tab = tabs.get(request.tabId ?? activeTabId ?? '')
    if (!tab) throw new Error('browser tab is not available')
    const timeout = Math.max(100, Math.min(request.timeoutMs ?? 10_000, 60_000))
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const loaded = await tab.view.webContents.executeJavaScript('({url: location.href, text: document.body?.innerText || ""})').catch(() => ({ url: tab.url, text: '' })) as { url: string; text: string }
      const urlMatch = !request.url || loaded.url === request.url || loaded.url.startsWith(request.url)
      const textMatch = !request.text || loaded.text.includes(request.text)
      if (!tab.loading && urlMatch && textMatch) return { ok: true, tabId: tab.id, url: loaded.url }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error('browser wait timed out')
  }

  const interactiveSelector = 'a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]'
  const rpc = async (request: Request): Promise<unknown> => {
    ensureTabs(); ensureChrome()
    const tab = activeTabId ? tabs.get(activeTabId) : undefined
    const contents = tab?.view.webContents
    if (!tab || !contents) throw new Error('embedded browser is not ready')
    if (request.action !== 'status') await show()
    if (request.action === 'status' || request.action === 'tabs') return publicState()
    if (request.action === 'navigate') {
      if (typeof request.url !== 'string') throw new Error('url is required')
      return navigate(request.tabId ?? activeTabId, request.url)
    }
    if (request.action === 'new_tab') return newTab(request.url)
    if (request.action === 'select_tab') return selectTab(request.tabId ?? '')
    if (request.action === 'close_tab') return closeTab(request.tabId ?? activeTabId ?? '')
    if (request.action === 'wait') return waitForTab(request)
    if (request.action === 'back') { if (contents.canGoBack()) contents.goBack(); return publicState() }
    if (request.action === 'forward') { if (contents.canGoForward()) contents.goForward(); return publicState() }
    if (request.action === 'reload') { await contents.reload(); return publicState() }
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
      if (key.length === 1) contents.sendInputEvent({ type: 'char', keyCode: key })
      else { contents.sendInputEvent({ type: 'keyDown', keyCode: key }); contents.sendInputEvent({ type: 'keyUp', keyCode: key }) }
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
      return { tabId: tab.id, url: contents.getURL(), mimeType: 'image/png', base64: image.toPNG().toString('base64') }
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

  const attachWindow = (window: BrowserWindow): void => {
    if (mainWindow === window && !window.isDestroyed()) return
    mainWindow = window
    ensureTabs()
    for (const tab of tabs.values()) if (![...window.contentView.children].includes(tab.view)) window.contentView.addChildView(tab.view)
    ensureChrome()
    resizeHandler = () => updateBounds()
    closedHandler = () => { mainWindow = null; visible = false }
    window.on('resize', resizeHandler)
    window.on('closed', closedHandler)
    updateBounds()
  }

  const show = async (): Promise<void> => {
    const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : getMainWindow()
    if (window) attachWindow(window)
    if (!mainWindow || mainWindow.isDestroyed()) return
    ensureTabs(); ensureChrome(); visible = true; updateBounds(); mainWindow.show(); mainWindow.focus()
  }
  const hide = (): void => { visible = false; updateBounds() }
  return {
    endpoint, token, attachWindow, show, hide,
    async toggle() { if (visible) hide(); else await show() },
    refreshLocale() { updateChrome() },
    async close() {
      persist()
      if (mainWindow && resizeHandler) mainWindow.removeListener('resize', resizeHandler)
      if (mainWindow && closedHandler) mainWindow.removeListener('closed', closedHandler)
      for (const tab of tabs.values()) if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
      for (const view of [toolbarView, sidebarView]) if (view && !view.webContents.isDestroyed()) view.webContents.close()
      tabs = new Map(); toolbarView = null; sidebarView = null; mainWindow = null
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
