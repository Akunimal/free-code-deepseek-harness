/** `command` namespace dictionaries (the popupSelect shell's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'search.placeholder': '搜索…',
  'search.aria': '筛选选项',
  'status.loading': '正在加载选项…',
  'status.applying': '正在应用…',
  'status.empty': '无选项',
  'overlay.aria': '/{command} 选项',
  'listbox.aria': '/{command} 匹配项',
  'notice.attachmentsUnsupported': '/{command} 不接受附件，请先移除附件',
} satisfies Record<string, string>

/** The command namespace key union. */
export type CommandKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'search.placeholder': 'Search…',
  'search.aria': 'Filter options',
  'status.loading': 'Loading options…',
  'status.applying': 'Applying…',
  'status.empty': 'No options',
  'overlay.aria': '/{command} options',
  'listbox.aria': '/{command} matches',
  'notice.attachmentsUnsupported': '/{command} does not accept attachments; remove them first',
} satisfies Record<CommandKey, string>

/** Spanish dictionary. */
export const es = {
  'search.placeholder': 'Buscar…',
  'search.aria': 'Filtrar opciones',
  'status.loading': 'Cargando opciones…',
  'status.applying': 'Aplicando…',
  'status.empty': 'Sin opciones',
  'overlay.aria': 'Opciones de /{command}',
  'listbox.aria': 'Coincidencias de /{command}',
  'notice.attachmentsUnsupported': '/{command} no acepta archivos adjuntos; elimínelos primero',
} satisfies Record<CommandKey, string>
