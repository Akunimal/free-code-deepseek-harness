# Changelog

## 0.3.1 — 2026-08-28

### Added / Agregado

- Added the optional `Gemini Web (local)` provider backed by the pinned MIT-licensed `gemini-web2api` project. FreeCode seeds its OpenAI-compatible route, refreshes its model catalog, and starts the local bridge automatically when Python 3 is available; the OpenCode Free route remains the default. / Se agregó el provider opcional `Gemini Web (local)` basado en el proyecto MIT `gemini-web2api`. FreeCode siembra su ruta compatible con OpenAI, actualiza su catálogo de modelos y arranca automáticamente el puente local cuando Python 3 está disponible; OpenCode Free sigue siendo la ruta predeterminada.
- Added the optional `Perplexity Free (local)` provider backed by the pinned MIT-licensed `Perplexity-AI-API` project. It is seeded after Gemini, refreshes from `/v1/models`, and remains visible without a Perplexity account for basic anonymous text use when its local bridge is running. / Se agregó el provider opcional `Perplexity Free (local)` basado en el proyecto MIT `Perplexity-AI-API`. Se siembra debajo de Gemini, se actualiza desde `/v1/models` y queda visible sin cuenta de Perplexity para texto anónimo básico cuando el puente local está ejecutándose.

### Build and operations / Build y operaciones

- The packaged runtime now includes the pinned Gemini Web2API source under `resources/freecode/gemini-web2api`; user configuration stays in the per-user data directory and is never overwritten after creation. / El runtime empaquetado ahora incluye el código fijado de Gemini Web2API en `resources/freecode/gemini-web2api`; la configuración del usuario queda en el directorio de datos por usuario y no se sobrescribe después de crearla.
- The packaged runtime also includes the pinned Perplexity bridge source under `resources/freecode/perplexity-api`; the current upstream Rust helper is Linux x86_64-oriented and is not auto-built by the Windows shell. / El runtime empaquetado también incluye el código fijado del puente Perplexity en `resources/freecode/perplexity-api`; el helper Rust upstream actual está orientado a Linux x86_64 y el shell de Windows no lo compila automáticamente.

### Verification / Verificación

- Added provider seeding, multi-provider model refresh, resource resolution, config-preservation, and local Python lifecycle coverage. / Se agregó cobertura de seeding del provider, refresh multi-provider, resolución de recursos, preservación de configuración y ciclo de vida Python local.
- Added selector-order and static-catalog coverage for the Gemini-then-Perplexity provider groups. / Se agregó cobertura del orden del selector y del catálogo estático para los grupos Gemini y luego Perplexity.

## 0.3.0 — 2026-08-25

### Fixed / Corregido

- Embedded Chromium failures are now visible in the browser tab and recorded in the per-user `logs/browser.log`; renderer exits, unresponsive states, rejected loads, and failed main-frame navigations no longer disappear silently. / Los fallos de Chromium embebido ahora son visibles en la pestaña del navegador y se registran en el `logs/browser.log` del usuario; las salidas del renderer, estados sin respuesta, cargas rechazadas y navegaciones principales fallidas ya no desaparecen silenciosamente.
- Conversation backgrounds keep a static gradient fallback when animation/compositing is unavailable, while preserving reduced-motion behavior. / Los fondos de conversación conservan un degradado estático cuando la animación/composición no está disponible y mantienen el comportamiento de movimiento reducido.

### Improvements / Mejoras

- The packaged Harness runtime now ships a core allowlist and keeps optional Claude/Codex providers external-only, reducing the Windows package payload while retaining required native modules (`sharp`, `koffi`, and `ripgrep`). / El runtime empaquetado del Harness ahora usa una allowlist del core y deja los providers opcionales Claude/Codex sólo como externos, reduciendo el payload de Windows y conservando los módulos nativos requeridos (`sharp`, `koffi` y `ripgrep`).
- Added an opt-in `caveman` spike without enabling it by default or introducing downloads/network behavior. / Se agregó un spike `caveman` opt-in sin activarlo por defecto ni introducir descargas o comportamiento de red.

