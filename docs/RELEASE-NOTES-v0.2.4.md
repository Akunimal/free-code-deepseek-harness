# FreeCode DeepSeek Harness v0.2.4

## English

### Fixed

- The Win32 directory picker no longer crashes under packaged Electron. When FreeCode runs as a packaged Electron app, the koffi-backed IFileOpenDialog child process fails because koffi's NAPI bindings are incompatible with Electron's Node runtime (`ELECTRON_RUN_AS_NODE=1`). A new Electron dialog bridge solves this: the shell's main process exposes a loopback HTTP endpoint that calls `dialog.showOpenDialog()`, and the Harness's native picker delegates to it instead of spawning a koffi worker. The bridge is token-authenticated and win32-only. Non-Electron hosts (CLI, server) continue using the koffi worker unchanged.

### Build and operations

- Shell typecheck and shell tests pass locally.
- Vendor native-picker tests pass (19 tests, 3 new for bridge path).
- Windows setup, portable, Linux AppImage, and Harness runtime artifacts were built locally and are published manually.

Source range: `v0.2.3..HEAD`
Reviewed commands: `pnpm --filter @freecode/shell typecheck`, `pnpm --filter @freecode/shell test`, `vitest run packages/host/directory-picker-native/tests/native-picker.spec.ts`.

## Español

### Corregido

- El directory picker Win32 ya no se cuelga en Electron empaquetado. Cuando FreeCode corre como app Electron empaquetada, el proceso hijo IFileOpenDialog basado en koffi falla porque los bindings NAPI de koffi son incompatibles con el runtime Node de Electron (`ELECTRON_RUN_AS_NODE=1`). Un nuevo bridge de diálogo Electron resuelve esto: el proceso principal del shell expone un endpoint HTTP loopback que llama a `dialog.showOpenDialog()`, y el picker nativo del Harness delega a él en lugar de lanzar un worker koffi. El bridge usa autenticación por token y es exclusivo de win32. Los hosts sin Electron (CLI, servidor) siguen usando el worker koffi sin cambios.

### Build y operaciones

- El typecheck y tests del shell pasan localmente.
- Los tests del native-picker del vendor pasan (19 tests, 3 nuevos para el path del bridge).
- Los artefactos Windows setup, portable, Linux AppImage y runtime del Harness se compilaron localmente y se publican manualmente.

Rango fuente: `v0.2.3..HEAD`
Comandos revisados: `pnpm --filter @freecode/shell typecheck`, `pnpm --filter @freecode/shell test`, `vitest run packages/host/directory-picker-native/tests/native-picker.spec.ts`.
