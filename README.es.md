# free-code-deepseek-harness

> Shell de escritorio multiplataforma para [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) con **puente OpenCode integrado**: zero-config, proveedor DeepSeek Free de fábrica a través del pool local `opencode2api` incluido, y la interfaz web completa del harness.

[English](README.md)

## Sobre este fork

Este repositorio es el fork público [Akunimal/free-code-deepseek-harness](https://github.com/Akunimal/free-code-deepseek-harness) de [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness). Conserva el harness original y agrega una aplicación GUI de escritorio para ejecutarlo como producto multiplataforma: Electron administra los procesos locales, prepara el proveedor DeepSeek Free, levanta el `opencode2api` pool y abre la interfaz web completa del harness dentro de una ventana nativa. **El puente OpenCode (`opencode2api`) viene completamente integrado** — no requiere descarga externa, binario separado ni configuración manual; el puente viaja dentro de la aplicación y el pool de workers lo administra automáticamente.

La rama de producto es `dev`; el fork mantiene `master` como referencia del upstream. Cada tag `v*` dispara una release reproducible con builds nativos para las tres plataformas soportadas:

- Windows: instalador NSIS `.exe`.
- macOS: aplicación/DMG de Electron.
- Linux: paquete de escritorio/AppImage de Electron.

Los artifacts se construyen en una matriz Windows/macOS/Linux, pasan los tests de contrato y se publican en la release de GitHub del fork. No es una UI de demostración: cada build incluye el runtime del harness, sus dependencias workspace, el pool local, la configuración zero-config y las superficies web upstream documentadas abajo.

## Portable, vibecoding casi gratis y límites reales

El producto está diseñado para ser autocontenido y portable: el runtime de Node/Electron, el CLI `dsh`, la UI, las dependencias nativas y los binarios `opencode2api` viajan dentro del artefacto. No hace falta instalar Node, pnpm, Git, Go ni Python para ejecutar una release. En Windows se publican dos ejecutables: un instalador NSIS y un `.exe` **portable** que se puede copiar a otra carpeta o máquina; el portable guarda sus datos en `data/` junto al ejecutable. macOS entrega la app/DMG y Linux la AppImage, también con el runtime incluido.

El objetivo es facilitar vibecoding prácticamente gratis usando la ruta DeepSeek Free de OpenCode. El overlay de Pool tiene el slider **Accounts / workers** de 1 a 16 (por defecto 4): controla cuántos procesos locales `opencode2api` atienden en paralelo. Cada worker mantiene su propia sesión independiente contra el servicio OpenCode, y los rate limits se aplican por sesión, por lo que agregar workers incrementa efectivamente el throughput agregado más allá de lo que una sola conexión puede sostener. No crea cuentas nuevas, no rota identidades y no evade límites a nivel de IP. Con una clave privada, todos los workers usan esa clave y siguen aplicando los límites de esa cuenta/proveedor.

**Costo de más workers:** cada proceso `opencode2api` consume RAM (~80–120 MB cada uno); 4 workers ≈ 400 MB, 16 workers ≈ 1.6 GB encima de Electron. Si todos los workers pegan al servicio a la vez, pueden llegar todos al tope de rate limit simultáneamente — más workers no garantiza más cuota, sólo mejor concurrencia cuando hay cuota disponible. Empezá con el default (4) y subí sólo si notás tiempo muerto entre requests.

**Primera apertura del portable:** el `.exe` portable es un archivo auto-extraíble (~444 MB comprimido, ~1.6 GB extraído). En cada ejecución se extrae a un directorio temporal antes de que arranque Electron — esto puede tardar entre 30 y 90 segundos dependiendo de la velocidad del disco y del antivirus. No hay barra de progreso durante la extracción; la ventana aparece cuando Electron termina de cargar. El instalador NSIS extrae una sola vez al instalar, así que las aperturas siguientes son más rápidas. Si el portable parece trabado, dale un par de minutos — está extrayendo, no está colgado.

**Timeouts y paciencia:** la ruta gratuita de DeepSeek puede ser lenta, sobre todo bajo carga alta. Los timeouts están configurados generosamente a propósito para que los streams largos no se corten a mitad de respuesta. Si una respuesta tarda, esperá — el stream sigue vivo, el modelo sigue generando. Al fin y al cabo, es gratis.

Para probar el build Windows generado en este checkout, abrí `apps/shell/release/FreeCode-DeepSeek-Harness-0.1.0-win-x64-portable.exe`; el instalador queda como `apps/shell/release/FreeCode-DeepSeek-Harness-0.1.0-win-x64-setup.exe`. El directorio desempaquetado de desarrollo es `apps/shell/release/win-unpacked/FreeCode DeepSeek Harness.exe`.

## Qué entrega

Esta aplicación empaqueta el harness upstream y agrega la capa desktop necesaria para usarlo sin preparar manualmente procesos, puertos ni providers:

- Arranca `opencode2api` en un pool local, con health checks, round-robin, sticky sessions, SSE transparente, backoff y presupuesto de respawn.
- Levanta `dsh web` en loopback, detecta readiness, reinicia el harness y abre su UI en una ventana Electron aislada/sandboxed.
- Siembra `deepseek-free` apuntando al pool, conserva providers del usuario y actualiza el catálogo de modelos por latencia cada 30 minutos o bajo demanda.
- Trae preconfigurada la cuenta pública de OpenCode (`Bearer public`) como `FREECODE_PUBLIC_KEY`, por lo que DeepSeek Free queda utilizable sin API key privada; una clave privada de OpenCode del usuario nunca se sobrescribe.
- Detecta rutas OpenAI-compatible locales de OmniRoute, guarda secretos mediante keytar o fallback de archivo y expone IPC zod tipado por preload.
- Incluye ventana, tray, notificaciones, overlay de estado del pool, abrir la carpeta de configuración, importación OpenCode SQLite/ChatML y continuación en workspace.
- Escribe logs JSONL rotados, ofrece un botón de actualización GitHub, puede sincronizar upstream y recompilar desde un checkout local, prepara stages reproducibles y publica únicamente desde tags `v*`.
- Añade un fondo animado por conversación en CSS: dos gradientes radiales livianos, sin canvas ni loop JavaScript, con soporte para `prefers-reduced-motion`.

## Permisos: exactamente el modelo del harness original

El fork no amplía ni reemplaza el modelo de permisos de `deepseek-ai/deepseek-harness`. Las conversaciones conservan sus preguntas, aprobaciones de usuario, presets de permisos, políticas de aprobación, sandbox y eventos persistidos del upstream. También se conservan las tres modalidades de sandbox (`read-only`, `workspace-write` y `danger-full-access`), el confinamiento de filesystem cuando la composición lo activa, las confirmaciones de herramientas/comandos y la escalada de un comando bloqueado sólo con `sandbox_permissions`, justificación y aprobación del usuario.

Electron agrega únicamente el límite del proceso de escritorio: renderer aislado, `contextIsolation`, `sandbox`, `nodeIntegration: false`, preload tipado y servicios locales en `127.0.0.1`. No concede automáticamente acceso al filesystem, shell, red, workspace ni herramientas del agente. La credencial pública de OpenCode sólo habilita el transporte/modelo DeepSeek Free; no cambia la autoridad del agente. Si el upstream cambia una política, preset o modo de permisos, este fork lo hereda al sincronizar la subtree. El inventario completo y sus límites están en [UPSTREAM-FEATURES.md](docs/UPSTREAM-FEATURES.md).

## Todas las funciones del DeepSeek Harness incluido

La UI no es un mock reducido: se distribuyen las superficies upstream de conversación, sesiones, workspaces, sidebar, subagentes, modelos/providers, settings, temas, locale, attachments, markdown, comandos slash, input `/` y `@`, tools, tool tree, feedback, permisos, plan, goal, preguntas, aprobaciones, compaction, trayectoria, jobs, workflows, deliverables, skills, web search/fetch, plugins, LSP, filesystem/code runtime, persistencia, streaming, gateway, extensiones y módulo de cliente. El inventario exacto de los **219 paquetes declarados** y sus límites está en [UPSTREAM-FEATURES.md](docs/UPSTREAM-FEATURES.md); un contract test obliga a actualizarlo si upstream agrega una superficie.

## Inicio rápido

Requisitos: Node `>=22.19`, pnpm `11.22`, Git Bash y un checkout con los subtrees vendorizados.

```bash
pnpm install
pnpm build:vendor
pnpm build
pnpm test
pnpm test:contract
```

Para desarrollo del shell:

```bash
pnpm --filter @freecode/shell dev
```

Para preparar un runtime completo y un instalador:

```bash
pnpm build:desktop
```

El stage no usa `pnpm install --prod`: el harness necesita sus workspace links internos.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Inventario exhaustivo upstream](docs/UPSTREAM-FEATURES.md)
- [Contratos y tests](docs/CONTRACT-TESTS.md)
- [Importación de chats](docs/CHAT-IMPORT.md)
- [Continuación en workspace](docs/WORKSPACE-BRIDGE.md)
- [UI animada](docs/UI.md)
- [Logs y updates](docs/LOGGING-AND-UPDATES.md)
- [Release y packaging](docs/RELEASE.md)
- [Sincronización upstream](docs/UPSTREAM-SYNC.md)

## Configuración y seguridad

Todo lo local escucha en `127.0.0.1`. El vault resuelve secretos hacia el proceso hijo sin mutar `process.env`. El menú Ayuda siempre ofrece un check explícito; `FREECODE_ENABLE_UPDATES=1` habilita además los checks en segundo plano contra GitHub Releases. Desde un checkout de código fuente, el mismo flujo puede traer el harness original, correr los tests y recompilar localmente. El runtime guarda `dsh-home`, workers y logs bajo el `userData` de Electron.

## Estado del proyecto

La rama de trabajo es `dev`. El contrato del harness, la suite del shell, la UI upstream modificada y el empaquetado reproducible deben pasar antes de fusionar a `main`. Ver [state.md](state.md) para continuidad operativa.

## Licencia

MIT — ver [LICENSE](LICENSE) y [NOTICE](NOTICE). El código upstream conserva sus avisos y licencia dentro de `vendor/deepseek-harness`.
