# free-code-deepseek-harness

> Cross-platform desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with an **integrated OpenCode bridge**: zero-config, DeepSeek Free provider out of the box via the built-in `opencode2api` worker pool, and the complete upstream web experience.

[Español](README.es.md)

## About this fork

This repository is the public [Akunimal/free-code-deepseek-harness](https://github.com/Akunimal/free-code-deepseek-harness) fork of [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness). It keeps the upstream harness and adds a desktop GUI product for running it cross-platform: Electron owns the local processes, prepares the DeepSeek Free provider, starts the `opencode2api` pool, and opens the complete harness web UI inside a native window. **The OpenCode bridge (`opencode2api`) is fully integrated** — no external setup, separate binary download, or manual configuration is required; the bridge ships inside the application and is managed automatically by the worker pool.

The product branch is `dev`; the fork keeps `master` as the upstream reference. Every `v*` tag triggers a reproducible release with native builds for all three supported platforms:

- Windows: NSIS `.exe` installer.
- macOS: Electron app/DMG.
- Linux: Electron desktop package/AppImage.

Artifacts are built in a Windows/macOS/Linux matrix, pass the contract tests, and are published to the fork's GitHub release. This is not a demo UI: every build contains the harness runtime, its workspace dependencies, the local worker pool, zero-config setup, and the upstream web surfaces documented below.

## Portable, almost-free vibecoding, and real limits

The product is designed to be self-contained and portable: Node/Electron, the `dsh` CLI, the UI, native dependencies, and the `opencode2api` binaries travel inside the artifact. A release does not require Node, pnpm, Git, Go, or Python to run. Windows publishes both an NSIS installer and a **portable** `.exe` that can be copied to another folder or machine; the portable build keeps its data in a `data/` directory beside the executable. macOS ships the app/DMG and Linux ships an AppImage, also with the runtime included.

The goal is almost-free vibecoding through OpenCode's DeepSeek Free route. The Pool overlay exposes an **Accounts / workers** slider from 1 to 16 (default 4): it controls how many local `opencode2api` processes serve requests concurrently. Each worker maintains its own independent session against the OpenCode service, and rate limits are applied per session, so adding workers effectively increases the aggregate throughput beyond what a single connection can sustain. It does not create accounts, rotate identities, or bypass IP-level limits. With a private key, all workers use that key and remain subject to that account/provider's limits.

**Trade-offs of more workers:** each `opencode2api` process consumes RAM (~80–120 MB each); 4 workers ≈ 400 MB, 16 workers ≈ 1.6 GB on top of Electron itself. If all workers hit the service simultaneously, they may all reach the rate limit ceiling at the same time — more workers does not guarantee more quota, just better concurrency when quota is available. Start with the default (4) and increase only if you notice idle time between requests.

**First launch of the portable:** the portable `.exe` is a self-extracting archive (~444 MB compressed, ~1.6 GB extracted). On each launch it extracts to a temporary directory before Electron starts — this can take 30–90 seconds depending on disk speed and antivirus activity. There is no progress bar during extraction; the window appears once Electron finishes loading. The NSIS installer extracts once at install time, so subsequent launches are faster. If the portable seems stuck, give it a couple of minutes — it is extracting, not frozen.

**Timeouts and patience:** the free DeepSeek route can be slow, especially under heavy load. Timeouts are intentionally generous so that long-running streams are not cut mid-response. If a response takes a while, wait — the stream is still alive, the model is still generating. It is free, after all.

To test the Windows build generated in this checkout, open `apps/shell/release/FreeCode-DeepSeek-Harness-0.1.1-win-x64-portable.exe`; the installer is `apps/shell/release/FreeCode-DeepSeek-Harness-0.1.1-win-x64-setup.exe`. The unpacked development executable is `apps/shell/release/win-unpacked/FreeCode DeepSeek Harness.exe`.

## What it delivers

This application packages the upstream harness and adds the desktop layer needed to use it without manually preparing processes, ports, or providers:

- Starts an `opencode2api` pool with health checks, round-robin, sticky sessions, transparent SSE, backoff, and a respawn budget.
- Starts `dsh web` on loopback, detects readiness, restarts the harness, and opens its UI in an isolated/sandboxed Electron window.
- Seeds `deepseek-free` against the pool, preserves user providers, and refreshes the model catalog by latency every 30 minutes or on demand.
- Preconfigures OpenCode's public account (`Bearer public`) as `FREECODE_PUBLIC_KEY`, so DeepSeek Free is usable without a private API key; an existing private OpenCode key is never overwritten.
- Detects local OmniRoute OpenAI-compatible routes, stores secrets through keytar or a file fallback, and exposes typed zod IPC through preload.
- Includes window, tray, notifications, pool-status overlay, settings-folder access, OpenCode SQLite/ChatML import, and workspace continuation.
- Writes rotating JSONL logs, offers a GitHub update button, can sync upstream and rebuild from a local checkout, prepares reproducible stages, and publishes only from `v*` tags.
- Adds a per-conversation CSS animated background: two lightweight radial-gradient layers, no canvas or JavaScript loop, with `prefers-reduced-motion` support.

The existing Settings language selector now offers Chinese, English, and Spanish across the bundled upstream UI; the selection is persisted through the locale settings service.

## Permissions: exactly the original harness model

This fork does not broaden or replace `deepseek-ai/deepseek-harness`'s permission model. Conversations retain the upstream user questions, approvals, permission presets, approval policies, sandbox behavior, and persisted permission events. The three upstream sandbox modes (`read-only`, `workspace-write`, and `danger-full-access`) remain available, as do filesystem confinement when that composition is enabled, tool/command confirmations, and escalation of a blocked command only through `sandbox_permissions`, a justification, and user approval.

Electron adds only the desktop process boundary: an isolated renderer, `contextIsolation`, `sandbox`, `nodeIntegration: false`, a typed preload, and local services bound to `127.0.0.1`. It does not silently grant filesystem, shell, network, workspace, or agent-tool access. The public OpenCode credential only enables the DeepSeek Free model transport; it does not change agent authority. If upstream changes a policy, preset, or permission mode, this fork inherits it when the subtree is synchronized. The complete feature inventory and its limits are in [UPSTREAM-FEATURES.md](docs/UPSTREAM-FEATURES.md).

## Every feature of the included DeepSeek Harness

The UI is not a reduced mock: the bundled application ships upstream surfaces for conversations, sessions, workspaces, sidebar, subagents, models/providers, settings, themes, locale, attachments, markdown, slash commands, `/` and `@` input, tools, tool tree, feedback, permissions, plan, goal, questions, approvals, compaction, trajectory, jobs, workflows, deliverables, skills, web search/fetch, plugins, LSP, filesystem/code runtime, persistence, streaming, gateway, extensions, and the client module system. The exact inventory of all **219 declared packages** and availability notes lives in [UPSTREAM-FEATURES.md](docs/UPSTREAM-FEATURES.md); a contract test requires this inventory to be updated when upstream adds a surface.

## Quick start

Requirements: Node `>=22.19`, pnpm `11.22`, Git Bash, and a checkout with the vendored subtrees.

```bash
pnpm install
pnpm build:vendor
pnpm build
pnpm test
pnpm test:contract
```

Run the desktop shell in development:

```bash
pnpm --filter @freecode/shell dev
```

Prepare a complete runtime and installer:

```bash
pnpm build:desktop
```

The stage does not use `pnpm install --prod`: the harness requires its internal workspace links.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Exhaustive upstream inventory](docs/UPSTREAM-FEATURES.md)
- [Contracts and tests](docs/CONTRACT-TESTS.md)
- [Chat import](docs/CHAT-IMPORT.md)
- [Workspace bridge](docs/WORKSPACE-BRIDGE.md)
- [Animated UI](docs/UI.md)
- [Logging and updates](docs/LOGGING-AND-UPDATES.md)
- [Release and packaging](docs/RELEASE.md)
- [Upstream synchronization](docs/UPSTREAM-SYNC.md)

