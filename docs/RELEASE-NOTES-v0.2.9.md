# FreeCode DeepSeek Harness v0.2.9

## English

### Fixed

- Fixed the packaged Windows preflight falsely reporting populated `packages/` and `node_modules/` directories as empty. The ESM entrypoint now uses the imported filesystem API instead of an unavailable CommonJS `require`.
- Added release contracts that prevent the ESM/CommonJS regression and stale vendored bundles from returning.
- Repaired missing Start Menu and Desktop shortcuts during install or upgrade without deleting or rewriting the extracted runtime payload.
- Kept ordinary Windows tool subprocesses headless by hiding both Node child launches and the Win32 startup window state; the folder picker remains the intentional GUI path.
- Bound the About dialog to the packaged application version so it cannot display a stale hardcoded version.

### Verification

- Reproduced the failure against the installed `0.2.8` executable with 49 packages and 634 node-module directories present.
- `pnpm test`: 20 adapter tests, 22 contract tests plus 12 explicit platform skips, and 76 shell tests passed.
- `pnpm test:contract`, `pnpm typecheck`, the 37-test Windows ACL regression suite, `verify-nsis-hooks`, and the 229-package bundle freshness check passed.
- `pnpm build:desktop` rebuilt the Windows setup, portable executable, Harness runtime archive, blockmap, update metadata, and SHA-256 digest.
- The isolated fresh-install smoke passed its layout, installed-runtime boot/headless, and cleanup checks; the 0.2.4-upgrade smoke passed with payload replacement, runtime boot, user-data preservation, and cleanup. A later fresh-install rerun hit the original 30-second cold-start bound under host contention after layout had passed; the bound is now hardened to 120 seconds. These smokes use temporary targets and never run against an active user installation.

### Artifacts

- `FreeCode-DeepSeek-Harness-0.2.9-win-x64-setup.exe`
- `FreeCode-DeepSeek-Harness-0.2.9-win-x64-setup.exe.blockmap`
- `FreeCode-DeepSeek-Harness-0.2.9-win-x64-portable.exe`
- `latest.yml`
- `deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz`
- `deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz.sha256`

This release is built and uploaded manually; GitHub Actions is intentionally not used.

## Español

### Corregido

- Se corrigió el preflight empaquetado de Windows que informaba falsamente como vacíos `packages/` y `node_modules/` aunque estaban poblados. El entrypoint ESM ahora usa la API de filesystem importada en lugar de un `require` CommonJS inexistente.
- Se agregaron contratos de release que impiden que vuelvan la regresión ESM/CommonJS y los bundles vendorizados desactualizados.
- Se reparan los accesos directos faltantes del menú Inicio y del Escritorio durante la instalación o actualización sin borrar ni reescribir el payload extraído del runtime.
- Los subprocesos de herramientas normales en Windows permanecen headless ocultando tanto los lanzamientos de Node como el estado de ventana de inicio de Win32; el selector de carpeta sigue siendo la ruta GUI intencional.
- El diálogo About usa la versión del ejecutable empaquetado y no puede mostrar una versión hardcodeada obsoleta.

### Verificación

- Se reprodujo el fallo contra el ejecutable instalado `0.2.8` con 49 paquetes y 634 directorios de módulos presentes.
- `pnpm test`: pasaron 20 tests del adapter, 22 tests de contratos más 12 skips explícitos de plataforma y 76 tests del shell.
- Pasaron `pnpm test:contract`, `pnpm typecheck`, el suite de 37 tests de regresión ACL de Windows, `verify-nsis-hooks` y la freshness de 229 paquetes.
- `pnpm build:desktop` reconstruyó el setup de Windows, el ejecutable portable, el archivo de runtime del Harness, el blockmap, la metadata de actualización y el digest SHA-256.
- El smoke aislado de instalación nueva pasó layout, boot/headless del runtime instalado y cleanup; el smoke de actualización desde 0.2.4 pasó reemplazo del payload, boot del runtime, preservación de user-data y cleanup. Una repetición posterior de instalación nueva alcanzó layout pero excedió el límite original de 30 segundos durante el cold-start bajo carga del host; el límite ahora está reforzado a 120 segundos. Estos smokes usan targets temporales y nunca se ejecutan contra una instalación activa del usuario.

### Artefactos

- `FreeCode-DeepSeek-Harness-0.2.9-win-x64-setup.exe`
- `FreeCode-DeepSeek-Harness-0.2.9-win-x64-setup.exe.blockmap`
- `FreeCode-DeepSeek-Harness-0.2.9-win-x64-portable.exe`
- `latest.yml`
- `deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz`
- `deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz.sha256`

Esta release se compila y sube manualmente; GitHub Actions no se usa intencionalmente.
