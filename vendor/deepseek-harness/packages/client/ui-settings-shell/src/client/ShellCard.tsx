/** The shell executor's settings page: the limits every command the agent runs is bound by. */

import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsValueField, ToggleField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels } from './locales.ts'
import type { ShellCardFace } from './shell-card-controller.ts'

/** Props the renderer binds for the shell page. */
export type ShellCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.shell'>
  & InjectFace<ShellCardFace>

/**
 * Render the shell executor's one-liner or its settings form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export function ShellCard(props: ShellCardProps) {
  const { t } = props
  const state = props.useShellCard(snapshot => snapshot)
  if (props.view === 'summary') return t('description')
  const disabled = !state.writable
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      <SettingsValueField
        id="plugin-config-shell-timeout"
        label={t('timeoutMs')}
        hint={t('timeoutMsHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        numeric
        disabled={disabled}
        {...state.timeoutMs}
        onEdit={(text) => { props.edit('timeoutMs', text) }}
        onReset={() => { props.resetField('timeoutMs') }}
      />
      <SettingsValueField
        id="plugin-config-shell-output"
        label={t('maxOutputBytes')}
        hint={t('maxOutputBytesHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        numeric
        disabled={disabled}
        {...state.maxOutputBytes}
        onEdit={(text) => { props.edit('maxOutputBytes', text) }}
        onReset={() => { props.resetField('maxOutputBytes') }}
      />
      <ToggleField
        id="plugin-config-shell-rtk"
        label={t('rtk')}
        hint={t('rtkHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        checked={state.rtk.text === 'true'}
        {...state.rtk}
        onEdit={(text) => { props.edit('rtk', text) }}
        onReset={() => { props.resetField('rtk') }}
      />
      <ToggleField
        id="plugin-config-shell-caveman"
        label={t('caveman')}
        hint={t('cavemanHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        checked={state.caveman.text === 'true'}
        {...state.caveman}
        onEdit={(text) => { props.edit('caveman', text) }}
        onReset={() => { props.resetField('caveman') }}
      />
    </SettingsForm>
  )
}