### Build and operations / Build y operaciones

- Release gates now verify runtime closure, compiled conversation bundles, populated NSIS layouts, installed-runtime headless behavior, and the 0.2.4 → candidate upgrade path. / Los gates de release ahora verifican el cierre del runtime, los bundles compilados de conversación, los layouts NSIS poblados, el comportamiento headless del runtime instalado y el camino de actualización 0.2.4 → candidate.
- Installer extraction receives a longer cold-machine budget so slow but healthy extraction is not reported as a false failure. / La extracción del instalador recibe un presupuesto mayor en máquinas frías para no reportar como fallo falso una extracción lenta pero sana.

### Verification / Verificación

- Shell tests: 77 passed; contract tests: 22 passed and 12 skipped; conversation motion tests: 2 passed; runtime-closure tests: 3 passed; NSIS install/layout smoke and installed-runtime smoke: passed. / Tests del shell: 77 pasaron; contratos: 22 pasaron y 12 fueron omitidos; motion de conversación: 2 pasaron; runtime-closure: 3 pasaron; smoke NSIS de instalación/layout y smoke del runtime instalado: pasaron.

Source: `v0.2.9..HEAD`
Reviewed commands: `pnpm --filter @freecode/shell test`, `pnpm --filter @freecode/shell typecheck`, `pnpm test:contract`, `node --test scripts/runtime-closure.test.mjs`, `pnpm release:gate`
Omitted internal-only details: generated build output and test-only implementation details.

## 0.2.8 — 2026-08-24

### Fixed / Corregido

- Fixed the Windows NSIS upgrade regression that could leave `dsh/packages/` and `dsh/node_modules/` empty. Upgrades no longer invoke a stale previous uninstaller against the shared install directory; the shipped `resources/freecode` payload is cleared before the new payload is extracted. / Corregida la regresión de actualización NSIS en Windows que podía dejar vacíos `dsh/packages/` y `dsh/node_modules/`. Las actualizaciones ya no ejecutan un desinstalador anterior obsoleto contra la carpeta compartida; el payload `resources/freecode` se limpia antes de extraer el nuevo.
- Added an installer smoke gate that requires populated runtime directories and a regression contract that rejects unsupported NSIS cleanup hooks. / Se agregó un smoke gate del instalador que exige directorios de runtime poblados y un contrato de regresión que rechaza hooks NSIS de limpieza no soportados.
- Added a local 0.2.4 → 0.2.8 upgrade smoke: stale payload files must be removed while user data survives. / Se agregó un smoke local de actualización 0.2.4 → 0.2.8: los restos del payload viejo deben eliminarse y los datos del usuario deben sobrevivir.
- Increased the Windows Harness cold-start readiness budget to 90 seconds so first-run profile materialization is not killed as a false supervisor failure. / Se amplió a 90 segundos el presupuesto de readiness del Harness en Windows para que la materialización del perfil en el primer arranque no se mate como un falso fallo del supervisor.

### Build and operations / Build y operaciones

- Windows setup, portable, Linux AppImage, and Harness runtime artifacts are built locally and published manually. / Los artefactos Windows setup, portable, Linux AppImage y runtime del Harness se compilan localmente y se publican manualmente.

## 0.2.7 — 2026-08-24

### Added / Agregado

