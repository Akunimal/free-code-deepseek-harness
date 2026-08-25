export type Locale = 'zh' | 'es' | 'en';

const strings = {
  // Menu
  'menu.file': { es: 'Archivo', en: 'File' },
  'menu.pool': { es: 'Pool', en: 'Pool' },
  'menu.poolStatus': { es: 'Estado del pool…', en: 'Pool status…' },
  'menu.restartHarness': { es: 'Reiniciar harness', en: 'Restart harness' },
  'menu.quit': { es: 'Salir', en: 'Quit' },
  'menu.view': { es: 'Ver', en: 'View' },
  'menu.window': { es: 'Ventana', en: 'Window' },
  'menu.help': { es: 'Ayuda', en: 'Help' },
  'menu.about': { es: 'Acerca de', en: 'About' },
  'menu.aboutMessage': { es: 'FreeCode DeepSeek Harness\nVersión $1', en: 'FreeCode DeepSeek Harness\nVersion $1' },
  'menu.embeddedBrowser': { es: 'Navegador embebido', en: 'Embedded browser' },

  // Embedded browser chrome
  'browser.title': { es: 'Navegador', en: 'Browser' },
  'browser.browser': { es: 'Navegador', en: 'Browser' },
  'browser.newTab': { es: 'Nueva pestaña', en: 'New tab' },
  'browser.open': { es: 'Abrir navegador', en: 'Open browser' },
  'browser.close': { es: 'Cerrar pestaña', en: 'Close tab' },
  'browser.back': { es: 'Atrás', en: 'Back' },
  'browser.forward': { es: 'Adelante', en: 'Forward' },
  'browser.reload': { es: 'Recargar', en: 'Reload' },
  'browser.go': { es: 'Ir', en: 'Go' },
  'browser.addressPlaceholder': { es: 'Escribí una URL https://…', en: 'Enter an https:// URL…' },
  'browser.hide': { es: 'Ocultar navegador', en: 'Hide browser' },
  'browser.show': { es: 'Abrir', en: 'Open' },
  'browser.noTabs': { es: 'No hay pestañas abiertas', en: 'No open tabs' },
  'browser.loading': { es: 'Cargando…', en: 'Loading…' },

  // Automatic update indicator beside Settings
  'update.indicator': { es: 'Actualización disponible', en: 'Update available' },

  // Tray
  'tray.show': { es: 'Mostrar', en: 'Show' },
  'tray.tooltip': { es: 'FreeCode DeepSeek Harness', en: 'FreeCode DeepSeek Harness' },

  // Notifications
  'notify.ready.title': { es: 'Harness listo', en: 'Harness ready' },
  'status.catalog.down.title': { es: 'Catálogo de modelos no disponible', en: 'Model catalog unavailable' },
  'status.catalog.down.message': {
    es: 'No se pudo consultar el catálogo. Se conserva la última selección válida y se reintentará automáticamente.',
    en: 'The catalog could not be reached. The last valid selection is preserved and a retry is scheduled.',
  },
  'status.catalog.degraded.title': { es: 'Catálogo de modelos degradado', en: 'Model catalog degraded' },
  'status.catalog.degraded.message': {
    es: 'El catálogo respondió, pero ningún modelo pasó la prueba. No se borró la configuración anterior.',
    en: 'The catalog responded, but no model passed the probe. The previous configuration was kept.',
  },
  'status.catalog.ready.title': { es: 'Catálogo de modelos recuperado', en: 'Model catalog recovered' },
  'status.catalog.ready.message': { es: 'La detección automática de modelos volvió a funcionar.', en: 'Automatic model discovery is working again.' },
  'status.pool.down.title': { es: 'Pool opencode2api no disponible', en: 'opencode2api pool unavailable' },
  'status.pool.down.message': {
    es: 'No hay workers opencode2api listos. El problema es del puente local, no de la API key.',
    en: 'No opencode2api workers are ready. This is a local bridge problem, not an API-key problem.',
  },
  'status.pool.ready.title': { es: 'Pool opencode2api recuperado', en: 'opencode2api pool recovered' },
  'status.pool.ready.message': { es: 'Hay workers listos nuevamente.', en: 'Ready workers are available again.' },

  // Update dialogs
  'update.available.title': { es: 'Actualización disponible', en: 'Update available' },
  'update.available.message': {
    es: 'FreeCode DeepSeek Harness $1 está disponible.',
    en: 'FreeCode DeepSeek Harness $1 is available.',
  },
  'update.available.upstreamSuffix': {
    es: '\nTambién hay cambios nuevos en el harness original.',
    en: '\nThere are also new changes in the original harness.',
  },
  'update.available.detail': {
    es: 'La aplicación descargará la release y se reiniciará para instalarla.',
    en: 'The application will download the release and restart to install it.',
  },
  'update.download': { es: 'Descargar e instalar', en: 'Download and install' },
  'update.downloadHarness': { es: 'Actualizar solo Harness', en: 'Update Harness only' },
  'update.notNow': { es: 'Ahora no', en: 'Not now' },
  'update.failed.title': { es: 'No se pudo actualizar', en: 'Update failed' },
  'update.failed.message': { es: 'La descarga falló.', en: 'Download failed.' },
  'update.harnessAvailable.title': { es: 'Actualización del Harness disponible', en: 'Harness update available' },
  'update.harnessAvailable.message': {
    es: 'El runtime DeepSeek Harness $1 está disponible.',
    en: 'DeepSeek Harness runtime $1 is available.',
  },
  'update.harnessAvailable.detail': {
    es: 'Se reemplazará solo el runtime del Harness y se reiniciará ese proceso. La aplicación, el pool opencode2api, Tor y tus datos quedan intactos.',
    en: 'Only the Harness runtime will be replaced and that process will restart. The app, opencode2api pool, Tor, and your data stay intact.',
  },
  'update.harnessComplete.title': { es: 'Harness actualizado', en: 'Harness updated' },
  'update.harnessComplete.message': {
    es: 'El runtime del Harness se actualizó sin reemplazar la aplicación ni el pool.',
    en: 'The Harness runtime was updated without replacing the app or the pool.',
  },

  'update.upstream.title': { es: 'Harness original actualizado', en: 'Original harness updated' },
  'update.upstream.message': {
    es: 'Hay un commit nuevo de deepseek-ai/deepseek-harness.',
    en: 'There is a new commit from deepseek-ai/deepseek-harness.',
  },
  'update.upstream.detail': {
    es: 'En este checkout local se puede sincronizar la subtree y recompilar solo el runtime del Harness. El shell, opencode2api y Tor quedan intactos. El árbol debe estar limpio.',
    en: 'In this local checkout you can synchronize the subtree and rebuild only the Harness runtime. The shell, opencode2api, and Tor stay intact. The working tree must be clean.',
  },
  'update.upstream.action': { es: 'Actualizar Harness', en: 'Update Harness' },

  'update.upstreamOnly.title': { es: 'Upstream tiene cambios nuevos', en: 'Upstream has new changes' },
  'update.upstreamOnly.message': {
    es: 'El harness original avanzó, pero todavía no hay una release del fork para instalar.',
    en: 'The original harness has advanced, but there is no fork release to install yet.',
  },
  'update.upstreamOnly.detail': {
    es: 'Este portable es autocontenido y no trae Git, pnpm ni el toolchain para recompilar. Cuando el fork publique la próxima release, aparecerá aquí para descargarla e instalarla.',
    en: 'This portable is self-contained and does not include Git, pnpm or the toolchain to rebuild. When the fork publishes the next release, it will appear here for download and install.',
  },

  'update.checkFailed.title': { es: 'No se pudo completar la comprobación', en: 'Could not complete check' },
  'update.noUpdates.title': { es: 'Sin actualizaciones', en: 'No updates' },
  'update.checkFailed.message': { es: 'La comprobación de releases falló.', en: 'Release check failed.' },
  'update.noUpdates.message': { es: 'Ya estás usando la versión disponible.', en: 'You are using the latest available version.' },
  'update.upstreamCheckError': {
    es: 'No se pudo consultar upstream: $1',
    en: 'Could not check upstream: $1',
  },
  'update.harnessCheckError': {
    es: 'No se pudo consultar el runtime del Harness: $1',
    en: 'Could not check the Harness runtime: $1',
  },

  'update.localFailed.title': { es: 'No se pudo actualizar upstream', en: 'Could not update upstream' },
  'update.localComplete.title': { es: 'Actualización completa', en: 'Update complete' },
  'update.localComplete.message': {
    es: 'Upstream se sincronizó y el runtime del Harness terminó correctamente. El shell y opencode2api no fueron reemplazados; reiniciá el checkout de desarrollo para probarlo.',
    en: 'Upstream was synchronized and the Harness runtime rebuilt successfully. The shell and opencode2api were not replaced; restart the development checkout to test it.',
  },
  'update.localIncomplete.title': { es: 'Actualización incompleta', en: 'Incomplete update' },
  'update.localIncomplete.message': {
    es: 'La sincronización o recompilación terminó con código $1. Revisá la terminal del checkout.',
    en: 'Synchronization or rebuild finished with code $1. Check the checkout terminal.',
  },

  // Stuck dialog
  'stuck.title': { es: 'El harness no pudo arrancar', en: 'Harness failed to start' },
  'stuck.message': {
    es: 'El proceso dsh falló $1 veces seguidas sin alcanzar readiness.',
    en: 'The dsh process failed $1 times in a row without reaching readiness.',
  },
  'stuck.detail': {
    es: 'Revisá el log en:\n$1',
    en: 'Check the log at:\n$1',
  },
  'stuck.retry': { es: 'Reintentar', en: 'Retry' },
  'stuck.close': { es: 'Cerrar', en: 'Close' },

  // Overlay
  'overlay.title': { es: 'Estado del pool', en: 'Pool status' },
  'overlay.workersLabel': { es: 'Workers paralelos:', en: 'Parallel workers:' },
  'overlay.workersNote': {
    es: 'El pool arranca con 6 workers y reparte requests en round-robin. Son sesiones locales, no cuentas extra de OpenCode ni una forma de eludir límites upstream/IP.',
    en: 'The pool starts with 6 workers and distributes requests round-robin. These are local sessions, not extra OpenCode accounts or a way to bypass upstream/IP limits.',
  },
  'overlay.refresh': { es: 'Actualizar', en: 'Refresh' },

  // Splash
  'splash.loading': { es: 'Iniciando harness…', en: 'Starting harness…' },
  'splash.pool': { es: 'Preparando pool de workers…', en: 'Preparing worker pool…' },

  // Portable stale warning
  'portable.stale.title': { es: 'Portable desactualizado', en: 'Outdated portable' },
  'portable.stale.message': {
    es: 'Hay una versión instalada más reciente ($1). Este portable ($2) puede tener errores ya corregidos. Actualizá el portable o eliminalo.',
    en: 'A newer installed version ($1) exists. This portable ($2) may have bugs already fixed. Update or remove this portable.',
  },

  // Dialog bridge
  'dialog.selectWorkspace': { es: 'Seleccionar carpeta de trabajo', en: 'Select Workspace Directory' },

  // Auto-enable Tor Fleet when the whole pool is rate-limited
  'tor.auto.title': { es: 'Tor Fleet activado', en: 'Tor Fleet enabled' },
  'tor.auto.message': {
    es: 'Todos los workers recibieron rate limit (429). Se activó Tor Fleet para rotar las IPs de salida y sortear el límite.',
    en: 'Every worker was rate-limited (429). Tor Fleet was enabled to rotate exit IPs and route around the limit.',
  },
  'tor.auto.detail': {
    es: 'Esperá más latencia: el tráfico ahora pasa por circuitos Tor. Podés desactivarlo cuando el límite se libere.',
    en: 'Expect higher latency: traffic now routes through Tor circuits. You can turn it off once the limit clears.',
  },
  'tor.auto.keep': { es: 'Mantener activado', en: 'Keep enabled' },
  'tor.auto.disable': { es: 'Desactivar', en: 'Disable' },

  // Startup preflight failure — installer bug or corrupted install
  'preflight.title': { es: 'Instalación incompleta', en: 'Install incomplete' },
  'preflight.reinstallHint': {
    es: 'Reinstalá FreeCode desde el instalador oficial (v0.2.4 o posterior).',
    en: 'Reinstall FreeCode from the official installer (v0.2.4 or later).',
  },

  // Version label
  'version.new': { es: 'nueva', en: 'new' },
  'version.unknown': { es: 'desconocido', en: 'unknown' },
} as const satisfies Record<string, Record<'es' | 'en', string>>;

