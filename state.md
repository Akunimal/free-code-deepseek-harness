# state.md — free-code-deepseek-harness

> Estado de continuidad al **2026-08-18**. La auditoría de release quedó consolidada localmente en la rama `dev`; queda empujar el commit/tag corregido, confirmar el workflow y completar la autorización de GitHub para borrar el repositorio standalone anterior.

## 1. Repositorio

- Ruta: `I:\DeepSeek-Harness\free-code-deepseek-harness`.
- Rama activa: `dev`; `main` no fue modificada.
- Remotes: `origin https://github.com/Akunimal/deepseek-harness.git` (actual public fork), `upstream https://github.com/deepseek-ai/deepseek-harness.git`, and `product https://github.com/Akunimal/free-code-deepseek-harness.git` (previous standalone repository, pending deletion after `delete_repo` authorization).
- GitHub fork status: `Akunimal/deepseek-harness` is public, `isFork: true`, parent `deepseek-ai/deepseek-harness`; this work is published on its `dev` branch.
- Último commit local: `d8e5e54830 ci: harden clean release and portable builds`; contiene las correcciones de CI, portable, pool/slider, permisos, tests y documentación y está listo para empujar a `origin/dev`.
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
| CI/release | Corregida localmente: workflow solo para tags `v*`, matriz Windows/macOS/Linux, instalación limpia de upstream, build de los cuatro binarios nativos, tests, build y artifacts de Release. Falta publicar y confirmar el nuevo run. |

## 3. Features documentadas

`README.md`, `README.en.md` y `docs/UPSTREAM-FEATURES.md` describen el inventario completo de los **219 paquetes declarados** del harness DeepSeek upstream: web app y boot manifest, CLI `dsh web`, configuración, providers y modelos, OAuth/keys, streaming y conversaciones, extensiones/plugins, skills, MCP, subagents, worktrees, compaction, attachments, export/import, búsqueda, settings, temas, shortcuts, workspace/project management, terminal, permisos, storage, telemetría, assets/build output y límites de empaquetado.

La documentación también cubre las capas propias del proyecto: supervisor de procesos, pool/LB OpenCode, cuenta pública `Bearer public` preconfigurada para DeepSeek Free sin sobrescribir claves privadas, seeding/refresco de providers, detector OmniRoute, secret store, IPC zod, importador de chats, workspace bridge, runtime packaged, logging, updater, tests, release y seguridad. `packages/contract-tests/tests/docs.contract.test.ts` verifica que el inventario de paquetes vendor y sus READMEs no queden sin documentar.

## 4. Runtime y empaquetado

- `scripts/package-runtime.sh` compila el vendor, crea una instalación completa (no `--prod`), usa `--node-linker=hoisted`, materializa los paquetes workspace y elimina `.bin` para evitar shims incompatibles con NSIS.
- `scripts/run-package-runtime.mjs` propaga `DSH_TARGET_OS`/`DSH_TARGET_CPU` desde Node para que una ejecución bajo WSL produzca dependencias nativas del target real.
- `apps/shell/src/main/resource-paths.ts` distingue desarrollo de packaged resources y usa `ELECTRON_RUN_AS_NODE=1` con el ejecutable de Electron cuando corresponde.
- `apps/shell/electron-builder.yml` genera `com.freecode.deepseekharness` con `extraResources`, asar, icono, instalador NSIS y `.exe` portable, y publica en el fork `Akunimal/deepseek-harness` como GitHub draft.
- El portable Windows usa `PORTABLE_EXECUTABLE_DIR` (o `FREECODE_PORTABLE_DIR` en una ejecución manual) para guardar `data/` junto al ejecutable; el runtime, CLI, UI, dependencias nativas y workers viajan dentro del artefacto.
- El overlay expone un slider live de 1..16 worker slots (default 4). Son procesos locales que comparten `Bearer public`; no son cuentas nuevas ni evaden límites por IP/cuota.
- Se verificó un instalador Windows final y su `win-unpacked`: CLI, web root, `window.__DSH_BOOT__`, `sharp-win32-x64`, `koffi-win32-x64`, `@deepseek-ai/node-addon-landlock-run` y ausencia de `.bin`.

## 5. Verificación ejecutada

- `pnpm test`: **3 paquetes, 13 archivos de test, 44 tests verdes** (9 adapter, 13 contracts, 22 shell); prepara automáticamente los 234 enlaces de paquetes upstream que necesita el loader dinámico.
- `pnpm test:contract`: **4 archivos, 13 tests verdes**.
- `pnpm typecheck`: verde para `opencode-adapter` y shell.
- UI upstream: skeleton conversation test **18/18 verde**.
- `git diff --check`: verde para la auditoría actual.
- `pnpm build:shell`: verde.
- `pnpm build:desktop`: pipeline completo ejecutado; después se corrigió la selección de dependencias nativas para target Windows y se volvió a verificar el stage y `electron-builder`.
- Smoke real packaged: `dsh web --help` y `dsh web --host 127.0.0.1 --port 0`; HTTP 200 y boot manifest servido. El ejecutable desempaquetado arrancó con `FREECODE_PORTABLE_DIR` y creó `data/logs/app.log` en el directorio elegido.
- Artefactos Windows locales: `apps/shell/release/FreeCode-DeepSeek-Harness-0.1.0-win-x64-portable.exe`, `apps/shell/release/FreeCode-DeepSeek-Harness-0.1.0-win-x64-setup.exe` y `apps/shell/release/win-unpacked/FreeCode DeepSeek Harness.exe`.

## 6. Próximos pasos explícitos

1. Empujar `d8e5e54830` a `dev`, recrear/empujar `v0.1.0` y verificar el workflow multiplataforma.
2. Completar `gh auth refresh --hostname github.com --scopes delete_repo` y borrar `Akunimal/free-code-deepseek-harness`; mantener como fuente pública el fork `Akunimal/deepseek-harness`.
3. Cuando el árbol esté limpio y se autorice la actualización upstream, ejecutar `bash scripts/sync-upstream.sh` y revisar el diff de subtree.

## 7. Reglas operativas

- Usar `pnpm build:desktop` para empaquetar; no llamar directamente al script Bash si el target debe inferirse desde Node.
- El updater solo se activa con `FREECODE_ENABLE_UPDATES=1`.
- El fondo animado es intencionalmente liviano: gradientes radiales animados, `contain: strict`, `pointer-events: none` y fallback reducido para usuarios con movimiento reducido.
- No subir `apps/shell/resources/freecode/` ni `apps/shell/release/` al repositorio.