- Tor Fleet auto-activates when every worker in the pool is rate-limited. The LB tracks each worker's last outcome and fires once when all ready workers have a fresh 429 with no 2xx in between; the shell then enables Tor Fleet automatically and shows a native dialog warning that traffic now routes through Tor circuits with higher latency, with buttons to keep it enabled or disable. The alarm re-arms only after the pool recovers (some worker returns 2xx), and dismissed auto-prompts are suppressed for 10 min so a sustained storm does not nag on every request. Manual toggle in the Pool overlay stays as-is. / Tor Fleet se auto-activa cuando todos los workers del pool están rate-limited. El LB rastrea el último resultado de cada worker y dispara una vez cuando todos los workers ready tienen un 429 fresco sin ningún 2xx en el medio; el shell entonces habilita Tor Fleet automáticamente y muestra un diálogo nativo avisando que el tráfico ahora pasa por circuitos Tor con más latencia, con botones para mantenerlo activo o desactivar. La alarma se re-arma solo cuando el pool se recupera (algún worker devuelve 2xx), y los auto-prompts dismisseados quedan suprimidos por 10 min para que una tormenta sostenida no moleste en cada request. El toggle manual en el overlay del Pool queda igual.

### Fixed / Corregido

- Tor Fleet port allocation now scans upward from the preferred base instead of silently skipping busy ports. When DeepSeek Harness, Hermes, or a stale Tor instance held one of the canonical bases (9150/9251), a fleet instance was dropped with no visible warning; the fleet now lands on the next free port. Mirrors Hermes' `alloc_ports.py::_alloc`. / La asignación de puertos de Tor Fleet ahora escanea hacia arriba desde la base preferida en vez de saltear en silencio los puertos ocupados. Cuando DeepSeek Harness, Hermes o una instancia Tor obsoleta ocupaban una de las bases canónicas (9150/9251), una instancia del fleet se descartaba sin aviso visible; ahora aterriza en el siguiente puerto libre. Espeja `alloc_ports.py::_alloc` de Hermes.

### Also includes v0.2.6 fix / Incluye también el fix de v0.2.6

- Startup preflight retries up to six times with a one-second delay before failing, so the auto-update settling window (NSIS extraction not yet visible to `readdirSync`) is no longer treated as a broken install. / El preflight de arranque reintenta hasta seis veces con un segundo de delay antes de fallar, así la ventana de asentamiento del auto-update (extracción NSIS aún no visible para `readdirSync`) ya no se trata como install roto.

### Build and operations / Build y operaciones

- Windows setup, portable, Linux AppImage, and Harness runtime artifacts were built locally and are published manually. / Los artefactos Windows setup, portable, Linux AppImage y runtime del Harness se compilaron localmente y se publican manualmente.

Source: `v0.2.6..HEAD`

## 0.2.6 — 2026-08-24

### Fixed / Corregido

- Startup preflight no longer kills the app during the auto-update settling window. It ran a single synchronous layout check ~30-100ms after launch and exited on any incompleteness; during an auto-update, `electron-updater` relaunches the app in the window where the NSIS setup has only just finished extracting 600+ `node_modules` directories, and Windows disk buffering / indexing / antivirus can make a freshly written directory read as briefly empty — a false positive that killed the app 98ms after relaunch. The preflight now retries up to six times with a one-second delay; a genuinely broken install stays empty across every attempt and still fails with the same dialog, so retries cost seconds, not correctness. / El preflight de arranque ya no mata la app durante la ventana de asentamiento del auto-update. Corría un único chequeo síncrono ~30-100ms tras el arranque y salía ante cualquier incompletitud; durante un auto-update, `electron-updater` relanza la app en el instante donde el setup NSIS recién terminó de extraer 600+ directorios de `node_modules`, y el buffering de disco / indexado / antivirus de Windows pueden hacer que un directorio recién escrito se lea como vacío por un instante — un falso positivo que mataba la app 98ms tras el relanzamiento. El preflight ahora reintenta hasta seis veces con un segundo de delay; un install genuinamente roto queda vacío en todos los intentos y falla igual con el mismo diálogo, así los reintentos cuestan segundos, no correctness.

### Build and operations / Build y operaciones

- Windows setup, portable, Linux AppImage, and Harness runtime artifacts were built locally and are published manually. / Los artefactos Windows setup, portable, Linux AppImage y runtime del Harness se compilaron localmente y se publican manualmente.

