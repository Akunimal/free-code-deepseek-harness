# Estado de traspaso — FreeCode DeepSeek Harness

## Hotfix final de Electron/Windows — 2026-08-22

La captura `write EOF` provenía del proceso principal de Electron: en una GUI empaquetada, `stdout/stderr` puede cerrarse mientras el supervisor volcaba la salida del hijo DSH. El supervisor ahora trata esos diagnósticos como best-effort y el proceso principal absorbe cualquier error de sus pipes de consola; los logs estructurados siguen siendo la fuente diagnóstica. El runtime web hijo recibe `--no-open`, por lo que la app no debe abrir Mozilla/Firefox además de su ventana Electron.

Verificación final: `pnpm --filter @freecode/shell build` OK; smoke del supervisor **2/2** OK; `git diff --check` OK; setup local 0.1.7 reconstruido con `--publish never`; instalación silenciosa ` /S ` terminó con `installer_exit_code=0`; ejecutable instalado en `%LOCALAPPDATA%\Programs\FreeCode\FreeCode DeepSeek Harness.exe` con versión `0.1.7.0`; el `app.asar` instalado contiene ambos parches. No quedó instalador, desinstalador ni app ejecutándose. Falta sólo la prueba manual del usuario.

## Actualización upstream y updater Harness-only — 2026-08-22

El vendored `vendor/deepseek-harness` quedó sincronizado con upstream `deepseek-ai/deepseek-harness` en `0.1.1-rc.2`, commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. Se conservó la integración del fork para Windows/headless y la normalización de `reasoning_effort` para modelos que no declaran razonamiento.

El menú de actualización ahora prioriza el asset compatible del runtime del Harness. Si existe una versión nueva, descarga `deepseek-harness-runtime-<version>-<os>-<arch>.tar.gz`, verifica el digest SHA-256 cuando GitHub lo publica, valida el CLI, detiene y reinicia únicamente `dsh`, y hace un reemplazo atómico con rollback. La aplicación, el pool opencode2api, Tor y los datos no se actualizan por esa ruta.

El catálogo de modelos conserva la última selección válida cuando todos los probes fallan, reintenta con backoff y notifica por separado `catalog` y `pool` cuando quedan degradados o caídos. La recuperación de `-free` de opencode2api continúa activa para evitar convertir una caída transitoria del catálogo en un falso `API key is invalid`.

El build local genera también el asset del updater junto a los instaladores y su archivo `.sha256`; no se ejecutaron workflows ni se publicó remotamente.

Verificación de esta actualización: build upstream completo OK; pruebas focalizadas del upstream **133/133**; shell **33/33**; opencode-adapter **10/10**; smoke real del CLI web OK; typecheck del shell OK. `runtime-manifest.json` registra `0.1.1-rc.2` y `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`; el setup/portable 0.1.7 y el asset Harness-only fueron recompilados localmente.

La información histórica debajo de esta sección conserva el diagnóstico anterior del instalador, TorFleet y modelos; cuando difiere, esta sección es la fuente actual.

Fecha: **2026-08-22**
Workspace: `I:\DeepSeek-Harness\free-code-deepseek-harness`
Rama: `main` (la actualización documental y funcional pendiente se documenta en este commit)

## Estado actual verificado

### Veredicto corto

El arreglo del instalador quedó cerrado localmente y listo para prueba manual:

- **Código fuente de modelos/effort:** el default existente es `x-preview-f`; la migración de perfiles viejos y la normalización para todos los modelos ya quedó implementada y cubierta.
- **Pool y round-robin interno:** tests pasan.
- **Hermes:** fuera de alcance en esta corrección; el diagnóstico histórico queda debajo sólo como contexto.
- **Release local 0.1.7:** setup NSIS y portable reconstruidos localmente el 2026-08-22; no se ejecutó ningún workflow ni publicación de GitHub.
- **Instalación silenciosa:** exit code `0`; instalación válida verificada en `%LOCALAPPDATA%\Programs\FreeCode`, con shortcut y uninstaller apuntando a esa ruta (el instalador NSIS usa ese directorio base aunque el ejecutable conserva su nombre completo).
- **Tool calling headless en Windows:** corregidas también las rutas directas del SDK, el helper de limpieza de `node-pty` y el `wscript` auxiliar del picker; los procesos de herramientas no deben abrir consolas fugaces. El diálogo visible de selección de carpeta sigue siendo intencional.
- **Catálogo público y `AUTH`:** el log de la prueba mostró que el descubrimiento de modelos falló transitoriamente al iniciar y dejó el worker con catálogo vacío; `x-preview-f` no se convertía a `x-preview-f-free` y el upstream devolvía 401, que la UI resumía como `API key is invalid`. `opencode2api` ahora aplica el sufijo `-free` de forma determinista mientras el catálogo está no disponible, para todos los modelos públicos visibles. Se agregó y pasó la regresión correspondiente.

