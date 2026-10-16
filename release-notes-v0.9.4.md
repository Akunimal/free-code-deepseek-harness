# FreeCode DeepSeek Harness v0.9.4 — Candidate

## English

### Current 0.9.4 candidate (alpha8)

The current candidate targets `apps/shell/release-0.9.4-alpha8-20261016/` and pins DSH 0.2.1-alpha.8 with opencode2api v1.4.0. V094-37 shows catalog refresh progress; V094-38 adds original animated backgrounds with 13 patterns, ASCII weather glyphs, faster motion during generation, a stable pattern while streaming, and a crossfade only after completion or stop; V094-39 preserves per-model context/output limits and supported reasoning efforts through the selector and context meter. The emitted alpha8 production bundle was rendered in Chromium: it held `aurora` during the stream, crossfaded to `ascii-stars` on stop, animated both ASCII patterns, resized correctly, and disabled canvas motion under reduced-motion preference. The inspected normal/reduced/gallery captures are in `D:/Temp/freecode-v094-alpha8-prod-render-20261016-r1/`. The candidate also includes active-profile/model synchronization, inference routing, and V094-35's composer recursion fix. The full non-interactive release gate passed; fresh setup/portable artifacts and the local runtime-preparation bundle were built, then statically verified without launching anything. The exact assets are listed below; the alpha7 executables in the following historical section are superseded. The alpha8 DSH runtime archive is local and checksum-verified but unpublished, so a clean install still needs that release asset or explicit local preparation. No setup was executed; FreeCode, its installed state and its user cache were not touched. Public-provider acceptance remains unverified. No tag, push, upload or release is included.

### Verified local alpha8 artifacts / Artefactos alpha8 locales verificados

The 0.9.4 NSIS setup and portable executable were built with electron-builder and
statically verified by `verify:desktop-release-assets`. The included local test
bundle passed `Prepare-Local-Runtime.ps1` in CHECK ONLY mode (SHA-256/size for
setup, portable and the exact DSH alpha8 runtime; no cache writes). The runtime
is a separate download asset and is not embedded in the desktop executables.
No setup or app was run or installed.

Output: `apps/shell/release-0.9.4-alpha8-20261016/`.

| Artifact / Artefacto | Bytes | SHA-256 |
|---|---:|---|
| Setup 0.9.4 | 178,757,839 bytes | `35b4f5eed71911c8048e32d60e64446701de907bb6c581a3c22d1f7e64371f66` |
| Portable 0.9.4 | 178,382,701 bytes | `c549b4e273c748980af632c14bacaeb45bd9d4877e7b839f610fe6cd74e20193` |
| DSH 0.2.1-alpha.8 runtime | 421,507,898 bytes | `bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6` |

### Previous local 0.9.4 candidate (alpha7; superseded)

That prior candidate targeted `apps/shell/release-0.9.4-alpha7-20261015/`, with DSH 0.2.1-alpha.7 and opencode2api v1.4.0. Alpha5 and alpha6 desktop builds are superseded; alpha6 predates V094-35, which prevents the localized model-block reason from recursively writing the composer store. Catalog/profile synchronization, public inference protocol routing, Hermes animation and the browser-first prompt remained part of that candidate. Its release gate passed and its local setup/portable assets were statically verified; historical hashes and sizes are listed in the following table. The alpha7 runtime is unpublished and was included in that local test bundle with a CHECK ONLY preflight. That build did not install or run setup or FreeCode. Public-provider acceptance remains unverified; no tag, upload or release was included. V094-21 historical fixes remain included.


**Status: locally built candidate; not yet published.** v0.9.3 remains the latest published
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
release asset. The earlier model-resilience build and gate in
`apps/shell/release-0.9.4-model-resilience-20261015/` ran, but the user rejected
those model/background results. Those artifacts are superseded by V094-24/25/26
and the current alpha7 candidate.
The v0.9.4 candidate remains unpublished.

### Verified local alpha7 artifacts (superseded) / Artefactos alpha7 locales verificados (obsoletos)

