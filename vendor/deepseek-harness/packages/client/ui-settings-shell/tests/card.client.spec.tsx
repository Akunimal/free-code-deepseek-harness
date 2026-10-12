// @vitest-environment jsdom
/** The shell page as the Plugins page renders it: its one-liner, its two fields, and what a save does. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { SettingsFieldState, SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives'
import { ShellCard, type ShellCardProps } from '../src/client/ShellCard.tsx'
import type { ShellCardState } from '../src/client/shell-card-controller.ts'
import { en, es } from '../src/client/locales.ts'

afterEach(cleanup)

interface MockSettingsFieldProps {
  id: string
  label: string
  hint?: string
  text: string
  checked?: boolean
  disabled?: boolean
  overridden?: boolean
  overriddenLabel: string
  resetLabel: string
  onEdit: (text: string) => void
  onReset: () => void
}

// This is a ShellCard view test; ui-primitives owns its own component tests.
// Avoid importing its hook-bearing components through a second pnpm React copy.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  SettingsForm: ({ children }: { children: ReactNode }) => <>{children}</>,
  SettingsValueField: (props: MockSettingsFieldProps) => (
    <div>
      {props.overridden ? <span>{props.overriddenLabel}</span> : null}
      <label htmlFor={props.id}>{props.label}</label>
      <input id={props.id} value={props.text} disabled={props.disabled} onChange={event => { props.onEdit(event.currentTarget.value) }} />
      {props.hint ? <p>{props.hint}</p> : null}
      {props.overridden ? <button type="button" onClick={props.onReset}>{props.resetLabel}</button> : null}
    </div>
  ),
  ToggleField: (props: MockSettingsFieldProps) => (
    <div>
      {props.overridden ? <span>{props.overriddenLabel}</span> : null}
      <label htmlFor={props.id}>{props.label}</label>
      <input id={props.id} type="checkbox" checked={props.checked} disabled={props.disabled} onChange={event => { props.onEdit(String(event.currentTarget.checked)) }} />
      {props.hint ? <p>{props.hint}</p> : null}
      {props.overridden ? <button type="button" onClick={props.onReset}>{props.resetLabel}</button> : null}
    </div>
  ),
}))

const settled: SettingsFormShell = { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false }

function field(text: string, rest: Partial<SettingsFieldState> = {}): SettingsFieldState {
  return { text, overridden: false, invalid: false, ...rest }
}

function renderCard(state: Partial<ShellCardState> = {}, view: 'summary' | 'page' = 'page', locale: typeof en = en) {
  const snapshot: ShellCardState = {
    ...settled, timeoutMs: field('60000'), maxOutputBytes: field('64000'), rtk: field('true'), caveman: field('true'), ...state,
  }
  const actions = { edit: vi.fn(), resetField: vi.fn(), save: vi.fn(), discard: vi.fn() }
  const t = (key: keyof typeof en) => locale[key]
  const props = { ...actions, view, t, useShellCard: <T,>(selector: (value: ShellCardState) => T) => selector(snapshot) } as ShellCardProps
  render(<ShellCard {...props} />)
  return actions
}

describe('ShellCard', () => {
  it('renders its one-liner alone in the summary view', () => {
    renderCard({}, 'summary')

    expect(document.body.textContent).toBe(en.description)
    expect(screen.queryByLabelText(en.timeoutMs)).toBeNull()
  })

  it('shows its fields at once on its page, without a title of its own', () => {
    renderCard()

    expect(screen.getByLabelText(en.timeoutMs)).toBeTruthy()
    expect(screen.getByLabelText(en.maxOutputBytes)).toBeTruthy()
    expect(screen.queryByText(en.title)).toBeNull()
  })

  it('renders the Caveman toggle with its Spanish label and hint', () => {
    renderCard({}, 'page', es)

    expect(screen.getByRole('checkbox', { name: es.caveman })).toBeTruthy()
    expect(screen.getByText(es.cavemanHint)).toBeTruthy()
  })

  it('renders RTK and Caveman as staged resettable toggles', () => {
    const actions = renderCard({ rtk: field('true'), caveman: field('false', { overridden: true }) })
    const rtk = screen.getByRole('checkbox', { name: en.rtk })
    const caveman = screen.getByRole('checkbox', { name: en.caveman })

    expect(rtk).toHaveProperty('checked', true)
    expect(caveman).toHaveProperty('checked', false)
    fireEvent.click(rtk)
    fireEvent.click(caveman)
    fireEvent.click(screen.getByRole('button', { name: en.reset }))

    expect(actions.edit).toHaveBeenCalledWith('rtk', 'false')
    expect(actions.edit).toHaveBeenCalledWith('caveman', 'true')
    expect(actions.resetField).toHaveBeenCalledWith('caveman')
  })

  it('stages an edit instead of writing it', () => {
    const actions = renderCard()

    fireEvent.change(screen.getByLabelText(en.timeoutMs), { target: { value: '9000' } })

    expect(actions.edit).toHaveBeenCalledWith('timeoutMs', '9000')
    expect(actions.save).not.toHaveBeenCalled()
  })

  it('offers the reset for an overridden field only, and addresses each field separately', () => {
    const actions = renderCard({ maxOutputBytes: field('64000', { overridden: true }) })

    // One badge and one reset: the timeout is still inherited.
    expect(screen.getAllByText(en.overridden)).toHaveLength(1)
    fireEvent.change(screen.getByLabelText(en.maxOutputBytes), { target: { value: '1024' } })
    fireEvent.click(screen.getByRole('button', { name: en.reset }))

    expect(actions.edit).toHaveBeenCalledWith('maxOutputBytes', '1024')
    expect(actions.resetField).toHaveBeenCalledWith('maxOutputBytes')
    cleanup()

    const timeout = renderCard({ timeoutMs: field('9000', { overridden: true }) })
    fireEvent.click(screen.getByRole('button', { name: en.reset }))
    expect(timeout.resetField).toHaveBeenCalledWith('timeoutMs')
  })

  it('says the document is read-only and disables its controls', () => {
    renderCard({ writable: false })

    expect(screen.getByLabelText(en.timeoutMs)).toHaveProperty('disabled', true)
    expect(screen.getByRole('checkbox', { name: en.caveman })).toHaveProperty('disabled', true)
  })
})
