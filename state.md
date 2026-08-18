# state.md — free-code-deepseek-harness

> Estado de continuidad al **2026-08-17**. La implementación restante del plan fue ejecutada y verificada en la rama `dev`.

## 1. Repositorio

- Ruta: `I:\DeepSeek-Harness\free-code-deepseek-harness`.
- Rama activa: `dev`; `main` no fue modificada.
- Remote: `origin https://github.com/Akunimal/free-code-deepseek-harness.git`.
- El árbol está deliberadamente sin commit: los cambios de esta sesión son los cambios de producto que deben revisarse y commitearse por el flujo del equipo.
- Los artefactos generados grandes están ignorados: `apps/shell/resources/freecode/` y `apps/shell/release/`.

## 2. Estado de fases

| Fase | Estado |
|---|---|
| 0–10.6 | Completadas y verificadas: bootstrap, vendors, adapter/LB, supervisor, seeder, refresher, detector, secret store, shell Electron, IPC, chat importer y workspace bridge. |
| 11 | Implementada: `scripts/sync-upstream.sh` y `docs/UPSTREAM-SYNC.md`. No se ejecutó el sync real porque requiere árbol limpio y crea una rama externa al trabajo actual. |
| 12 | Completa: contract tests para CLI, readiness, settings/provider RPC, LB, SSE, opencode2api y `window.__DSH_BOOT__`. |
| 13 | Completa: runtime reproducible, materialización de workspace links, resolución packaged/dev, Electron Builder, icono, scripts de desarrollo y build multiplataforma. |
| 14 | Completa: updater GitHub opt-in, descarga manual y auto-install al cerrar; permanece desactivado por defecto. |
| 15 | Completa: logging pino rotado en `<userData>/logs/app.log`. |
| 16 | Completa: README español/inglés y documentación técnica exhaustiva. |
| UI | Completa: fondo animado CSS por conversación, inspirado en Hermes GUI, sin canvas ni loop JavaScript. Respeta `prefers-reduced-motion`. |
| CI/release | Completa: workflow solo para tags `v*`, matriz Windows/macOS/Linux, tests, build y artifacts de Release. |

## 3. Features documentadas

`README.md`, `README.en.md` y `docs/UPSTREAM-FEATURES.md` describen el inventario completo de los **219 paquetes declarados** del harness DeepSeek upstream: web app y boot manifest, CLI `dsh web`, configuración, providers y modelos, OAuth/keys, streaming y conversaciones, extensiones/plugins, skills, MCP, subagents, worktrees, compaction, attachments, export/import, búsqueda, settings, temas, shortcuts, workspace/project management, terminal, permisos, storage, telemetría, assets/build output y límites de empaquetado.

La documentación también cubre las capas propias del proyecto: supervisor de procesos, pool/LB OpenCode, seeding/refresco de providers, detector OmniRoute, secret store, IPC zod, importador de chats, workspace bridge, runtime packaged, logging, updater, tests, release y seguridad. `packages/contract-tests/tests/docs.contract.test.ts` verifica que el inventario de paquetes vendor y sus READMEs no queden sin documentar.

## 4. Runtime y empaquetado

- `scripts/package-runtime.sh` compila el vendor, crea una instalación completa (no `--prod`), usa `--node-linker=hoisted`, materializa los paquetes workspace y elimina `.bin` para evitar shims incompatibles con NSIS.
- `scripts/run-package-runtime.mjs` propaga `DSH_TARGET_OS`/`DSH_TARGET_CPU` desde Node para que una ejecución bajo WSL produzca dependencias nativas del target real.
- `apps/shell/src/main/resource-paths.ts` distingue desarrollo de packaged resources y usa `ELECTRON_RUN_AS_NODE=1` con el ejecutable de Electron cuando corresponde.
- `apps/shell/electron-builder.yml` genera `com.freecode.deepseekharness` con `extraResources`, asar, icono y publicación GitHub draft.
- Se verificó un instalador Windows final y su `win-unpacked`: CLI, web root, `window.__DSH_BOOT__`, `sharp-win32-x64`, `koffi-win32-x64`, `@deepseek-ai/node-addon-landlock-run` y ausencia de `.bin`.

## 5. Verificación ejecutada

- `pnpm test`: **3 paquetes, 13 archivos de test, 40 tests verdes** (7 adapter, 13 contracts, 20 shell).
- `pnpm test:contract`: **4 archivos, 13 tests verdes**.
- `pnpm typecheck`: verde para `opencode-adapter` y shell.
- UI upstream: skeleton conversation test **18/18 verde**.
- `git diff --check`: verde.
- `pnpm build:shell`: verde.
- `pnpm build:desktop`: pipeline completo ejecutado; después se corrigió la selección de dependencias nativas para target Windows y se volvió a verificar el stage y `electron-builder`.
- Smoke real packaged: `dsh web --help` y `dsh web --host 127.0.0.1 --port 0`; HTTP 200 y boot manifest servido.

## 6. Próximos pasos explícitos

1. Revisar los cambios y crear commits en `dev`.
2. Cuando el árbol esté limpio y se autorice la actualización upstream, ejecutar `bash scripts/sync-upstream.sh` y revisar el diff de subtree.
3. Para publicar, completar UAT manual de zero-config, hacer el squash `dev`→`main` y crear el tag `v0.1.0` según el proceso del equipo. No se creó commit, squash ni tag automáticamente en esta sesión.

## 7. Reglas operativas

- Usar `pnpm build:desktop` para empaquetar; no llamar directamente al script Bash si el target debe inferirse desde Node.
- El updater solo se activa con `FREECODE_ENABLE_UPDATES=1`.
- El fondo animado es intencionalmente liviano: gradientes radiales animados, `contain: strict`, `pointer-events: none` y fallback reducido para usuarios con movimiento reducido.
- No subir `apps/shell/resources/freecode/` ni `apps/shell/release/` al repositorio.
