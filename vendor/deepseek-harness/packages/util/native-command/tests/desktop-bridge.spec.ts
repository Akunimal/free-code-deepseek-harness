import { afterEach, expect, it, vi } from 'vitest'
import { openNativePath, openNativeAssociatedPath, openNativeTextFile, revealNativePath } from '../src/index.ts'

afterEach(() => vi.unstubAllGlobals())

it('brokers all explicit file/document/reveal actions outside the private desktop', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ opened: true }) })
  vi.stubGlobal('fetch', fetcher)
  const run = vi.fn()
  const env = { FREECODE_HEADLESS_DESKTOP: '1', FREECODE_GUI_OPEN_PATH_ENDPOINT: 'http://127.0.0.1:1234/open-path', FREECODE_DIALOG_BRIDGE_TOKEN: 'test-token' }
  for (const [operation, intent] of [[openNativePath, 'default'], [openNativeAssociatedPath, 'association'],
    [openNativeTextFile, 'text-editor'], [revealNativePath, 'reveal']] as const) {
    await operation('C:\\workspace\\example.html', new AbortController().signal, { platform: 'win32', env, run })
    expect(fetcher).toHaveBeenLastCalledWith(env.FREECODE_GUI_OPEN_PATH_ENDPOINT, expect.objectContaining({
      body: JSON.stringify({ path: 'C:\\workspace\\example.html', intent }),
    }))
  }
  expect(run).not.toHaveBeenCalled()
})

it('does not fall back to an invisible opener when the desktop broker is missing', async () => {
  const run = vi.fn()
  await expect(openNativePath('C:\\workspace', new AbortController().signal, {
    platform: 'win32', env: { FREECODE_HEADLESS_DESKTOP: '1' }, run,
  })).rejects.toThrow(/configuration/)
  expect(run).not.toHaveBeenCalled()
})
