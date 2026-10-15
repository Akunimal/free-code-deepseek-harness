# FreeCode DeepSeek Harness v0.9.4 — Candidate

## English

**Status: candidate; not yet published.** v0.9.3 remains the latest published
Windows x64 release. These notes describe the local source candidate, not a
release announcement. The latest pre-fix alpha5 setup and portable are in
`apps/shell/release-0.9.4-alpha5-candidate-20261014/` (setup: 178,630,999 bytes,
SHA-256 `3117054ba2ee29c6c9993e7f7cdd525262f8d39e4f037e037c411142659d8a08`;
portable: 178,255,861 bytes, SHA-256
`79e03080494efcd9fc9f06311b1b4f78238e57b97fd2ea00ba97baa5513f520b`). The setup
was executed after the matching alpha5 runtime had been locally precached; NSIS
returned exit code 0. The user then tried the installed candidate and reported
only one model plus upstream/API-key, connection and unsupported-protocol errors.
These alpha5 desktop artifacts predate V094-21 and are superseded; do not use
them to validate or publish this source. The alpha5 DSH archive is locally
verified but unpublished, so clean installations still require a matching
release asset. A fresh desktop build and release gate are pending in
`apps/shell/release-0.9.4-model-resilience-20261015/`; neither has been run yet.
The v0.9.4 candidate remains unpublished.

Historical runtime note: the earlier alpha4 setup's first launch reported
`No harness runtime asset for packaged version 0.2.1-alpha.4 (win32-x64)`.
That local-only alpha4 cache workaround did not satisfy the later alpha5 pin.

### What's new

- **Browser-first system prompt.** For tasks needing web information, use the
  embedded `computer_use` browser before DeepSeek API `web_search`. API fallback
  is reserved for browser unavailability, blocked access or failed attempts,
  with the limitation disclosed. Tool scopes and user permissions remain
  respected. DSH `0.2.1-alpha.5` is locally rebuilt and its archive, SHA-256,
  Electron ABI and Node engine are verified; it is not published remotely yet.
- **OmniRoute removed.** No optional runtime download, automatic fallback,
  server or detector remains. Next-start migration retires only FreeCode-owned
  legacy configuration and verified caches; user providers/history are preserved.
- **Invalid `pash` calls repaired at the bridge.** Exact `pash` becomes `bash`
  only when the original client declares unambiguous, permitted `bash`.
  Stream fragments, tool IDs and arguments are preserved; no fuzzy correction,
  permission bypass or request replay. Packaging rejects stale sidecar builds.
- **opencode2api v1.3.8** replaces v1.3.5. Manual model selection survives
  refreshes, temporary probe failures recover, and canonical/stable request and
  session identities are preserved. FreeCode's anonymous lane still tries
  Direct first and advances to Tor only after a non-2xx response in the same request.
- **Model availability and Tor route health corrected (V094-21).** Seed the
  live provider catalog before starting DSH so stale unsupported IDs cannot be
  selected; send model probes with Muse Spark's minimum 16-token output budget;
  and do not cool Direct/Tor for upstream HTTP 400/401/403 responses. HTTP 429,
  5xx and transport failures still use route cooldown/failover. A real upstream
  401/403 still means that provider denied access and must be resolved upstream.
- **Tor availability and failover hardened.** The ControlPort uses SAFECOOKIE;
  readiness waits for authenticated bootstrap progress 100% and a usable SOCKS
  listener. Circuit-timeout learning stays adaptive, with the stable 600-second
  circuit dirtiness interval. Startup is monitored asynchronously so direct
  traffic stays available; the overlay shows bounded, redacted process and
  `tor.log` diagnostics, and a slow start can be cancelled. Retry preserves the
  same SOCKS endpoint, while a local SOCKS probe restores an unhealthy route
  every 10 seconds without extra public health checks. Tor executable and both
  GeoIP databases are SHA-256-checked before packaging and after copying.
- **Tor-unavailable root cause corrected in the smoke harness.** The NSIS smoke
  passed Chromium's `--user-data-dir`, but Electron's `app.getPath('userData')`
  followed `APPDATA`. It therefore wrote Tor config into the maintainer profile
  with GeoIP paths under a disposable install directory. The smoke now redirects
  APPDATA, LOCALAPPDATA, USERPROFILE, HOME, TEMP and TMP into its own test tree.
