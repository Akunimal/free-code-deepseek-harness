# free-code-deepseek-harness

> Shell de escritorio multiplataforma para [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): zero-config, proveedor DeepSeek Free de fábrica, pool local de workers `opencode2api` y la interfaz web completa del harness.

[English](README.en.md)

## Sobre este fork

Este repositorio es el fork público de [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness). Conserva el harness original y agrega una aplicación GUI de escritorio para ejecutarlo como producto multiplataforma: Electron administra los procesos locales, prepara el proveedor DeepSeek Free, levanta el `opencode2api` pool y abre la interfaz web completa del harness dentro de una ventana nativa.

La rama de producto es `dev`; el fork mantiene `master` como referencia del upstream. Cada tag `v*` dispara una release reproducible con builds nativos para las tres plataformas soportadas:

- Windows: instalador NSIS `.exe`.
- macOS: aplicación/DMG de Electron.
- Linux: paquete de escritorio/AppImage de Electron.

Los artifacts se construyen en una matriz Windows/macOS/Linux, pasan los tests de contrato y se publican en la release de GitHub del fork. No es una UI de demostración: cada build incluye el runtime del harness, sus dependencias workspace, el pool local, la configuración zero-config y las superficies web upstream documentadas abajo.

## Qué entrega

Esta aplicación empaqueta el harness upstream y agrega la capa desktop necesaria para usarlo sin preparar manualmente procesos, puertos ni providers:

- Arranca `opencode2api` en un pool local, con health checks, round-robin, sticky sessions, SSE transparente, backoff y presupuesto de respawn.
- Levanta `dsh web` en loopback, detecta readiness, reinicia el harness y abre su UI en una ventana Electron aislada/sandboxed.
- Siembra `deepseek-free` apuntando al pool, conserva providers del usuario y actualiza el catálogo de modelos por latencia cada 30 minutos o bajo demanda.
- Detecta rutas OpenAI-compatible locales de OmniRoute, guarda secretos mediante keytar o fallback de archivo y expone IPC zod tipado por preload.
- Incluye ventana, tray, notificaciones, overlay de estado del pool, abrir la carpeta de configuración, importación OpenCode SQLite/ChatML y continuación en workspace.
- Escribe logs JSONL rotados, soporta actualizaciones GitHub opt-in, prepara stages reproducibles y publica únicamente desde tags `v*`.
- Añade un fondo animado por conversación en CSS: dos gradientes radiales livianos, sin canvas ni loop JavaScript, con soporte para `prefers-reduced-motion`.

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

Todo lo local escucha en `127.0.0.1`. El vault resuelve secretos hacia el proceso hijo sin mutar `process.env`. Las actualizaciones están desactivadas por defecto; `FREECODE_ENABLE_UPDATES=1` habilita el check contra GitHub Releases. El runtime guarda `dsh-home`, workers y logs bajo el `userData` de Electron.

## Estado del proyecto

La rama de trabajo es `dev`. El contrato del harness, la suite del shell, la UI upstream modificada y el empaquetado reproducible deben pasar antes de fusionar a `main`. Ver [state.md](state.md) para continuidad operativa.

## Licencia

MIT — ver [LICENSE](LICENSE) y [NOTICE](NOTICE). El código upstream conserva sus avisos y licencia dentro de `vendor/deepseek-harness`.
