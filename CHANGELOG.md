# Changelog

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
