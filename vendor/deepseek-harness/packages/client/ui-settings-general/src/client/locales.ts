/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
} satisfies Record<SettingsKey, string>

/** Spanish dictionary, checked complete against the key set. */
export const es = {
  'trigger': 'Configuración',
  'title': 'Configuración',
  'close': 'Cerrar',
  'openDocument': 'Abrir archivo de configuración',
  'openDocument.error': 'No se pudo abrir el archivo de configuración',
  'general.nav': 'General',
} satisfies Record<SettingsKey, string>
