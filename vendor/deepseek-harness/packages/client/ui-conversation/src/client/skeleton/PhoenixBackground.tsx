import { useEffect, useRef, useState } from 'react'
import { pickPhoenixPattern, startPhoenixPattern, type PhoenixPattern } from './phoenixPatterns.ts'
import css from './ConversationRoot.module.css'

const CROSSFADE_MS = 900

function PhoenixLayer({
  pattern,
  working,
  hidden,
  reduced,
  transition,
}: {
  pattern: PhoenixPattern
  working: boolean
  hidden: boolean
  reduced: boolean
  transition: 'steady' | 'incoming' | 'outgoing'
}) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current || reduced || hidden) return
    return startPhoenixPattern(pattern, host.current)
  }, [pattern, reduced, hidden])

  return <div ref={host} className={css.phoenixLayer} aria-hidden="true"
    data-phoenix-layer={pattern} data-transition-phase={transition}
    data-working={String(working)} data-reduced-motion={String(reduced)} />
}

/** Keep a live turn's pattern stable; animate faster, then crossfade on finish/stop. */
export function PhoenixBackground({ working }: { working: boolean }) {
  const wasWorking = useRef(working)
  const [pattern, setPattern] = useState(pickPhoenixPattern)
  const currentPattern = useRef(pattern)
  const [outgoing, setOutgoing] = useState<PhoenixPattern | null>(null)
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
    currentPattern.current = pattern
  }, [pattern])

  useEffect(() => {
    if (wasWorking.current && !working) {
      const previous = currentPattern.current
      const next = pickPhoenixPattern(previous)
      setOutgoing(reduced || hidden ? null : previous)
      currentPattern.current = next
      setPattern(next)
    }
    wasWorking.current = working
  }, [working, reduced, hidden])

  useEffect(() => {
    if (outgoing === null) return
    const timer = window.setTimeout(() => setOutgoing(null), CROSSFADE_MS)
    return () => window.clearTimeout(timer)
  }, [outgoing])

  return <div className={css.phoenixBackground} aria-hidden="true"
    data-phoenix-background="hermes" data-pattern={pattern}
    data-transition-from={outgoing ?? undefined}
    data-working={String(working)} data-reduced-motion={String(reduced)}>
    {outgoing !== null && <PhoenixLayer key={`outgoing:${outgoing}`} pattern={outgoing} working={working}
      hidden={hidden} reduced={reduced} transition="outgoing" />}
    <PhoenixLayer key={`current:${pattern}`} pattern={pattern} working={working}
      hidden={hidden} reduced={reduced} transition={outgoing === null ? 'steady' : 'incoming'} />
  </div>
}