The non-interactive release gate passed; these artifacts were statically
verified only. / El gate no interactivo pasó; estos artefactos solo se verificaron
estáticamente. Nothing was installed, launched or published. / No se instaló,
ejecutó ni publicó nada. CHECK ONLY verified the bundle without reading or
changing the installed app/runtime cache. / CHECK ONLY verificó el bundle sin
leer ni cambiar la app instalada o su caché de runtime.

Output: `apps/shell/release-0.9.4-alpha7-20261015/`.

| Artifact / Artefacto | Bytes | SHA-256 |
|---|---:|---|
| Setup 0.9.4 | 178,750,879 bytes | `1e48c6c866a7b52d422eb62b852ffece4b6c5435aa3bbd490960e28395463440` |
| Portable 0.9.4 | 178,375,755 bytes | `91f720be4c140477d4d8b9d62b2cc2ba4a0fe97858d7551b38de60b7a2e3cba6` |
| DSH 0.2.1-alpha.7 | 421,460,196 bytes | `79880a1446175c20846318f478eec8d40c139b16b54a1f4d4ebc35cad39f3b3f` |

Historical runtime note: the earlier alpha4 setup's first launch reported
`No harness runtime asset for packaged version 0.2.1-alpha.4 (win32-x64)`.
That local-only alpha4 cache workaround did not satisfy the later alpha5 pin.

### What's new

- **Actual Hermes Phoenix backgrounds (V094-26).** Replaced the mistaken generic
  wash with the nine MIT-licensed Hermes particle patterns. They change on new
  work and every 45 seconds, run at 18 virtual steps/s idle versus 72 working,
  pause while hidden, and stop for reduced motion. Tests execute the unchanged
  emitted production panel/effect/CSS regions in isolated Chromium, check pixel
  motion, host resize, composer hit-testing, nine-pattern paint and cleanup.
  Screenshots exist locally; the installed alpha5 runtime is unchanged and does
  not contain this source correction. The fresh alpha7 runtime and desktop
  candidate passed the full release gate; the installed alpha5 runtime remains
  unchanged until the user chooses to test the local candidate.


- **Current upstream compatibility (V094-25).** Stable opencode2api v1.4.0 is
  imported with FreeCode routing/tool overlays retained. Anonymous inference
  and catalog discovery now have separate origins; the inference root resolves
  OpenAI/Anthropic protocol namespaces from the official OpenCode router instead
  of generating the invalid bare /inference/v1 route. Public session/request
  compatibility follows the tagged source. Go and isolated gateway fixtures
  validate multiple completions. Two authorized live checks were blocked by
  Windows socket access permissions before connecting, so public completion
  is not verified. No additional live request was made. GPL-3.0-or-later license
  text is staged with the sidecar. No new installer has been generated.


- **Active-profile model synchronization (V094-24).** The old shell wrote the
  removed `settings.yaml` while the running Host kept a different profile,
  stale model and old gateway port. Model updates now target the watched
  `profiles/web/cordis.patch.yml`, preserve user routes/comments/inert YAML
  expressions, and remove an empty managed route instead of submitting an
  invalid empty model list. A real isolated DSH Host test verifies multiple
  selectable models, route removal and recovery at a new port without restart.
  This source correction is not yet in a newly built installer; live upstream
  HTTP 403 compatibility is updated in V094-25 and the actual Hermes visual
  reference is implemented in V094-26; neither is proven by the old release gate.
- **Browser-first system prompt.** For tasks needing web information, use the
  embedded `computer_use` browser before DeepSeek API `web_search`. API fallback
  is reserved for browser unavailability, blocked access or failed attempts,
  with the limitation disclosed. Tool scopes and user permissions remain
  respected. DSH `0.2.1-alpha.7` is locally rebuilt and its archive, SHA-256,
  Electron ABI and Node engine are verified; it is not published remotely yet.
- **OmniRoute removed.** No optional runtime download, automatic fallback,
  server or detector remains. Next-start migration retires only FreeCode-owned
  legacy configuration and verified caches; user providers/history are preserved.
