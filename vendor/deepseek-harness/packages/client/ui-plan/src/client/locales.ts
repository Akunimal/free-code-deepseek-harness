/** `plan` namespace dictionaries (the composer plan chip's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'chip.label': 'Plan',
  'chip.on.aria': 'plan mode 已开启，按下关闭',
  'chip.on.title': 'plan mode 已开启 — 点击关闭（/plan off）',
  'chip.off.aria': 'plan mode 已关闭，按下开启',
  'chip.off.title': 'plan mode 已关闭 — 点击开启（/plan）',
  'chip.exitFailed': '退出 plan mode 失败',
} satisfies Record<string, string>

/** The plan namespace key union. */
export type PlanKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'chip.label': 'Plan',
  'chip.on.aria': 'Plan mode on, press to turn off',
  'chip.on.title': 'Plan mode on — click to turn off (/plan off)',
  'chip.off.aria': 'Plan mode off, press to turn on',
  'chip.off.title': 'Plan mode off — click to turn on (/plan)',
  'chip.exitFailed': 'Failed to exit plan mode',
} satisfies Record<PlanKey, string>

/** Spanish dictionary. */
export const es = {
  'chip.label': 'Plan',
  'chip.on.aria': 'Modo plan activado, presione para desactivar',
  'chip.on.title': 'Modo plan activado — clic para desactivar (/plan off)',
  'chip.off.aria': 'Modo plan desactivado, presione para activar',
  'chip.off.title': 'Modo plan desactivado — clic para activar (/plan)',
  'chip.exitFailed': 'No se pudo salir del modo plan',
} satisfies Record<PlanKey, string>
