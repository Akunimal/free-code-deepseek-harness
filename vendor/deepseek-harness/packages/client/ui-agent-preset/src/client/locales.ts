/** Locale bundles for the agent-preset hero chip, header label, and management section. */

import { guideEn, guideZh, type PresetGuideKey } from './guide-locales.ts'

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | PresetGuideKey
  | 'builtInGroup'
  | 'customGroup'
  | 'seatHint'
  | 'headerHint'
  | 'nav'
  | 'sectionIntro'
  | 'setDefault'
  | 'view'
  | 'presetStandardName'
  | 'presetStandardDescription'
  | 'presetPtcName'
  | 'presetPtcDescription'
  | 'presetMinimalName'
  | 'presetMinimalDescription'
  | 'presetCordisName'
  | 'presetCordisDescription'
  | 'inUse'
  | 'noDescription'
  | 'brokenBadge'
  | 'switchRefused'
  | 'standardUnavailable'
  | 'close'
  | 'creatorDraft'
  | 'createPlugin'
  | 'createPluginDescription'
  | 'createPluginChecking'
  | 'createPluginUnavailable'
  | 'createPluginMissing'

/** English copy. */
export const en: Record<AgentPresetSettingsKey, string> = {
  ...guideEn,
  builtInGroup: 'Built-in', customGroup: 'Custom',
  sectionIntro: 'Choose the agent’s tools and how it works. Use Standard mode for everyday tasks, or Creator mode to add capabilities to DSH.',

  seatHint: 'Choose the agent preset for your new task',
  headerHint: 'The agent preset chosen when this task started',
  nav: 'Agent presets',

  setDefault: 'Set as new task default',
  view: 'View configuration',

  presetStandardName: 'Standard mode',
  presetStandardDescription:
    'Work with code, files, and information. Suitable for most tasks, with search, editing, terminal commands, and other tools available as needed.',
  presetPtcName: 'PTC mode',
  presetPtcDescription:
    'Includes all Standard mode capabilities. Better suited to tasks that call tools in batches and then filter, organize, deduplicate, count, or summarize the results.',
  presetMinimalName: 'Minimal mode',
  presetMinimalDescription:
    'The agent works using only a terminal tool. Useful for testing and comparing its basic performance.',
  presetCordisName: 'Creator mode',
  presetCordisDescription:
    'Customize DSH through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.',

  inUse: 'New task default',

  noDescription: 'No description.',
  brokenBadge: 'Failed to load',

  switchRefused: 'Could not switch to {name}: {reason}',
  standardUnavailable: 'Standard mode is unavailable. Restore it or choose another available mode.',

  close: 'Close',

  creatorDraft: 'Let the agent help me create a preset',
  createPlugin: 'Let the agent create a plugin',
  createPluginDescription: 'Enter Creator mode and make your own DSH plugin',
  createPluginChecking: 'Checking whether Creator mode is available',
  createPluginUnavailable: 'Temporarily unavailable. Reopen this menu to retry',
  createPluginMissing: 'Creator mode is not included in this configuration',

}