export type I18nKey = keyof typeof strings;

/** Native-shell Chinese copy. Keep this key-complete with `strings`. */
const zhStrings = {
  'menu.file': '文件',
  'menu.pool': '池',
  'menu.poolStatus': '池状态…',
  'menu.restartHarness': '重启 Harness',
  'menu.quit': '退出',
  'menu.view': '查看',
  'menu.window': '窗口',
  'menu.help': '帮助',
  'menu.about': '关于',
  'menu.aboutMessage': 'FreeCode DeepSeek Harness\n版本 $1',
  'menu.embeddedBrowser': '内嵌浏览器',
  'browser.title': '浏览器',
  'browser.browser': '浏览器',
  'browser.newTab': '新标签页',
  'browser.open': '打开浏览器',
  'browser.close': '关闭标签页',
  'browser.back': '后退',
  'browser.forward': '前进',
  'browser.reload': '重新加载',
  'browser.go': '前往',
  'browser.addressPlaceholder': '输入 https://… 地址',
  'browser.hide': '隐藏浏览器',
  'browser.show': '打开',
  'browser.noTabs': '没有打开的标签页',
  'browser.loading': '正在加载…',
  'update.indicator': '发现更新',
  'tray.show': '显示',
  'tray.tooltip': 'FreeCode DeepSeek Harness',
  'notify.ready.title': 'Harness 已就绪',
  'status.catalog.down.title': '模型目录不可用',
  'status.catalog.down.message': '无法访问模型目录。已保留上一次有效选择，并会自动重试。',
  'status.catalog.degraded.title': '模型目录服务降级',
  'status.catalog.degraded.message': '目录已响应，但没有模型通过测试。之前的配置未被删除。',
  'status.catalog.ready.title': '模型目录已恢复',
  'status.catalog.ready.message': '自动发现模型已恢复正常。',
  'status.pool.down.title': 'opencode2api 池不可用',
  'status.pool.down.message': '当前没有就绪的 opencode2api worker。这是本地桥接问题，不是 API key 问题。',
  'status.pool.ready.title': 'opencode2api 池已恢复',
  'status.pool.ready.message': '已有 worker 再次就绪。',
  'update.available.title': '发现更新',
  'update.available.message': 'FreeCode DeepSeek Harness $1 可用。',
  'update.available.upstreamSuffix': '\n原始 Harness 也有新的更改。',
  'update.available.detail': '应用将下载此版本并重启以完成安装。',
  'update.download': '下载并安装',
  'update.downloadHarness': '仅更新 Harness',
  'update.notNow': '暂不更新',
  'update.failed.title': '更新失败',
  'update.failed.message': '下载失败。',
  'update.harnessAvailable.title': 'Harness 有可用更新',
  'update.harnessAvailable.message': 'DeepSeek Harness runtime $1 可用。',
  'update.harnessAvailable.detail': '只会替换 Harness runtime 并重启该进程。应用、opencode2api 池、Tor 和你的数据均保持不变。',
  'update.harnessComplete.title': 'Harness 已更新',
  'update.harnessComplete.message': 'Harness runtime 已更新，应用和池未被替换。',
  'update.upstream.title': '原始 Harness 已更新',
  'update.upstream.message': 'deepseek-ai/deepseek-harness 有新的 commit。',
  'update.upstream.detail': '可以在本地 checkout 中同步 subtree，并只重新构建 Harness runtime。Shell、opencode2api 和 Tor 保持不变。工作树必须干净。',
  'update.upstream.action': '更新 Harness',
  'update.upstreamOnly.title': 'Upstream 有新的更改',
  'update.upstreamOnly.message': '原始 Harness 已前进，但 fork 还没有可安装的 release。',
  'update.upstreamOnly.detail': '此 portable 自包含，不附带 Git、pnpm 或构建工具链。fork 发布下一版 release 后，便可在此下载并安装。',
  'update.checkFailed.title': '检查未完成',
  'update.noUpdates.title': '没有更新',
  'update.checkFailed.message': '检查 release 失败。',
  'update.noUpdates.message': '你正在使用当前可用版本。',
  'update.upstreamCheckError': '无法检查 upstream：$1',
  'update.harnessCheckError': '无法检查 Harness runtime：$1',
  'update.localFailed.title': '无法更新 upstream',
  'update.localComplete.title': '更新完成',
  'update.localComplete.message': 'Upstream 已同步，Harness runtime 也已成功构建。Shell 和 opencode2api 未被替换；请重启开发 checkout 进行测试。',
  'update.localIncomplete.title': '更新未完成',
  'update.localIncomplete.message': '同步或重新构建以代码 $1 结束。请检查 checkout 终端。',
  'stuck.title': 'Harness 无法启动',
  'stuck.message': 'dsh 进程连续失败 $1 次，始终未达到就绪状态。',
  'stuck.detail': '请检查日志：\n$1',
  'stuck.retry': '重试',
  'stuck.close': '关闭',
  'overlay.title': '池状态',
  'overlay.workersLabel': '并行 worker：',
  'overlay.workersNote': '池启动 6 个 worker，并以 round-robin 分配请求。这些是本地会话，不是额外的 OpenCode 账号，也不是绕过 upstream/IP 限制的方式。',
  'overlay.refresh': '刷新',
  'splash.loading': '正在启动 Harness…',
  'splash.pool': '正在准备 worker 池…',
  'portable.stale.title': 'Portable 已过时',
  'portable.stale.message': '检测到更新的安装版本 ($1)。此 Portable ($2) 可能存在已修复的问题。请更新或移除此 Portable。',
  'dialog.selectWorkspace': '选择工作目录',
  'tor.auto.title': 'Tor Fleet 已启用',
  'tor.auto.message': '所有 worker 都被限流（429）。已启用 Tor Fleet 以轮换出口 IP 绕过限制。',
  'tor.auto.detail': '延迟会更高：流量现在通过 Tor 线路。限制解除后可以关闭。',
  'tor.auto.keep': '保持启用',
  'tor.auto.disable': '禁用',
  'preflight.title': '安装不完整',
  'preflight.reinstallHint': '请从官方安装程序重新安装 FreeCode（v0.2.4 或更高版本）。',
  'version.new': '新版本',
  'version.unknown': '未知',
} as const satisfies Record<I18nKey, string>;

let currentLocale: Locale = 'en';

export function initLocale(electronLocale: string): void {
  currentLocale = electronLocale.startsWith('zh') ? 'zh' : electronLocale.startsWith('es') ? 'es' : 'en';
}

/** Set the native shell language after the web locale selector changes. */
export function setLocale(value: string): void {
  currentLocale = value === 'zh' ? 'zh' : value === 'es' ? 'es' : 'en';
}

export function t(key: I18nKey, ...args: (string | number)[]): string {
  const entry = strings[key];
  let text: string = currentLocale === 'zh' ? zhStrings[key] : entry[currentLocale];
  for (let i = 0; i < args.length; i++) {
    text = text.replace(`$${i + 1}`, String(args[i]));
  }
  return text;
}

export function locale(): Locale {
  return currentLocale;
}