- **Conversation backgrounds reach the package.** Runtime packaging checks
  materialized and copied DSH bundles, and electron-builder rejects a stale
  embedded bundle. Reduced motion stops animation without dimming the visible
  background; a rendered-pixel regression checks normal and reduced-motion paint.
- **Runtime pins stay aligned.** The package step refreshes version/SHA-256 only
  for locally built opencode2api and DSH artifacts, leaves external Tor pins
  explicit, and treats absent optional PATH-fallback tools as optional.
- **Gentle AI is selectable again.** It is an explicit opt-in Web mode based on
  the Standard composition; Standard remains the default.

### Candidate verification

Before V094-21, the alpha5 candidate's release gate and static desktop-asset
checks passed; that evidence applies only to the superseded binaries above. For
V094-21, TDD RED reproduced stale startup ordering, the invalid probe budget and
HTTP-403 route cooldown. GREEN: focused shell tests passed 35/35, shell typecheck
passed, and `go test ./...` passed 43 tests across 13 Go packages. The full shell
suite reported 44/46 files and 342/344 tests: the packaged Tor startup test timed
out at 15 s and the DSH supervisor readiness smoke timed out at 120 s. Both now
pass in isolation: Tor 1/1 (1.58 s) and supervisor 5/5 (102.47 s total, real CLI
readiness at 80.10 s). The full release gate and fresh desktop build remain
pending, so the previous alpha5 setup/portable are superseded and no current
installer contains V094-21. The active FreeCode instance was not interrupted.
No tag or public v0.9.4 release exists.

## Español

**Estado: candidata; todavía no publicada.** v0.9.3 sigue siendo la última release
publicada para Windows x64. Estas notas describen el código local, no anuncian
una release. El setup/portable alpha5 anterior a V094-21 está en
`apps/shell/release-0.9.4-alpha5-candidate-20261014/` (setup: 178.630.999 bytes,
SHA-256 `3117054ba2ee29c6c9993e7f7cdd525262f8d39e4f037e037c411142659d8a08`;
portable: 178.255.861 bytes, SHA-256
`79e03080494efcd9fc9f06311b1b4f78238e57b97fd2ea00ba97baa5513f520b`). El setup
se ejecutó tras precargar localmente el runtime alpha5 correspondiente; NSIS
devolvió código 0. El usuario probó esa candidata instalada e informó que solo
aparece un modelo y que fallan requests con errores de upstream/API key,
conexión y protocolo no soportado. Estos artefactos alpha5 son anteriores a
V094-21 y quedaron obsoletos; no los uses para validar ni publicar esta fuente.
El archivo DSH alpha5 está verificado localmente, pero no publicado: una
instalación limpia todavía necesita el asset de release correspondiente. Falta
un nuevo build desktop y gate completo en
`apps/shell/release-0.9.4-model-resilience-20261015/`; todavía no se ejecutaron.
v0.9.4 continúa sin publicarse.

Nota histórica del runtime: el primer arranque del setup alpha4 anterior informó
`No harness runtime asset for packaged version 0.2.1-alpha.4 (win32-x64)`.
La precarga local alpha4 fue un workaround y no satisface el pin alpha5 posterior.

### Novedades

- **Navegador embebido primero en el prompt del sistema.** Si la tarea necesita
  información web, usar `computer_use` antes de DeepSeek API `web_search`.
  El fallback queda para navegador ausente, acceso bloqueado o intentos fallidos,
  informando la limitación. Se respetan scopes y permisos del usuario. DSH
  `0.2.1-alpha.5` se recompiló localmente y se verificaron el archivo, SHA-256,
  ABI de Electron y versión de Node; todavía no está publicado.
- **OmniRoute retirado.** Sin descarga opcional, fallback automático, servidor
  ni detector. La migración del próximo inicio retira solo la configuración
  antigua propia y cachés verificadas; conserva proveedores e historial del usuario.