## Hallazgos de Claude y Hermes

### Claude

El puente local recuperó la sesión de Claude del 2026-08-21. Claude había identificado correctamente la causa probable de los shortcuts rotos: el desinstalador viejo devuelve un exit code distinto de cero y `handleUninstallResult` aborta antes de extraer la instalación nueva. También indicó que había construido/subido los parches NSIS.

La auditoría del artefacto anterior contradijo esa última conclusión: `apps/shell/release/builder-debug.yml` de esa corrida referenciaba las plantillas anidadas de `app-builder-lib@25.1.8` sin `taskkill`, `PATCHED`, `installer.nsh` ni los cuatro marcadores de parche. Por tanto, los parches existían en el árbol fuente, pero no habían llegado al instalador 0.1.7 anterior; la reconstrucción local documentada abajo corrige ese cableado.

### Hermes (contexto histórico; fuera de alcance)

El `session-bridge` disponible solo recupera Claude y Codex; no tiene una fuente de sesiones Hermes. Hermes se revisó directamente en `C:\Hermes` (launcher, configuración, logs, procesos y puertos).

La configuración live ahora sí dice:

- Hermes → `http://127.0.0.1:8888/v1`.
- Modelo default/fallback → `x-preview-f`.
- `agent.reasoning_effort: ""`.
- `config-tor-0..3.json` → aliases `x-preview-f`, cuatro SOCKS Tor y lanes `tor-0..3`.

Pero al revisar el proceso real solo estaba escuchando el LB en `127.0.0.1:8888`; no estaban escuchando Tor `9150..9153`, workers `8000..8015`, gateway `8642` ni dashboard `9119`. El endpoint `/v1/models` del LB agotó timeout. Esto significa **configuración preparada, servicio no operativo en ese momento**.

Ese diagnóstico pertenece a la integración histórica de Hermes y no a la ruta actual del producto; FreeCode usa exclusivamente el puente local `opencode2api` administrado por el shell.

Los logs y estadísticas previas tampoco prueban el cambio: registran errores 401 para `north-mini-code-free` y `stats.json` concentra 456.687 requests en `deepseek-v4-flash-free`, sin requests de `x-preview-f`.

## Instalador NSIS — estado corregido y verificado

### Código que sí existe

`apps/shell/build/patch-nsis.cjs` contiene los cuatro parches esperados y el fix `StrCpy $R0 0`. También existe `apps/shell/build/installer.nsh` con `customCheckAppRunning` basado en `taskkill`.

### Causa raíz y corrección

La configuración activa ahora conecta `beforePack: build/patch-nsis.cjs` y `nsis.include: installer.nsh`. El hook resuelve la copia anidada de `app-builder-lib` que usa `electron-builder@25.1.8`, evitando parchear una dependencia distinta.

El desacople de versiones se eliminó del workspace: `electron-builder@25.1.8` usa sus plantillas anidadas 25.1.8. `electron-winstaller` también quedó habilitado explícitamente en `allowBuilds`, por lo que `pnpm install` termina correctamente.

Los parches efectivos son: reemplazo del falso positivo de proceso por `taskkill`, tolerancia al exit code del desinstalador anterior, guarda para entradas de registro que apuntan a un desinstalador inexistente y preservación del fallback nativo de extracción. La primera prueba reveló que reemplazar ese fallback quitaba un `${endIf}` de LogicLib; se retiró ese parche y el NSIS volvió a compilar.

### Verificación de instalación

