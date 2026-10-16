/**
 * Broker an explicit desktop action outside FreeCode's private desktop.
 * @param kind - GUI executable launch or directory opening.
 * @param payload - argv or directory selected by the open-in-app route.
 * @param env - shell-owned loopback endpoints and authentication token.
 * @returns true after a broker acknowledgement, false for standalone hosts.
 */
export async function requestGuiBridge(
  kind: 'launch' | 'directory',
  payload: { command: string; args: readonly string[]; electronCli?: true } | { path: string },
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  const endpoint = kind === 'launch' ? env.FREECODE_GUI_LAUNCH_ENDPOINT : env.FREECODE_GUI_OPEN_DIRECTORY_ENDPOINT
  const token = env.FREECODE_DIALOG_BRIDGE_TOKEN
  if (!endpoint && env.FREECODE_HEADLESS_DESKTOP !== '1') return false
  if (!endpoint || !token) throw new Error('incomplete FreeCode GUI bridge configuration')
  const url = new URL(endpoint)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.pathname !== (kind === 'launch' ? '/launch-gui' : '/open-directory')) {
    throw new Error('FreeCode GUI bridge must use its loopback endpoint')
  }
  const response = await fetch(url.href, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-freecode-dialog-token': token },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`FreeCode GUI bridge refused action (${response.status})`)
  return true
}