- **Invalid `pash` calls repaired at the bridge.** Exact `pash` becomes `bash`
  only when the original client declares unambiguous, permitted `bash`.
  Stream fragments, tool IDs and arguments are preserved; no fuzzy correction,
  permission bypass or request replay. Packaging rejects stale sidecar builds.
- **opencode2api v1.4.0** replaces v1.3.5. Manual model selection survives
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
- **Background packaging guards.** Materialized/copied runtime and desktop
  packaging checks now require Hermes patterns plus actual live-turn wiring;
  the old two-gradient fixture is rejected. Alpha5 is rejected; the
  fresh alpha7 runtime now passes the actual rendered-bundle gate.
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
readiness at 80.10 s). At that historical checkpoint, the full release gate and
fresh desktop build were still pending. They have since passed; the locally
verified alpha7 artifacts are listed above. The previous alpha5/alpha6 setup
and portable remain superseded. The active FreeCode instance was not
interrupted. No tag or public v0.9.4 release exists.

## Español

### Candidata actual 0.9.4 (alpha8)

La candidata actual apunta a `apps/shell/release-0.9.4-alpha8-20261016/` y fija DSH 0.2.1-alpha.8 con opencode2api v1.4.0. V094-37 muestra el progreso de carga del catálogo; V094-38 incorpora 13 fondos animados originales, glifos ASCII de clima, más velocidad durante la generación, patrón estable durante el stream y transición únicamente al completar o detener. V094-39 conserva por modelo el contexto, el límite de salida y los esfuerzos de razonamiento admitidos hasta el selector y el medidor. El bundle de producción alpha8 se renderizó en Chromium: mantuvo `aurora` durante el stream, pasó con crossfade a `ascii-stars` al detener, animó ambos patrones ASCII, se adaptó al resize y desactivó el canvas con movimiento reducido. Las capturas normal/reducido/galería se inspeccionaron en `D:/Temp/freecode-v094-alpha8-prod-render-20261016-r1/`. También incluye sincronización del perfil/modelos, rutas de inferencia y V094-35, que corrige la recursión del composer. El gate completo no interactivo pasó; setup/portable y el bundle de precarga local se compilaron y verificaron estáticamente. Sus assets exactos se detallan abajo; los ejecutables alpha7 de la sección histórica siguiente están obsoletos. El runtime DSH alpha8 está verificado localmente, pero no publicado; una instalación limpia requiere publicar ese asset o prepararlo explícitamente de forma local. No se ejecutó setup ni se tocó FreeCode, su instalación o caché. La aceptación del proveedor público sigue sin verificarse. No se incluye tag, push, subida ni publicación.

### Artefactos alpha8 locales verificados / Verified local alpha8 artifacts

El setup NSIS y el portable 0.9.4 se compilaron con electron-builder y se
verificaron estáticamente. El paquete local de prueba pasó
`Prepare-Local-Runtime.ps1` en modo CHECK ONLY (hash/tamaño de setup, portable y
runtime DSH alpha8 exacto; sin escribir en la caché). El runtime es un asset
separado y no está embebido en los ejecutables desktop. No se ejecutó ni instaló
setup o app.

Salida: `apps/shell/release-0.9.4-alpha8-20261016/`.

| Artefacto / Artifact | Bytes | SHA-256 |
|---|---:|---|
| Setup 0.9.4 | 178.757.839 bytes | `35b4f5eed71911c8048e32d60e64446701de907bb6c581a3c22d1f7e64371f66` |
| Portable 0.9.4 | 178.382.701 bytes | `c549b4e273c748980af632c14bacaeb45bd9d4877e7b839f610fe6cd74e20193` |
| Runtime DSH 0.2.1-alpha.8 | 421.507.898 bytes | `bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6` |

### Candidata local anterior 0.9.4 (alpha7; obsoleta)