## Configuration and security

All local services bind to `127.0.0.1`. The vault resolves secrets into the child process without mutating `process.env`. The Help menu always offers an explicit update check; `FREECODE_ENABLE_UPDATES=1` additionally enables background checks against GitHub Releases. From a source checkout, the same flow can pull the original harness, run tests, and rebuild locally. Electron `userData` contains `dsh-home`, workers, and logs.

## Project status

The work branch is `dev`. Harness contracts, shell tests, the modified upstream UI, and reproducible packaging must pass before merging into `main`. See [state.md](state.md) for operational continuity.

## License

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Upstream notices and licensing are retained inside `vendor/deepseek-harness`.

---

# free-code-deepseek-harness — Español

> Shell de escritorio multiplataforma para [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) con **puente OpenCode integrado**: zero-config, proveedor DeepSeek Free de fábrica a través del pool local `opencode2api` incluido, y la interfaz web completa del harness.

Esta sección en español está incluida en el README principal para que la portada de GitHub muestre ambos idiomas. También está disponible como documento independiente en [README.es.md](README.es.md).

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

**Timeouts y paciencia:** la ruta gratuita de DeepSeek puede ser lenta, sobre todo bajo carga alta. Los timeouts están configurados generosamente a propósito para que los streams largos no se corten a mitad de respuesta. Si una respuesta tarda, esperá — el stream sigue vivo, el modelo sigue generando. Al fin y al cabo, es gratis.

Para probar el build Windows generado en este checkout, abrí `apps/shell/release/FreeCode-DeepSeek-Harness-0.1.1-win-x64-portable.exe`; el instalador queda como `apps/shell/release/FreeCode-DeepSeek-Harness-0.1.1-win-x64-setup.exe`. El directorio desempaquetado de desarrollo es `apps/shell/release/win-unpacked/FreeCode DeepSeek Harness.exe`.

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