- Setup: `apps/shell/release/FreeCode-DeepSeek-Harness-0.1.7-win-x64-setup.exe` con `/S` y `/D` citado.
- Exit code: `0`; el setup no quedó corriendo.
- Ejecutable: `%LOCALAPPDATA%\Programs\FreeCode\FreeCode DeepSeek Harness.exe`.
- `resources\app.asar` y `Uninstall FreeCode DeepSeek Harness.exe` presentes.
- Registro HKCU: versión `0.1.7`, icono y desinstalador apuntan a la ruta real.
- Shortcut del menú Inicio apunta al ejecutable instalado.

## Tool calling headless en Windows — corrección adicional

### Causa raíz

El spawn común ya enviaba `windowsHide: true`, pero había tres caminos fuera de esa protección:

- `HarnessClient` del SDK creaba el runtime con un `spawn` directo sin `windowsHide`.
- El cierre de terminales ConPTY de `node-pty` forkeaba `conpty_console_list_agent` sin ocultar su consola; por eso una ventana podía aparecer y desaparecer al terminar un tool call.
- El fallback `wscript` del picker nativo no debía recibir `windowsHide`: es un helper GUI y ese flag también ocultaba el diálogo que aloja.

La ruta `sandbox-windows-acl` no se modificó: su documentación registra que `CREATE_NO_WINDOW` rompe el token restringido con `STATUS_DLL_INIT_FAILED`. Los comandos pipeados siguen ocultos desde `spawnSubprocess`.

### Corrección y verificación

- `packages/sdk/client/src/client.ts` pasa `windowsHide: process.platform === 'win32'`.
- `packages/host/directory-picker-native/src/native-picker.ts` mantiene `wscript` sin `windowsHide`; al ser un ejecutable GUI no abre una consola fugaz y conserva visible el diálogo intencional.
- La prueba del fallback Electron verifica que no se pase `windowsHide` a `wscript`.
- `patches/node-pty@1.2.0-beta.15.patch` incluye el hunk generado por pnpm para ocultar el fork de limpieza de ConPTY; el lockfile fue actualizado.
- La resolución real del workspace apunta al paquete parcheado en `node_modules/.pnpm`, no a la copia vieja dejada por otro package manager; esa copia se apartó de forma recuperable en `node_modules/.ignored/node-pty`.
- Suites focalizadas: **3 archivos / 19 tests OK**.
- `pnpm typecheck`: **OK**, incluyendo el build de librerías del vendor y `dsh-sdk-client`.
- `scripts/build-opencode2api.sh`: **OK**, cuatro binarios locales reconstruidos con el fallback público y los parches existentes; no se ejecutaron workflows.

## Modelos y `reasoning_effort`

### Lo que está corregido

- `FALLBACK_MODELS` del seeder ahora usa `x-preview-f`.
- `model-refresher.ts` usa una política común: publica `off/low/high/max` solo para modelos `deepseek-*` y declara `reasoningEfforts: false` para todos los demás.
- `provider-seeder.ts` migra settings existentes: quita el `reasoning` de ruta heredado, normaliza la capacidad por modelo y elimina un `agent-default-model.reasoningEffort` que no corresponde a un modelo DeepSeek.
- El adaptador `llm-pi-ai` ya no reaplica un default de ruta viejo a un modelo que no declara razonamiento; un effort explícito incompatible sigue fallando con `UNSUPPORTED_REASONING_EFFORT`.
- El runtime upstream, incluido en `vendor` y regenerado en `apps/shell/resources/freecode/dsh`, elimina `reasoningEffort` cuando el modelo no declara soporte.
- Hermes tiene `reasoning_effort` vacío por defecto.

### Regresión cubierta

La captura se reproduce con un provider `deepseek-free` que conserva `reasoning: high`, un modelo `x-preview-f` sin razonamiento y un `agent-default-model.reasoningEffort: high`. El seeder elimina esos valores viejos y el adaptador permite la solicitud sin enviar `reasoning_effort`.

Las suites relevantes quedan en **8/8 archivos y 28/28 tests OK** para el shell; el typecheck directo también pasa (`tsc --noEmit`). El adaptador pi-ai pasa **46/46 tests** y catálogo/configuración pasan **58/58 tests**. La suite de `@freecode/opencode-adapter` queda en **10/10**, incluido round-robin y respawn.

## TorFleet, opencode2api y round-robin