Esa candidata anterior apuntaba a apps/shell/release-0.9.4-alpha7-20261015/, con DSH 0.2.1-alpha.7 y opencode2api v1.4.0. Los builds desktop alpha5/alpha6 quedaron obsoletos; alpha6 precedía a V094-35, que evita que el motivo localizado del bloqueo del modelo escriba recursivamente en el store del composer. La sincronización del perfil/catálogo, el protocolo de inferencia pública, la animación Hermes y el prompt browser-first estaban incluidos. El gate de release pasó; el setup/portable se compilaron y verificaron estáticamente; los tamaños y hashes históricos están en la tabla siguiente. El runtime alpha7 no publicado se incluyó en aquel bundle local con preflight CHECK ONLY. Esa build no instaló ni ejecutó setup o FreeCode. La aceptación del proveedor público sigue sin verificarse; no se incluyó tag, subida ni publicación. Se mantienen los fixes históricos V094-21.


**Estado: candidata local compilada; todavía no publicada.** v0.9.3 sigue siendo la última release
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
`apps/shell/release-0.9.4-model-resilience-20261015/`; ambos se ejecutaron, pero el usuario rechazó el catálogo y los fondos. También quedan obsoletos frente a V094-24/25/26.
v0.9.4 continúa sin publicarse.

Nota histórica del runtime: el primer arranque del setup alpha4 anterior informó
`No harness runtime asset for packaged version 0.2.1-alpha.4 (win32-x64)`.
La precarga local alpha4 fue un workaround y no satisface el pin alpha5 posterior.

### Novedades

- **Fondos reales Hermes Phoenix (V094-26).** Se reemplazó el gradiente equivocado
  por los nueve patrones de partículas de Hermes, con licencia MIT. Cambian al
  empezar una tarea y cada 45 segundos; pasan de 18 pasos virtuales/s en reposo
  a 72 trabajando. Se pausan con la vista oculta y se detienen con movimiento
  reducido. Chromium aislado ejecuta el panel/efectos/CSS emitidos reales y
  verifica píxeles, resize, interacción del composer, nueve patrones y limpieza.
  Hay capturas locales; el runtime alpha5 instalado no se modificó ni contiene
  este arreglo. Faltan el typecheck global y gate antes de compilar otro runtime
  versionado e instalador.


- **Compatibilidad upstream actual (V094-25).** Se incorpora opencode2api
  estable v1.4.0 conservando routing y correcciones de herramientas del fork.
  Se separan los orígenes de inferencia anónima y catálogo. La raíz de inferencia
  agrega los namespaces OpenAI/Anthropic del router oficial, en lugar de generar
  la ruta incorrecta /inference/v1. Se conserva el contrato de
  sesión/request de la versión etiquetada. Go y fixtures aislados verifican
  varias respuestas. Windows bloqueó las dos pruebas públicas autorizadas
  antes de conectar por permisos de socket: la respuesta pública no quedó
  verificada y no se hicieron más intentos. Se distribuye la licencia
  GPL-3.0-or-later junto al sidecar. No se generó otro instalador.


- **Sincronización con el perfil activo (V094-24).** El shell escribía el
  obsoleto `settings.yaml`, mientras el Host conservaba otro perfil, un modelo
  viejo y el puerto anterior. Ahora actualiza `profiles/web/cordis.patch.yml`,
  que DSH observa, preserva rutas/comentarios/expresiones YAML inertes y elimina
  la ruta administrada si queda vacía, en lugar de enviar una lista inválida.
  Una prueba con DSH real aislado verifica varios modelos seleccionables,
  eliminación y recuperación con otro puerto sin reiniciar. Este arreglo de
  fuente aún no está en un instalador nuevo; la compatibilidad upstream está actualizada en V094-25 y Hermes implementado
  en V094-26; no quedan demostrados por el gate anterior.