Source: `v0.2.5..HEAD`

## 0.2.5 — 2026-08-24

### Fixed / Corregido

- Bounded pre-stream retry across workers when the load balancer sees a 429/5xx before downstream headers are sent. The LB now fans out to up to three distinct workers (each a different opencode2api exit rotation), buffers the request body once for replay, and preserves the streaming invariant: once `res.writeHead` runs and the pipe starts, no retry ever fires. 429 responses do not park the worker (retry rotates exit naturally); 5xx / connect failures park the worker ~8s to steer new requests around it. Sticky sessions survive: the sticky map is committed to the worker that actually served, not the one that failed. / Retry acotado pre-stream entre workers cuando el load balancer ve 429/5xx antes de mandar headers al cliente. El LB ahora prueba hasta tres workers distintos (cada uno = rotación de exit distinta de opencode2api), bufferea el body del request una vez para poder reintentar, y preserva el invariante de streaming: una vez que corre `res.writeHead` y arranca el pipe, nunca reintenta. Las 429 no parkean el worker (el retry rota exit solo); 5xx / connect parkean el worker ~8s para desviar requests nuevos. Las sticky sessions sobreviven: el mapa sticky se commitea al worker que efectivamente sirvió, no al que falló.
- The harness webview now reflows around the embedded browser panel instead of being covered by it. The v0.2.2 attempt relied on finding the built-in webContents inside `contentView.children`, which is empty under Electron 30+; the fix composes the harness as an explicit `WebContentsView` child of `mainWindow.contentView`, so `setBounds` can shrink the harness viewport when the browser opens. / El webview del harness ahora se reacomoda alrededor del panel del navegador embebido en vez de quedar tapado. El intento de v0.2.2 dependía de encontrar el webContents built-in dentro de `contentView.children`, que queda vacío en Electron 30+; el fix compone el harness como `WebContentsView` explícito hijo de `mainWindow.contentView`, así `setBounds` puede achicar el viewport del harness cuando abre el navegador.
- Closing the main window with the X button now hides to the tray instead of destroying the window. Tray single-click, double-click, and the "Show" menu item all restore the same window with its state intact; if the window really died (Task Manager, hard quit) the tray recreates it from the harness URL. / Cerrar la ventana principal con la X ahora minimiza al tray en vez de destruir la ventana. El click, doble-click y el ítem "Mostrar" del tray restauran la misma ventana con su estado intacto; si la ventana efectivamente murió (Task Manager, quit forzado) el tray la recrea desde la URL del harness.
- Startup preflight verifies the harness runtime layout (`apps/cli/lib/bin.js`, `packages/`, `node_modules/`, dialog-bridge bundle, opencode2api worker) before spawning the supervisor. Missing paths surface an actionable error dialog with the specific missing file instead of the opaque "supervisor gave up" that appeared 30s later after five silent restarts. / Preflight de arranque verifica el layout del runtime del harness (`apps/cli/lib/bin.js`, `packages/`, `node_modules/`, bundle del dialog-bridge, worker de opencode2api) antes de spawnear el supervisor. Rutas faltantes ahora muestran un diálogo de error accionable con el archivo puntual en vez del opaco "supervisor se rindió" que aparecía 30s más tarde tras cinco reintentos silenciosos.
- The stuck-supervisor dialog now includes the last 800 characters of dsh stderr so the user can see why the runtime failed, not only that it failed. / El diálogo de supervisor colgado ahora incluye los últimos 800 caracteres del stderr de dsh así el usuario ve por qué falló el runtime, no solo que falló.

### Build and operations / Build y operaciones