- `packages/opencode-adapter/tests/pool.test.ts`: **10/10 pasan**, incluido round-robin, respawn de workers y load balancer.
- El adapter conserva la configuración SOCKS al respawn y la envía a workers listos.
- El launcher Hermes pretende arrancar 4 Tor, 16 workers y un LB global; cada worker queda en una lane (`port % 4`) y el LB rota globalmente. La secuencia efectiva esperada es `tor-0 → tor-1 → tor-2 → tor-3`.
- Los cuatro `config-tor-*.json` existen y contienen el alias `x-preview-f`.
- `lb.py` bufferiza la respuesta completa con `response.read()`; no es streaming SSE real. Para Hermes esto es un riesgo funcional importante, y `lb.log` ya contiene `WinError 10053` por conexiones abortadas.

El diseño está encaminado, pero no hay una prueba live actual que demuestre simultáneamente Tor up, 16 workers up, `/v1/models`, chat con `x-preview-f`, stream y rotación de cuatro exits.

## Build y estado del workspace

El flujo normal ya se pudo ejecutar después de habilitar `electron-winstaller`:

- `pnpm install`: OK.
- `pnpm build:desktop`: OK; compiló workspace, runtime vendorizado con el fix de reasoning y targets Windows.
- Rebuild final del instalador: `pnpm --filter @freecode/shell exec electron-builder --config electron-builder.yml --publish never`: OK.
- No se dispararon workflows ni se publicó en GitHub.

El worktree no está limpio; se preservaron cambios preexistentes detectados:

- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `apps/shell/electron-builder.yml.bak` (sin trackear)

No se revirtieron esos cambios.

## Próxima secuencia recomendada

1. **Completado:** habilitar `electron-winstaller` y ejecutar `pnpm install`.
2. **Completado:** conectar `beforePack`/`nsis.include` y alinear la resolución con `electron-builder@25.1.8`.
3. **Completado:** compilar localmente y reconstruir setup/portable 0.1.7 con `--publish never`.
4. **Completado:** probar instalación silenciosa y verificar extracción, desinstalador, registro y shortcut.
5. **Completado:** migrar perfiles existentes, limpiar `reasoningEffort` no soportado y cubrir modelos DeepSeek/no-DeepSeek.
6. **Completado:** regenerar localmente el runtime y sobreescribir los artefactos 0.1.7 con este fix; sin workflow ni publicación remota.
7. Hermes queda fuera de esta tarea; no se requiere levantarlo para validar el instalador.

## Compatibilidad pendiente

- [x] Instalación silenciosa local del setup 0.1.7 con registro y shortcut verificados.
- [ ] Prueba manual de uso de la aplicación instalada en Windows 11 25H2/24H2.
- [ ] Prueba manual en Linux; el recurso Tor nativo debe estar presente para esa plataforma.
- [ ] Medir streaming y rotación real por exit Tor; si opencode.ai bloquea el ASN de Tor, migrar a Oracle Free + SSH/SOCKS.

---

## Release v0.1.5 — pool con rotación Tor (TorFleet) (historial)

Fix de los 429 persistentes del tier free anónimo (`opencode.ai/zen`, `Bearer public` → cuota por IP/sesión): el pool (16 workers + LB) ahora rota las IPs de salida con una flota local de 4 instancias Tor configurada solo desde el `config.json` del pool (sin cambios de código; el config es runtime y está en .gitignore).

### Fixes incluidos

1. **TorFleet (Fase 2)** — 4 instancias `tor.exe` (Tor Expert bundle): `SocksPort 127.0.0.1:9150–9153`, `ControlPort 127.0.0.1:9251–9254`, DataDirectory/log propios por instancia; arranque headless con `start-tor.cmd` (`start "" /B`), bajo demanda antes de usar el pool.
2. **Round-robin de salida** — `socks5_proxies` ×4 + `active_socks5: "__round_robin__"`: cada request sale por un exit Tor distinto; `socks5_paid_direct: true` mantiene las claves privadas por la ruta directa (límites de cuenta intactos).
3. **Rotación on-demand** — helper `newnym.py` (ControlPort): `AUTHENTICATE` → `SIGNAL NEWNYM` → `QUIT` fuerza circuito nuevo en ~8 s.
4. **Verificado** — 4/4 exits Tor distintos devuelven 200 contra `opencode.ai/zen` (Cloudflare no bloquea Tor hoy); E2E completo por LB (chat 200, con conexiones worker→Tor establecidas); overhead +0.8–1.8 s/request.
5. **Fix instalador NSIS "no se puede cerrar"** — `build/installer.nsh` con macro `customCheckAppRunning` vacía: el chequeo de proceso de electron-builder 25.x (`nsProcess`/`tasklist | find`) produce falsos positivos en Win11 25H2 y bloquea la instalación incluso sin app corriendo. El override saltea el check. Documentado como known issue.

