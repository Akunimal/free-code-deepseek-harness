/** CSS contract for FreeCode's per-conversation working atmosphere. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/skeleton/ConversationRoot.module.css', import.meta.url)), 'utf8')
const component = readFileSync(fileURLToPath(new URL('../src/client/skeleton/ConversationRoot.tsx', import.meta.url)), 'utf8')
const chatView = readFileSync(fileURLToPath(new URL('../src/client/chat/ChatView.tsx', import.meta.url)), 'utf8')

describe('ConversationRoot motion background', () => {
  it('keeps the working effect CSS-only, layered behind content, and reduced-motion safe', () => {
    expect(css).toContain('.motionBackground::before')
    expect(css).toContain('.motionBackground::after')
    expect(css).toContain('radial-gradient(')
    expect(css).toContain('translate3d(')
    expect(css).toContain('pointer-events: none')
    expect(component).toContain('data-conversation-motion=""')
    expect(component).toContain('aria-hidden="true"')
    expect(chatView).toContain("t('turn.deepDiving')")
    expect(chatView).not.toContain('Deep diving...')
    expect(css).toContain(".root[data-phase='active'] .motionBackground::before")
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation: none')
  })
})
