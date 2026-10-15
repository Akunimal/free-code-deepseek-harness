import { useEffect, useRef, useState } from 'react'
import { pickPhoenixPattern, startPhoenixPattern } from './phoenixPatterns.ts'
import css from './ConversationRoot.module.css'

/** The actual Hermes pattern family, slow at rest and faster during a live turn. */
export function PhoenixBackground({ working }: { working: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const wasWorking = useRef(working)
  const [pattern, setPattern] = useState(pickPhoenixPattern)
  const [hidden, setHidden] = useState(() => document.hidden)
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const motion = () => setReduced(media?.matches ?? true)
    const visibility = () => setHidden(document.hidden)
    media?.addEventListener('change', motion)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      media?.removeEventListener('change', motion)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  useEffect(() => {
    if (working && !wasWorking.current) setPattern(pickPhoenixPattern())
    wasWorking.current = working
  }, [working])

  useEffect(() => {
    if (reduced || hidden) return
    const timer = setInterval(() => setPattern(pickPhoenixPattern()), 45_000)
    return () => clearInterval(timer)
  }, [reduced, hidden])

  useEffect(() => {
    if (!host.current || reduced || hidden) return
    return startPhoenixPattern(pattern, host.current)
  }, [pattern, reduced, hidden])

  return <div ref={host} className={css.phoenixBackground} aria-hidden="true"
    data-phoenix-background="hermes" data-pattern={pattern}
    data-working={String(working)} data-reduced-motion={String(reduced)} />
}
