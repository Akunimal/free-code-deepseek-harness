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
 * Bind privileged IPC to the owned top-level harness renderer and its expected origin.
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

  return false;
}
