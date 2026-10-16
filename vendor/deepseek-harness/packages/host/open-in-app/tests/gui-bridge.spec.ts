import { afterEach, expect, it, vi } from 'vitest'
import { requestGuiBridge } from '../src/gui-bridge.ts'

afterEach(() => vi.unstubAllGlobals())

it('keeps standalone hosts local when no desktop bridge is configured', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  expect(await requestGuiBridge('launch', { command: 'editor.exe', args: [] }, {})).toBe(false)
  expect(fetcher).not.toHaveBeenCalled()
})

it('brokers explicit GUI actions outside the headless desktop with the private token', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetcher)
  const env = { FREECODE_GUI_LAUNCH_ENDPOINT: 'http://127.0.0.1:1234/launch-gui', FREECODE_DIALOG_BRIDGE_TOKEN: 'test-token' }
  expect(await requestGuiBridge('launch', { command: 'editor.exe', args: ['a b'] }, env)).toBe(true)
  expect(fetcher).toHaveBeenCalledWith(env.FREECODE_GUI_LAUNCH_ENDPOINT, expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ 'x-freecode-dialog-token': 'test-token' }),
    body: JSON.stringify({ command: 'editor.exe', args: ['a b'] }),
  }))
})

it('does not silently launch into the hidden desktop after broker failure or token loss', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
  const endpoint = { FREECODE_GUI_OPEN_DIRECTORY_ENDPOINT: 'http://127.0.0.1:1234/open-directory' }
  await expect(requestGuiBridge('directory', { path: 'C:\\workspace' }, endpoint)).rejects.toThrow(/configuration/)
  await expect(requestGuiBridge('directory', { path: 'C:\\workspace' }, { ...endpoint, FREECODE_DIALOG_BRIDGE_TOKEN: 'token' })).rejects.toThrow(/403/)
  await expect(requestGuiBridge('launch', { command: 'editor.exe', args: [] }, {
    FREECODE_GUI_LAUNCH_ENDPOINT: 'https://example.com/launch-gui', FREECODE_DIALOG_BRIDGE_TOKEN: 'token',
  })).rejects.toThrow(/loopback/)
})