- **Navegador embebido primero en el prompt del sistema.** Si la tarea necesita
  información web, usar `computer_use` antes de DeepSeek API `web_search`.
  El fallback queda para navegador ausente, acceso bloqueado o intentos fallidos,
  informando la limitación. Se respetan scopes y permisos del usuario. DSH
  `0.2.1-alpha.7` se recompiló localmente y se verificaron el archivo, SHA-256,
  ABI de Electron y versión de Node; todavía no está publicado.
- **OmniRoute retirado.** Sin descarga opcional, fallback automático, servidor
  ni detector. La migración del próximo inicio retira solo la configuración
  antigua propia y cachés verificadas; conserva proveedores e historial del usuario.
- **Llamadas inválidas `pash` corregidas en el puente.** Solo se convierte el
  nombre exacto a `bash` si el cliente original declara `bash` permitido y sin
  ambigüedad. Conserva fragmentos, IDs y argumentos; sin corrección aproximada,
  salto de permisos ni repetición del request. El empaquetado rechaza binarios viejos.
- **opencode2api v1.4.0** reemplaza v1.3.5. La selección manual persiste al
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
- **Contratos de fondos.** Stage/runtime copiado y empaquetado desktop exigen
  patrones Hermes y conexión al turno real; rechazan el fixture de gradientes.
  Alpha5 es anterior al arreglo y no puede pasar el nuevo gate hasta generar
  un runtime con versión nueva.

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
del CLI en 80,10 s). En aquel punto histórico, el gate completo y el build nuevo
seguían pendientes. Luego se completaron; los artefactos alpha7 verificados
están en la tabla de arriba. Los setup/portable alpha5 y alpha6 siguen obsoletos.
No se interrumpió la instancia FreeCode activa. v0.9.4 no tiene tag ni release
pública.

## Historical alpha6 artifacts (superseded) / Artefactos alpha6 históricos (obsoletos) — 2026-10-15

Not installed or published / No instalados ni publicados.
Output / Salida: `apps/shell/release-0.9.4-alpha6-20261015/`.

| Artifact / Artefacto | Bytes | SHA-256 |
|---|---:|---|
| Setup 0.9.4 | 178751149 | `003383bea661a3036e8f2bd32abde611b6eb513d24c184a603a448804cd877a7` |
| Portable 0.9.4 | 178376011 | `58c797fe77ab2711bd242ec121446d3f94394ddaba647bf583de189e589de838` |
| DSH 0.2.1-alpha.6 | 421412565 | `a6279368c40050f6def20af2f6ee6c21007f78257b3a5b7176af4d8f72c20c43` |

The full non-interactive gate passed: shell 346/346, contract tests 114 passed
with 12 configured skips, vendor regressions 354/354, strict Host+Client,
14/14 native addons and real hidden DSH/MCP/loopback smoke. Go: 47 passed,
one opt-in public test skipped, vet clean. No additional public request was made.

Pasó el gate completo no interactivo: shell 346/346, 114 contratos con 12 skips
previstos, vendor 354/354, Host+Client estricto, 14/14 addons nativos y smoke real
DSH/MCP/proveedor loopback. Go: 47 aprobados, una prueba pública optativa omitida,
vet limpio. No se hicieron más consultas públicas.

For local testing before publishing alpha6, run `Prepare-Local-Runtime.ps1`
(default CHECK ONLY). Cache preparation needs `-PrepareRuntime -FreeCodeIsClosed`
after closing FreeCode. It retains backups and never runs setup or the app.
Do not run the standalone setup on a clean machine without that exact runtime.

Para probar sin publicar alpha6, usá `Prepare-Local-Runtime.ps1` (por defecto,
CHECK ONLY). La precarga exige `-PrepareRuntime -FreeCodeIsClosed` después de
cerrar FreeCode. Conserva backups; nunca ejecuta setup ni la app. No ejecutes
el setup solo en una máquina limpia sin ese runtime exacto.

Evidence / Evidencia: `evidence/`, `verification-receipt.json` and
`local-candidate.json` in the output directory. Source and materialized
conversation bundles match SHA-256
`b9de45b135f7b015250bd2d99d78f6384e572f22fd109fcc2ee9d00c33e45e7c`.
