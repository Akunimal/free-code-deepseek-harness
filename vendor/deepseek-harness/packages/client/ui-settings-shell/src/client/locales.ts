/** Locale bundles for the shell executor's settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type ShellSettingsLocaleKey =
  | 'title' | 'description'
  | 'timeoutMs' | 'timeoutMsHint' | 'maxOutputBytes' | 'maxOutputBytesHint'
  | 'rtk' | 'rtkHint' | 'caveman' | 'cavemanHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

/** English copy. */
export const en: Record<ShellSettingsLocaleKey, string> = {
  title: 'Shell',
  description: 'Limit command runtime and output, and configure optional output compression.',
  timeoutMs: 'Command timeout (ms)',
  timeoutMsHint: 'How long one command may run before it is terminated.',
  maxOutputBytes: 'Output cap per stream (bytes)',
  maxOutputBytesHint: 'Output beyond this spills to a temporary file rather than being lost.',
  rtk: 'Use RTK output compression',
  rtkHint: 'Use RTK for supported plain CLI commands when the binary is installed.',
  caveman: 'Use Caveman output compression',
  cavemanHint: 'Use Caveman for supported plain CLI commands when the binary is installed.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
}

/** Simplified Chinese copy. */
export const zh: Record<ShellSettingsLocaleKey, string> = {
  title: '终端',
  description: '限制每条命令的运行时间和输出，并配置可选的输出压缩。',
  timeoutMs: '命令超时（毫秒）',
  timeoutMsHint: '单条命令允许运行多久，超时即终止。',
  maxOutputBytes: '单流输出上限（字节）',
  maxOutputBytesHint: '超出部分会转存到临时文件，而不是被丢弃。',
  rtk: '使用 RTK 压缩输出',
  rtkHint: '安装了 RTK 时，对支持的简单 CLI 命令使用 RTK。',
  caveman: '使用 Caveman 压缩输出',
  cavemanHint: '安装了 Caveman 时，对支持的简单 CLI 命令使用 Caveman。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidNumber: '请填数字；留空表示使用默认值。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: ShellSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
