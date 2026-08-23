import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const BROWSER_ACTIONS = ['status', 'tabs', 'new_tab', 'select_tab', 'close_tab', 'wait', 'navigate', 'snapshot', 'click', 'type', 'key', 'scroll', 'back', 'forward', 'reload', 'screenshot'] as const
type BrowserAction = typeof BROWSER_ACTIONS[number]
interface BrowserArgs { action: BrowserAction; url?: string; tabId?: string; ref?: number; text?: string; key?: string; deltaX?: number; deltaY?: number; timeoutMs?: number }
interface BrowserResponse { ok: boolean; result?: unknown; error?: string }

async function callBrowser(args: BrowserArgs, signal: AbortSignal): Promise<JsonValue> {
  const endpoint = process.env.FREECODE_EMBEDDED_BROWSER_ENDPOINT
  const token = process.env.FREECODE_EMBEDDED_BROWSER_TOKEN
  if (!endpoint || !token) throw new Error('embedded browser is unavailable in this Harness process')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-freecode-browser-token': token },
    body: JSON.stringify(args),
    signal,
})
  const payload = await response.json() as BrowserResponse
  if (!response.ok || payload.ok !== true) throw new Error(payload.error ?? 'embedded browser request failed')
  return (payload.result ?? null) as JsonValue
}

export function applyEmbeddedBrowser(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tool:computer_use',
    order: 116,
    text: 'The computer_use tool controls the FreeCode visible embedded Chromium browser. The browser is persistent and non-headless for manual login and review. Use status/tabs to inspect tabs, snapshot first, then click/type using its refs. Only use http(s) navigation; never claim a click succeeded without a tool result.',
  })
  ctx.tools.register(defineTool({
    name: 'computer_use',
    description: 'Control the persistent visible embedded Chromium browser. Use status/tabs to inspect tabs and snapshot to inspect interactive refs, then click or type. Supports tabs, navigation, keyboard, scrolling, history, reload, waiting, status, and screenshot.',
    parameters: {
      action: { type: 'string', required: true, enum: [...BROWSER_ACTIONS] },
      url: { type: 'string', description: 'http(s) URL for navigate' },
      tabId: { type: 'string', description: 'Tab id from status or tabs' },
      ref: { type: 'number', description: 'Interactive element ref from the latest snapshot' },
      text: { type: 'string', description: 'Text for type' },
      key: { type: 'string', description: 'Key name for key' },
      deltaX: { type: 'number', description: 'Horizontal scroll delta' },
      deltaY: { type: 'number', description: 'Vertical scroll delta' },
      timeoutMs: { type: 'number', description: 'Maximum wait time in milliseconds for wait' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    timeoutMs: 30_000,
    async execute(args, exec) {
      return callBrowser(args as BrowserArgs, exec.signal)
    },
  }))
}
