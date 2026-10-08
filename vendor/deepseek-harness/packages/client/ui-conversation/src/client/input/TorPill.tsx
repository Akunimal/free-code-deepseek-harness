import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { NS } from '../locales.ts'
import css from './TorPill.module.css'

/** Narrow projection of the shell preload bridge (window.freecode.tor). */
interface TorBridgeStatus {
  active: boolean
  status: string
}

interface TorBridge {
  getStatus(): Promise<TorBridgeStatus | null>
  onStatus(cb: (status: TorBridgeStatus) => void): () => void
  start(): Promise<unknown>
  stop(): Promise<unknown>
}

declare global {
  interface Window {
    freecode?: { tor?: TorBridge }
  }
}

/**
 * Tor route pill at the composer leading seat. "TOR" is a protocol token,
 * identical in every locale, so the pill carries no dictionary keys.
 * Hidden outside the FreeCode shell (no preload bridge). Click toggles
 * the Tor daemon; the pool overlay keeps the full status surface.
 */
export function TorPill() {
  const [status, setStatus] = useState<TorBridgeStatus | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const bridge = window.freecode?.tor
    if (bridge === undefined) return
    let alive = true
    const refresh = (): void => {
      bridge.getStatus().then(s => { if (alive) setStatus(s) }).catch(() => undefined)
    }
    refresh()
    const off = bridge.onStatus(s => { if (alive) setStatus(s) })
    const timer = setInterval(refresh, 30000)
    return () => { alive = false; off(); clearInterval(timer) }
  }, [])
  if (window.freecode?.tor === undefined) return null
  const on = status?.active === true
  const toggle = (): void => {
    const bridge = window.freecode?.tor
    if (bridge === undefined || busy) return
    setBusy(true)
    bridge.getStatus()
      .then(s => (s?.active === true ? bridge.stop() : bridge.start()))
      .then(() => bridge.getStatus())
      .then(s => { setStatus(s); setBusy(false) }, () => setBusy(false))
      .catch(() => setBusy(false))
  }
  return (
    <button
      type="button"
      className={on ? css.on : css.off}
      disabled={busy}
      aria-pressed={on}
      title="Tor"
      onClick={toggle}
    >
      <span className={css.dot} aria-hidden="true" />
      TOR
    </button>
  )
}

/** Registers the pill as the first occupant of the composer leading slot. */
export const torPillEntry = {
  name: 'freecode-tor-pill',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('conversation.input.left', () =>
      ctx.slots.register({ name: 'conversation.input.left', id: 'freecode-tor', order: -100, locale: NS }, TorPill))
  }
}
