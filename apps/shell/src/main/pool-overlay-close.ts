interface PoolOverlayWindowRef {
  webContents: object;
  isDestroyed(): boolean;
}

/** A renderer may close only the live auxiliary overlay that owns it. */
export function canClosePoolStatusOverlay(
  sender: object,
  target: PoolOverlayWindowRef | null,
): boolean {
  return target !== null && !target.isDestroyed() && sender === target.webContents;
}