- New pre-package gates refuse to build a broken installer: `verify-nsis-hooks` bans filesystem mutations inside NSIS `customInstall` (which runs AFTER extraction — the v0.2.4 install-crash root cause); `verify-vendor-bundles-fresh` hash-locks vendor `src/*.ts` against `lib/index.js` so an edit without rebuild fails the packaging script. A `smoke:nsis` script silently installs, verifies the runtime layout, then uninstalls. / Nuevos gates pre-package rechazan buildear un instalador roto: `verify-nsis-hooks` prohíbe mutaciones de filesystem dentro de `customInstall` de NSIS (que corre DESPUÉS de la extracción — causa raíz del install-crash de v0.2.4); `verify-vendor-bundles-fresh` hash-lockea `src/*.ts` del vendor contra `lib/index.js` así una edición sin rebuild falla el script de packaging. Un script `smoke:nsis` instala silenciosamente, verifica el layout del runtime, y desinstala.
- Windows setup, portable, Linux AppImage, and Harness runtime artifacts were built locally and are published manually. / Los artefactos Windows setup, portable, Linux AppImage y runtime del Harness se compilaron localmente y se publican manualmente.

Source: `v0.2.4..HEAD`

## 0.2.4 — 2026-08-24

### Fixed / Corregido

- The Win32 directory picker no longer crashes under packaged Electron. An Electron dialog bridge routes `dialog.showOpenDialog` through the shell's main process, bypassing the koffi NAPI incompatibility with `ELECTRON_RUN_AS_NODE`. The koffi worker remains the default for non-Electron hosts. / El directory picker Win32 ya no se cuelga en Electron empaquetado. Un bridge de diálogo Electron enruta `dialog.showOpenDialog` por el proceso principal del shell, evitando la incompatibilidad NAPI de koffi con `ELECTRON_RUN_AS_NODE`. El worker koffi sigue siendo el default para hosts sin Electron.

### Build and operations / Build y operaciones

- Windows setup, portable, Linux AppImage, and Harness runtime artifacts were built locally and are published manually. / Los artefactos Windows setup, portable, Linux AppImage y runtime del Harness se compilaron localmente y se publican manualmente.

Source: `v0.2.3..HEAD`

## 0.2.3 — 2026-08-23

### Fixed / Corregido

- The Win32 directory picker worker now sets `ELECTRON_RUN_AS_NODE=1` explicitly, preventing the child process from dying silently when the env variable is not inherited. The exit handler includes the exit code for diagnostics. / El worker del directory picker Win32 ahora fija `ELECTRON_RUN_AS_NODE=1` explícitamente, evitando que el proceso hijo muera silenciosamente. El handler de salida incluye el código de salida para diagnóstico.
- The NSIS installer now removes stale runtime files (`node_modules`, `packages`, `apps`) from the previous installation directory before extracting the new payload. User data in `%APPDATA%` is never touched. / El instalador NSIS ahora elimina archivos de runtime obsoletos de la instalación anterior antes de extraer la nueva. Los datos del usuario en `%APPDATA%` no se tocan.
- Installed (non-portable) builds write a version marker to `%APPDATA%`. Portable builds check this marker at startup and warn if a newer installed version exists. / Las builds instaladas escriben un marker de versión en `%APPDATA%`. Las builds portables verifican este marker al arrancar y avisan si hay una versión instalada más reciente.

### Build and operations / Build y operaciones

- Windows setup, portable, Linux AppImage, and Harness runtime artifacts were built locally and are published manually. / Los artefactos Windows setup, portable, Linux AppImage y runtime del Harness se compilaron localmente y se publican manualmente.
- Fixed `package-harness-update.mjs` tar failure on substituted drive letters (Windows tar interprets `X:` as a remote host). / Se corrigió el fallo de tar en `package-harness-update.mjs` con letras de unidad sustituidas (tar de Windows interpreta `X:` como host remoto).

Source: `v0.2.2..HEAD`

## 0.2.2 — 2026-08-23

### Fixed / Corregido

