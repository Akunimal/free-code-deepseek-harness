# Optional free-only fallback / Respaldo opcional gratuito

## English
The 0.9.4 candidate prepares the pinned OmniRoute 3.8.51 runtime in the
background on first launch. The installer carries only its SHA-256/size/URL
descriptor, not the dependency tree. Preparation never blocks DSH or the UI.
A valid verified cache works offline; interruption, a bad checksum or an unsafe
archive cannot replace a working installation. Missing unpublished release
assets are reported as optional preparation unavailable, not a DSH failure.

After nine consecutive completed primary misses and at least four minutes,
the shell lazily starts its hidden, loopback-only OmniRoute server in private
app-owned data. Only `auto/coding:free` is probed and only HTTP 200 responders
enter the selector. Empty free pools never escalate to paid models. Automatic
selection changes only an OpenCode Free default; unrelated providers stay
untouched. The previous default is restored on primary recovery, unless the
user changed it. Notices are localized and deduplicated per outage. Cold-model
probes keep the full 120-second deadline; a pending probe is not a failure.
The first recovery window is followed by up to eight bounded warm-up retries
when the optional runtime is not usable yet, rather than immediately waiting
30 minutes. Optional upstream ranking/statistics synchronization is disabled
for this private fallback so a slow metadata site cannot hold up the catalog.

Local preparation/policy checks pass; real-server and release validation remain
pending. The separate runtime assets must be available before first download.

## Español
El candidato 0.9.4 prepara OmniRoute 3.8.51 en segundo plano al primer inicio.
El instalador lleva solo el descriptor SHA-256/tamaño/URL, no las dependencias.
La preparación nunca bloquea DSH ni la interfaz. La caché verificada funciona
sin conexión; una interrupción, checksum incorrecto o archivo inseguro no
reemplaza una instalación válida. Si faltan assets aún no publicados, se
informa que el respaldo opcional no está disponible; DSH sigue funcionando.

Tras nueve fallos consecutivos completados y al menos cuatro minutos, la shell
inicia OmniRoute oculto, solo en loopback y con datos privados de la app. Solo
se prueba `auto/coding:free` y solo respuestas HTTP 200 entran al selector. Un
pool gratuito vacío nunca escala a modelos pagos. El cambio automático solo
afecta al default de OpenCode Free; se respetan otros proveedores. Al recuperarse
el primario se restaura el default anterior, salvo que lo hayas cambiado. Los
avisos están traducidos y no se repiten por cada refresco. Las pruebas conservan
120 segundos para modelos fríos; una prueba en curso no cuenta como fallo.
Después de la ventana inicial hay hasta ocho reintentos acotados para el
respaldo que aún se está preparando, sin saltar inmediatamente a 30 minutos.
Se deshabilita la sincronización opcional de rankings/estadísticas del respaldo
privado: un sitio de metadatos lento no debe frenar su catálogo.

Pruebas locales de preparación/política verificadas; servidor real y release
pendientes. Los runtimes separados deben estar disponibles para descargarlos.
