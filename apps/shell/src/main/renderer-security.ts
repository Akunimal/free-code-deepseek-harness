/** IPC calls accepted from the static Pool Status data page. */
export const OVERLAY_IPC_CHANNELS = new Set([
  'pool:closeOverlay',
  'tor:getStatus',
  'tor:start',
  'tor:stop',
]);

interface RendererFrame {
  url: string;
}

interface RendererWebContents {
  mainFrame: object;
}

export interface RendererInvokeEvent {
  sender: RendererWebContents;
  senderFrame: RendererFrame | null;
}

export interface TrustedRendererTargets {
  harnessWebContents: object | null;
  overlayWebContents: object | null;
  harnessUrl: string;
}

/**
 * Only permit the exact loopback origin chosen by the supervisor. A different
 * port is a different app instance, while HTTPS, localhost aliases, and file
 * or data URLs must never inherit the harness bridge.
 */
export function isTrustedHarnessNavigation(candidateUrl: string, expectedUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const expected = new URL(expectedUrl);
    return candidate.protocol === 'http:'
      && candidate.hostname === '127.0.0.1'
      && expected.protocol === 'http:'
      && expected.hostname === '127.0.0.1'
      && expected.port.length > 0
      && candidate.origin === expected.origin;
  } catch {
    return false;
  }
}

/**
 * Bind privileged IPC to an owned top-level renderer and its expected origin.
 * The overlay gets only its four static-page operations; it cannot invoke the
 * broader harness API even though both renderers use the same preload file.
 */
export function isTrustedRendererInvocation(
  event: RendererInvokeEvent,
  targets: TrustedRendererTargets,
  channel: string,
): boolean {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) return false;

  if (event.sender === targets.harnessWebContents) {
    return isTrustedHarnessNavigation(frame.url, targets.harnessUrl);
  }

  return event.sender === targets.overlayWebContents
    && OVERLAY_IPC_CHANNELS.has(channel)
    && frame.url.startsWith('data:text/html,');
}