- Suppressed the misleading first-start degraded-catalog notification while Free workers and model probes warm up; the last known-good selection remains intact. / Se suprimió el aviso engañoso de catálogo degradado durante el calentamiento y se conserva la última selección válida.
- Serialized update checks, added semantic version comparison, and fixed the release preflight so the circular download indicator only appears for a real newer release. / Se serializaron los checks, se agregó comparación semántica y se corrigió el preflight para que la flecha circular aparezca sólo ante una release realmente nueva.
- Fixed the embedded Chromium toolbar: Enter and Go dispatch reliably, bare hosts become HTTPS, and the Harness viewport reflows instead of hiding text behind the browser panel. / Se corrigió la barra del Chromium embebido: Enter e Ir funcionan, los hosts simples pasan a HTTPS y el viewport se reacomoda sin tapar texto.
- Forced Windows PTY tool terminals through ConPTY while keeping normal child processes headless. / Los terminales PTY de herramientas en Windows usan ConPTY y los procesos hijos normales siguen siendo headless.

### Build and operations / Build y operaciones

- Windows setup, portable, and Harness runtime artifacts were built locally and are published manually; no GitHub Actions release workflow is used. / Los artefactos Windows setup, portable y runtime del Harness se compilaron localmente y se publican manualmente; no se usa workflow de release de GitHub Actions.

Source: `v0.2.1..0ee19cecb4`
Reviewed commands: `pnpm --filter @freecode/shell typecheck`, `pnpm --filter @freecode/shell test`, `pnpm test:contract`, `pnpm build:desktop`.

## 0.2.1 — 2026-08-23

### Fixed

- Se eliminó el aviso falso de `Pool opencode2api no disponible` durante el cierre normal de FreeCode; las transiciones reales del pool siguen notificándose.
- La configuración de RTK ahora es un toggle opcional y efectivo en tiempo real para Bash y PowerShell; si `rtk` no está instalado, la opción no rompe la ejecución.

### Build and operations

- Se reforzaron los contratos y tests del apagado, RTK y configuración del shell.
- La release y sus artefactos se publican manualmente para no consumir cuota gratuita de GitHub Actions.

## 0.1.8 — 2026-08-23

### Fixed

- Se restauró Español como opción persistente del selector y se reforzó la paridad de diccionarios `zh/en/es` con una prueba AST.
- Los tool calls mantienen las rutas de proceso headless; el selector de proyecto sigue siendo la única superficie GUI intencional.
- `network_error` ahora se clasifica como transporte transitorio y usa el retry policy existente, con backoff acotado y sin repetir herramientas parcialmente iniciadas.
- La interfaz web y los menús nativos mantienen el idioma elegido en español, inglés o chino; se eliminaron textos visibles residuales como `Deep diving`, `Full access` y `feedback`.
- El fondo animado de las conversaciones vuelve a renderizarse con CSS y respeta `prefers-reduced-motion`.

### Added

- Navegador Chromium embebido visible con perfil persistente, sesión reutilizable y herramienta `computer_use` para el Harness.
- Actualización desde dentro de la aplicación para el shell y para el runtime del Harness, con validación de digest y reemplazo atómico.

## 0.1.7 — 2026-08-22

### Fixed