### Modelo default

- Provider: `deepseek-free` (LB → opencode2api pool round-robin → TorFleet)
- Model: `nemotron-3.5-lightning` (fastest responding)
- `deepseek-v4-flash` — (retirado del catálogo opencode, verificado 2026-08-21)
- `llm-deepseek` (built-in `deepseek-official`) no tocado — funciona si el usuario pone su DEEPSEEK_API_KEY

### Pendiente futuro

- [ ] Probar manualmente en macOS/Linux además de la matriz CI
- [ ] TorFleet: si opencode.ai bloquea el ASN de exits Tor, migrar la rotación a Oracle Free + SSH (SOCKS vía `ssh -D`)

---

## Release v0.1.4 — listo para publicar (historial)

Preflight local verificado: locale, typecheck, contratos, frontend y compatibilidad Go del proxy. El empaquetado Electron final queda a cargo del workflow reproducible; la materialización local del runtime fue detenida por su costo de I/O en Windows.

### Fixes incluidos

1. **Preload sandbox crash** — inlined IpcChannels, `import type` only. Bundle 123KB→1.5KB. Sin Zod.
2. **Screen flickering** — `app.disableHardwareAcceleration()` re-added (crash era del preload, no del GPU switch).
3. **Directory picker crash** — koffi NAPI incompatible con `ELECTRON_RUN_AS_NODE`. Fallback a wscript+BrowseForFolder VBScript.
4. **Default provider** — seeder auto-configura `deepseek-free` (LB pool) como provider default. Corrige `agent-default-model` en cada boot si apunta a ruta inexistente.
5. **Whale icon** — 512px PNG + multi-size ICO + 64px tray icon.
6. **Pool overlay** — live updates via `onStatus` IPC, close button, draggable frameless window.
7. **i18n** — shell detecta idioma del sistema (ES/EN), menús/diálogos/overlay traducidos.
8. **Splash screen** — pantalla de carga durante startup del harness.
9. **Harness supervisor** — logging mejorado, stderr/timeout/exit loggeados.
10. **Build scripts** — `supportedArchitectures` multi-target, native binary assertions, Git Bash pinning.
11. **Workspaces** — New Session crea una sesión distinta desde una sesión vacía; borrar workspace archiva sus sesiones sin perder carpeta, logs ni live sessions.
12. **Update check** — compatibilidad con las dos formas de exportar `electron-updater`; el menú ya no falla con `autoDownload` indefinido.
13. **Reasoning selector** — modelos DeepSeek del pool mantienen las opciones de esfuerzo de razonamiento al refrescar el catálogo.
14. **Español upstream** — el selector existente de Configuración ahora ofrece `Español`; los catálogos de la UI upstream quedaron traducidos y registrados en `zh/en/es`.
15. **Idioma inicial seguro** — si el navegador no informa `zh`, `en` ni `es`, la aplicación inicia en inglés en lugar de chino; una elección explícita se respeta.
16. **Rol `developer` compatible** — el proxy convierte `developer` a `system` antes de enviar Chat Completions a DeepSeek, que no acepta ese rol.
17. **Tool calls headless en Windows** — el subprocess local aplica `windowsHide` a los comandos de herramientas y a `taskkill`, evitando ventanas de PowerShell/sandbox durante la ejecución.

### Modelo default

- Provider: `deepseek-free` (LB → opencode2api pool round-robin)
- Model: `nemotron-3.5-lightning` (fastest responding)
- `deepseek-v4-flash` listado por opencode2api pero no responde (cuota/rate limit)
- `llm-deepseek` (built-in `deepseek-official`) no tocado — funciona si el usuario pone su DEEPSEEK_API_KEY

### Pendiente futuro

- [ ] Probar manualmente en macOS/Linux además de la matriz CI