/** Spanish translations retain the fork copy and inherit new upstream keys from English. */
export const es = {
  ...en,
  "error": "No se pudieron cargar los presets de agente.",
  "userTrust": "Personalizado",
  "seatHint": "Preset de agente para la sesión que está por iniciar",
  "headerHint": "El preset de agente que ejecuta esta sesión, fijado al iniciarla",
  "nav": "Presets de agente",
  "sectionIntro": "Un preset es la composición de complementos que ejecuta el agente de una sesión — sus herramientas, instrucciones y capacidades. Duplique uno existente y hágalo suyo, o deje que el agente redacte uno por usted en modo Creador.",
  "builtIn": "Integrado",
  "setDefault": "Establecer como predeterminado",
  "view": "Ver",
  "presetStandardName": "Modo estándar",
  "presetStandardDescription": "Agente de programación completo con edición de archivos, shell, búsqueda de archivos y web, habilidades, planificación, objetivos, subagentes y flujos de trabajo.",
  "presetPtcName": "Modo PTC",
  "presetPtcDescription": "Agente de programación completo sin la herramienta de flujos de trabajo; las demás herramientas se exponen mediante el SDK del modo PTC para que el modelo combine operaciones de varios pasos en un programa TypeScript.",
  "presetMinimalName": "Modo mínimo",
  "presetMinimalDescription": "Agente de programación de dos herramientas con bash persistente y str_replace_editor.",
  "presetCordisName": "Modo creador",
  "presetCordisDescription": "Diseñado para crear presets de agente personalizados, con todas las capacidades del modo estándar más inspección en tiempo de ejecución, experimentos con complementos y guía de autoría de presets.",
  "duplicate": "Duplicar",
  "duplicateUnavailable": "Esta instalación no tiene un directorio de presets con escritura",
  "delete": "Eliminar",
  "presetId": "Identificador",
  "presetIdPlaceholder": "my-agent",
  "displayName": "Nombre",
  "displayNamePlaceholder": "Se muestra en el selector; por defecto usa el identificador",
  "inUse": "En uso",
  "builtInGroup": "Integrados",
  "customGroup": "Personalizados",
  "noDescription": "Sin descripción.",
  "brokenBadge": "Error al cargar",
  "brokenNoCopy": "Un preset que no se pudo cargar no se puede duplicar",
  "switchRefused": "No se pudo cambiar a {name}: {reason}",
  "copyOf": "Copiado de",
  "composition": "Composición (agent.cordis.yml)",
  "cancel": "Cancelar",
  "close": "Cerrar",
  "retry": "Reintentar",
  "copyTitle": "Duplicar preset",
  "copyIntro": "Todo el preset se copia en este equipo. El identificador se convierte en su nombre de directorio y no se puede cambiar después; lo demás se edita en los archivos propios del preset.",
  "create": "Crear",
  "creating": "Creando…",
  "creatorDraft": "Redactar un preset personalizado con el modo Creador",
  "openLocation": "Abrir carpeta",
  "showLocation": "Mostrar ubicación",
  "revealedPathLabel": "Archivos del preset:",
  "idRequired": "Asigne un identificador al preset.",
  "idInvalid": "Use letras minúsculas, dígitos y guiones, comenzando con letra o dígito.",
  "idTaken": "Ya existe un preset con este identificador.",
  "deleteTitle": "¿Eliminar este preset?",
  "deleteDescription": "El directorio del preset se elimina. Las sesiones que ya lo usan siguen funcionando; las sesiones nuevas no podrán seleccionarlo.",
  "deleteConfirm": "Eliminar",
  "deleting": "Eliminando…",
}


/** Simplified Chinese copy. */
export const zh: Record<AgentPresetSettingsKey, string> = {
  ...guideZh,
  builtInGroup: '内置', customGroup: '自定义',
  sectionIntro: '选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展 DSH 的能力用「创造模式」。',

  seatHint: '选择新任务使用的 Agent 预设',
  headerHint: '本任务的 Agent 预设，在任务开始时确定',
  nav: 'Agent 预设',

  setDefault: '设为新任务默认',
  view: '查看配置',

  presetStandardName: '标准模式',
  presetStandardDescription: '处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。',
  presetPtcName: 'PTC 模式',
  presetPtcDescription: '包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。',
  presetMinimalName: '极简模式',
  presetMinimalDescription: 'Agent 仅使用终端工具完成任务，适合测试和对比其基础表现。',
  presetCordisName: '创造模式',
  presetCordisDescription: '用对话定制 DSH：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。',

  inUse: '新任务默认',

  noDescription: '暂无描述。',
  brokenBadge: '加载失败',

  switchRefused: '无法切换到「{name}」：{reason}',
  standardUnavailable: '标准模式不可用，请恢复该模式或选择其他可用模式。',

  close: '关闭',

  creatorDraft: '让 Agent 帮我创建预设模式',
  createPlugin: '让 Agent 创建插件',
  createPluginDescription: '进入创造模式，制作属于你的 DSH 插件',
  createPluginChecking: '正在确认创造模式是否可用',
  createPluginUnavailable: '暂时不可用，请重新打开菜单重试',
  createPluginMissing: '当前配置未提供创造模式',

}

// The resolution itself is the shared fold in `dsh-agent-preset-registry/display`,
// re-exported here so every surface in this plugin reads one path; the
// Settings plugin list inlines the same fold over this plugin's dictionaries.
export { isBuiltInPreset, presetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
export type { PresetDisplaySource, PresetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
