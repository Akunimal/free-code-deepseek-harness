type Locale = 'es' | 'en';

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
  'menu.checkUpdates': { es: 'Buscar actualizaciones', en: 'Check for updates' },
  'menu.about': { es: 'Acerca de', en: 'About' },

  // Tray
  'tray.show': { es: 'Mostrar', en: 'Show' },

  // Notifications
  'notify.ready.title': { es: 'Harness listo', en: 'Harness ready' },

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
  'update.notNow': { es: 'Ahora no', en: 'Not now' },
  'update.failed.title': { es: 'No se pudo actualizar', en: 'Update failed' },
  'update.failed.message': { es: 'La descarga falló.', en: 'Download failed.' },

  'update.upstream.title': { es: 'Harness original actualizado', en: 'Original harness updated' },
  'update.upstream.message': {
    es: 'Hay un commit nuevo de deepseek-ai/deepseek-harness.',
    en: 'There is a new commit from deepseek-ai/deepseek-harness.',
  },
  'update.upstream.detail': {
    es: 'En este checkout local se puede sincronizar la subtree, ejecutar los tests y recompilar el escritorio automáticamente. El árbol debe estar limpio.',
    en: 'In this local checkout you can synchronize the subtree, run the tests and rebuild the desktop automatically. The working tree must be clean.',
  },
  'update.upstream.action': { es: 'Actualizar y recompilar', en: 'Update and rebuild' },

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

  'update.localFailed.title': { es: 'No se pudo actualizar upstream', en: 'Could not update upstream' },
  'update.localComplete.title': { es: 'Actualización completa', en: 'Update complete' },
  'update.localComplete.message': {
    es: 'Upstream se sincronizó y el build de escritorio terminó correctamente. Reiniciá el checkout de desarrollo para probarlo.',
    en: 'Upstream was synchronized and the desktop build completed successfully. Restart the development checkout to test it.',
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

  // Version label
  'version.new': { es: 'nueva', en: 'new' },
  'version.unknown': { es: 'desconocido', en: 'unknown' },
} as const satisfies Record<string, Record<Locale, string>>;

export type I18nKey = keyof typeof strings;

let currentLocale: Locale = 'en';

export function initLocale(electronLocale: string): void {
  currentLocale = electronLocale.startsWith('es') ? 'es' : 'en';
}

export function t(key: I18nKey, ...args: (string | number)[]): string {
  const entry = strings[key];
  let text: string = entry[currentLocale];
  for (let i = 0; i < args.length; i++) {
    text = text.replace(`$${i + 1}`, String(args[i]));
  }
  return text;
}

export function locale(): Locale {
  return currentLocale;
}
