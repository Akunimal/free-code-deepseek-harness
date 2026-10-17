import { describe, expect, it } from 'vitest';
import {
  isTrustedHarnessNavigation,
  isTrustedRendererInvocation,
  OVERLAY_IPC_CHANNELS,
} from '../src/main/renderer-security.js';

const harnessUrl = 'http://127.0.0.1:43125/?token=one-time-token';

function invokeEvent<T extends { mainFrame: { url: string } }>(sender: T, url: string, isMainFrame = true) {
  sender.mainFrame.url = url;
  const senderFrame = isMainFrame ? sender.mainFrame : { url };
  return { sender, senderFrame };
}

describe('trusted harness navigation', () => {
  it('allows only the expected 127.0.0.1 origin and port', () => {
    expect(isTrustedHarnessNavigation('http://127.0.0.1:43125/session', harnessUrl)).toBe(true);
    expect(isTrustedHarnessNavigation('http://127.0.0.1:43126/session', harnessUrl)).toBe(false);
    expect(isTrustedHarnessNavigation('http://localhost:43125/session', harnessUrl)).toBe(false);
    expect(isTrustedHarnessNavigation('https://example.com/', harnessUrl)).toBe(false);
    expect(isTrustedHarnessNavigation('file:///C:/tmp/payload.html', harnessUrl)).toBe(false);
  });

  it('fails closed for malformed or non-loopback expected URLs', () => {
    expect(isTrustedHarnessNavigation('http://127.0.0.1:43125/', 'not a URL')).toBe(false);
    expect(isTrustedHarnessNavigation('https://example.com/', 'https://example.com/')).toBe(false);
  });
});

describe('trusted renderer IPC policy', () => {
  const harnessContents = { id: 'harness', mainFrame: { url: harnessUrl } };
  const overlayContents = { id: 'overlay', mainFrame: { url: 'data:text/html,overlay' } };
  const base = {
    harnessWebContents: harnessContents,
    overlayWebContents: overlayContents,
    harnessUrl,
  };

  it('allows the main frame of the expected harness WebContents', () => {
    const url = 'http://127.0.0.1:43125/session';
    expect(isTrustedRendererInvocation(invokeEvent(harnessContents, url), base, 'models:refresh')).toBe(true);
  });

  it('rejects another WebContents, cross-origin navigation, and subframes', () => {
    expect(isTrustedRendererInvocation(invokeEvent({ id: 'other', mainFrame: { url: harnessUrl } }, harnessUrl), base, 'models:refresh')).toBe(false);
    expect(isTrustedRendererInvocation(invokeEvent(harnessContents, 'https://attacker.example/'), base, 'models:refresh')).toBe(false);
    expect(isTrustedRendererInvocation(invokeEvent(harnessContents, 'http://127.0.0.1:43125/iframe', false), base, 'models:refresh')).toBe(false);
  });

  it('limits the overlay to close and Tor controls, never broad harness IPC', () => {
    for (const channel of OVERLAY_IPC_CHANNELS) {
      expect(isTrustedRendererInvocation(invokeEvent(overlayContents, 'data:text/html,overlay'), base, channel)).toBe(true);
    }
    expect(isTrustedRendererInvocation(invokeEvent(overlayContents, 'data:text/html,overlay'), base, 'mcp:setEnabled')).toBe(false);
    expect(isTrustedRendererInvocation(invokeEvent(overlayContents, 'https://attacker.example/'), base, 'tor:start')).toBe(false);
  });
});