- El vendored DeepSeek Harness se actualizó al upstream `0.1.1-rc.2` (`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`); el runtime ahora registra ese commit en su manifest para que la comprobación de versión no dependa del historial del subtree.
- El actualizador de la aplicación prioriza un asset compatible del runtime (`deepseek-harness-runtime-<version>-<os>-<arch>.tar.gz`) y reemplaza atómicamente solo `dsh`; el shell, el pool opencode2api, Tor y los datos quedan intactos.
- El reemplazo del runtime valida la estructura del CLI y el digest SHA-256 publicado por GitHub cuando está disponible; ante un fallo conserva el runtime anterior.
- La actualización local del upstream recompila únicamente `package:runtime`; ya no reconstruye ni reemplaza el escritorio completo para actualizar el Harness.
- Las caídas del catálogo y del pool se distinguen en logs/notificaciones, con reintentos escalonados del catálogo y conservación de la última selección válida mientras se recupera.
- La política de razonamiento ahora es por modelo: solo los modelos DeepSeek publican `off/low/high/max`; el resto queda explícitamente sin razonamiento.
- Las instalaciones existentes migran `reasoning: high` y `agent-default-model.reasoningEffort` obsoletos, evitando que `x-preview-f` u otro modelo sin razonamiento falle con `UNSUPPORTED_REASONING_EFFORT`.
- El adaptador pi-ai ignora defaults de ruta heredados cuando el modelo seleccionado no declara razonamiento, pero conserva el rechazo de efforts explícitos incompatibles.
- El instalador NSIS ya incluye los overrides y parches efectivos de proceso y desinstalación; evita falsos positivos al detectar la aplicación y no aborta porque el desinstalador anterior devuelva un exit code no fatal.
- Las entradas de registro antiguas que apuntan a un desinstalador inexistente ya no dejan la instalación nueva trabajando indefinidamente.
- Se conserva el fallback nativo de extracción de electron-builder; se eliminó un parche frágil que podía dejar el script LogicLib sin un `${endIf}` balanceado.
- Los tool calls de Windows quedan headless en todas las rutas: subprocess común, runtime directo del SDK y helper `node-pty` de limpieza ConPTY. El `wscript` del selector es un helper GUI sin consola; se mantiene visible solo su diálogo interactivo de selección de carpeta.
- El pool público ya traduce cualquier modelo visible sin sufijo a su variante `-free` aunque el catálogo remoto falle al iniciar; evita mostrar un falso error de API key durante una caída transitoria de descubrimiento.
- El shell empaquetado ya no propaga `write EOF` desde pipes de consola cerrados y el runtime web hijo recibe `--no-open`; los tool calls y el arranque quedan headless sin abrir un navegador externo.

### Build and operations

- `electron-builder@25.1.8` resuelve la misma copia de `app-builder-lib` que compila el instalador; la configuración activa conecta `beforePack` y `nsis.include` explícitamente.
- `electron-winstaller` quedó habilitado en `allowBuilds`, permitiendo que `pnpm install` y el build local terminen.
- Se reconstruyeron localmente los artefactos NSIS y portable 0.1.7 con `--publish never`.
- Se ejecutó el setup silenciosamente con exit code `0` usando el destino citado; se verificaron ejecutable, `app.asar`, runtime con el fix, desinstalador, registro HKCU y shortcut del menú Inicio apuntando a la ruta correcta.
- Se verificaron 3 suites de headless tool processes (19 tests) y el typecheck/build completo del vendor.
- Se reconstruyeron localmente los cuatro binarios de `opencode2api`; el test de regresión del fallback público pasa.
- El empaquetado local deja en `apps/shell/release` el asset de actualización del Harness y su `.sha256`; ambos quedaron adjuntos manualmente a la release remota `v0.1.7` junto con los instaladores, sin ejecutar workflows.

### Release status

- La release remota `v0.1.7` fue actualizada manualmente con los artefactos Windows y el runtime del Harness; no se ejecutó ningún workflow de GitHub.

Source: commit `de540d714e` audited on 2026-08-22 (no tag range; includes the vendored Harness update and the product/runtime fixes described above).
Reviewed commands: upstream `0.1.1-rc.2` build, vendored effort/headless tests (133), `pnpm package:runtime`, `pnpm --filter @freecode/shell typecheck`, `pnpm --filter @freecode/shell test -- --run` (8 files / 33 tests), `pnpm --filter @freecode/opencode-adapter test -- --run` (10 tests), local Electron setup/portable packaging, Harness tar/digest verification, and GitHub Release asset verification. Assets were uploaded manually; no GitHub workflow was used.
