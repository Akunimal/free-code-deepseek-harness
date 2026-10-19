/**
 * `model` namespace dictionaries.
 *
 * `trigger.selectAria` intentionally matches `trigger.fallback` but remains a
 * separate key: the visible fallback label and the accessible name of
 * an unset trigger are free to diverge per locale, and folding it into
 * `trigger.aria` would announce the degenerate "Select model, current Select
 * model".
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'provider.account': 'DeepSeek 账号',
  'command.label': '模型',
  'command.description': '选择本会话使用的模型',
  'option.loadError': '目录加载失败：{message}',
  'trigger.fallback': '请选择模型',
  'trigger.loading': '正在加载模型…',
  'trigger.selectAria': '请选择模型',
  'trigger.aria': '选择模型，当前 {model}',
  'trigger.ariaEffort': '选择模型，当前 {model}，推理等级 {effort}',
  'trigger.ariaThinking': '选择模型，当前 {model}，思考模式 {effort}',
  'menu.aria': '模型与推理等级',
  'menu.ariaThinking': '模型与思考模式',
  'menu.model': '模型',
  'menu.effort': '推理等级',
  'menu.thinking': '思考模式',
  'effort.providerDefault': 'Default',
  'capacity.context': '上下文 {tokens}',
  'capacity.output': '最大输出 {tokens}',
  'blocked.noModels': '网关尚未验证任何模型。应用会自动重试；较慢的模型检查可能需要最多两分钟。',
  'blocked.unavailable': '已保存的模型尚未通过网关验证。请选择列表中的模型以继续。',
  'blocked.choose': '请选择一个可用模型以继续。',
  'status.loading': '正在刷新模型列表…',
  'status.catalogRefreshing': '正在更新模型目录…',
  'status.freeModelsLoading': '正在加载免费模型…',
  'error.action': '模型操作失败：{message}',
  'error.sessionInUse': '当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。',
  'action.reload': '重新加载',
  'warning.groupLoad': '{name} 加载失败：{message}',
  'search.placeholder': '搜索模型…',
  'search.clear': '清除搜索',
  'search.empty': '没有匹配的模型。',
  'empty.models': '网关尚未验证任何模型。应用会自动重试；较慢的模型检查可能需要最多两分钟。',
  'empty.efforts': '当前模型未提供推理等级。',
} satisfies Record<string, string>

/** The model namespace key union. */
export type ModelKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'provider.account': 'DeepSeek Account',
  'command.label': 'Model',
  'command.description': 'Select the model for this conversation',
  'option.loadError': 'Catalog failed to load: {message}',
  'trigger.fallback': 'Select model',
  'trigger.loading': 'Loading models…',
  'trigger.selectAria': 'Select model',
  'trigger.aria': 'Select model, current {model}',
  'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
  'trigger.ariaThinking': 'Select model, current {model}, thinking {effort}',
  'menu.aria': 'Model and reasoning effort',
  'menu.ariaThinking': 'Model and thinking',
  'menu.model': 'Model',
  'menu.effort': 'Effort',
  'menu.thinking': 'Thinking',
  'effort.providerDefault': 'Default',
  'capacity.context': 'Context {tokens}',
  'capacity.output': 'Max output {tokens}',
  'status.loading': 'Refreshing model list…',
  'status.catalogRefreshing': 'Updating catalog…',
  'status.freeModelsLoading': 'Loading free models…',
  'error.action': 'Model operation failed: {message}',
  'error.sessionInUse': 'This session is already in use, possibly by another running DSH instance (such as dsh web or the desktop app). Quit other running DSH instances and try again.',
  'action.reload': 'Reload',
  'warning.groupLoad': '{name} failed to load: {message}',
  'blocked.noModels': 'The gateway has not verified any models yet. The app retries automatically; a slow model check can take up to two minutes.',
  'blocked.unavailable': 'The saved model has not been verified by the gateway. Choose a listed model to continue.',
  'blocked.choose': 'Choose an available model to continue.',
  'search.placeholder': 'Search models…',
  'search.clear': 'Clear search',
  'search.empty': 'No matching models.',
  'empty.models': 'The gateway has not verified any models yet. The app retries automatically; a slow model check can take up to two minutes.',
  'empty.efforts': 'This model provides no reasoning effort levels.',
} satisfies Record<ModelKey, string>

/** Spanish translations retain the fork copy and inherit new upstream keys from English. */
export const es = {
  ...en,
  "command.description": "Seleccionar el modelo para esta conversación",
  "option.loadError": "No se pudo cargar el catálogo: {message}",
  "trigger.fallback": "Seleccionar modelo",
  "trigger.loading": "Cargando modelos…",
  "trigger.selectAria": "Seleccionar modelo",
  "trigger.aria": "Seleccionar modelo, actual {model}",
  "trigger.ariaEffort": "Seleccionar modelo, actual {model}, esfuerzo de razonamiento {effort}",
  "trigger.ariaThinking": "Seleccionar modelo, actual {model}, pensamiento {effort}",
  "menu.aria": "Modelo y esfuerzo de razonamiento",
  "menu.ariaThinking": "Modelo y pensamiento",
  "menu.model": "Modelo",
  "menu.effort": "Esfuerzo",
  "menu.thinking": "Pensamiento",
  "effort.providerDefault": "Predeterminado",
  "capacity.context": "Contexto {tokens}",
  "capacity.output": "Salida máx. {tokens}",
  "status.loading": "Actualizando lista de modelos…",
  "status.catalogRefreshing": "Actualizando catálogo…",
  "status.freeModelsLoading": "Cargando modelos free…",
  "error.action": "Error en la operación del modelo: {message}",
  "action.reload": "Recargar",
  "blocked.noModels": "La pasarela aún no verificó ningún modelo. La app vuelve a intentarlo automáticamente; una comprobación lenta puede tardar hasta dos minutos.",
  "blocked.unavailable": "El modelo guardado todavía no fue verificado por la pasarela. Elegí un modelo de la lista para continuar.",
  "blocked.choose": "Elegí un modelo disponible para continuar.",
  "warning.groupLoad": "{name} no se pudo cargar: {message}",
  "empty.models": "La pasarela aún no verificó ningún modelo. La app vuelve a intentarlo automáticamente; una comprobación lenta puede tardar hasta dos minutos.",
  "blocked.composer": "Este modelo no está disponible — seleccione uno para continuar",
  "empty.efforts": "Este modelo no ofrece niveles de esfuerzo de razonamiento.",
}