- **Llamadas inválidas `pash` corregidas en el puente.** Solo se convierte el
  nombre exacto a `bash` si el cliente original declara `bash` permitido y sin
  ambigüedad. Conserva fragmentos, IDs y argumentos; sin corrección aproximada,
  salto de permisos ni repetición del request. El empaquetado rechaza binarios viejos.
- **opencode2api v1.3.8** reemplaza v1.3.5. La selección manual persiste al
  actualizar; se recupera de sondeos temporalmente fallidos y conserva
  identidades canónicas/estables de requests y sesiones. El lane anónimo de
  FreeCode sigue intentando Direct primero y pasa a Tor solo tras no-2xx en el
  mismo request.
- **Corregida la disponibilidad de modelos y la salud de rutas Tor (V094-21).**
  Se siembra el catálogo antes de iniciar DSH para no seleccionar IDs obsoletos;
  los probes usan el mínimo de 16 tokens de salida de Muse Spark; y respuestas
  upstream HTTP 400/401/403 ya no enfrían Direct/Tor. HTTP 429, 5xx y fallos de
  transporte sí conservan cooldown/failover. Un 401/403 real sigue indicando
  acceso denegado por el upstream y hay que resolverlo allí.
- **Disponibilidad y failover Tor reforzados.** El ControlPort usa SAFECOOKIE;
  la disponibilidad espera bootstrap autenticado al 100% y un listener SOCKS
  utilizable. El timeout de circuito sigue siendo adaptativo y se conserva el
  intervalo de 600 segundos para circuitos estables. El inicio se monitorea en
  segundo plano para mantener disponible la ruta directa; el overlay muestra
  diagnósticos acotados y saneados del proceso y de `tor.log`, y permite cancelar
  un inicio lento. Los reintentos mantienen el mismo endpoint SOCKS; una prueba
  local restaura la ruta cada 10 segundos sin sondeos públicos adicionales. El
  ejecutable Tor y ambas bases GeoIP se verifican por SHA-256 antes y después
  del empaquetado.
- **Corregida la causa de Tor no disponible en el smoke.** El NSIS smoke pasaba
  `--user-data-dir` de Chromium, pero Electron obtenía `app.getPath('userData')`
  desde `APPDATA`. Por eso escribió el torrc en el perfil real del mantenedor,
  con GeoIP apuntando a una instalación temporal ya eliminada. Ahora el smoke
  redirige APPDATA, LOCALAPPDATA, USERPROFILE, HOME, TEMP y TMP a su propio
  directorio temporal.
- **Los fondos de conversación llegan al paquete.** El empaquetado verifica
  bundles DSH materializados y copiados; electron-builder rechaza uno obsoleto.
  El movimiento reducido detiene la animación sin atenuar el fondo visible y
  una prueba de píxeles protege el render normal y con movimiento reducido.
- **Los pins runtime quedan alineados.** El empaquetado actualiza versión y
  SHA-256 solo para opencode2api/DSH generados localmente, mantiene explícito el
  pin externo de Tor y acepta herramientas opcionales ausentes si tienen
  fallback por PATH.
- **Gentle AI vuelve a ser seleccionable.** Es un modo Web optativo explícito
  basado en Standard; Standard sigue siendo el modo predeterminado.

### Verificación de la candidata

Antes de V094-21, el gate y la verificación estática de los binarios alpha5
pasaron; esa evidencia corresponde solo a los artefactos obsoletos de arriba.
En V094-21, TDD RED reprodujo el orden de arranque incorrecto, el presupuesto de
probe inválido y el cooldown por HTTP 403. GREEN: las pruebas focalizadas shell
pasaron 35/35, el typecheck shell pasó y `go test ./...` pasó 43 tests en 13
paquetes Go. La suite shell completa informó 44/46 archivos y 342/344 tests: el
startup Tor empaquetado agotó 15 s y el smoke de readiness DSH agotó 120 s. Ambos
ahora pasan aislados: Tor 1/1 (1,58 s) y supervisor 5/5 (102,47 s; readiness real
del CLI en 80,10 s). El gate completo y el nuevo build desktop siguen pendientes;
el setup/portable alpha5 anterior quedó obsoleto y ningún instalador actual trae
V094-21. No se interrumpió la instancia FreeCode activa. v0.9.4 no tiene tag ni
release pública.
