# FreeCode DeepSeek Harness v0.2.3

## English

### Fixed

- The Win32 native directory picker worker now sets `ELECTRON_RUN_AS_NODE=1` explicitly in the spawned child process environment, preventing the silent crash reported as `directory picker failed: win32 folder dialog worker exited before reporting a result` when the variable was not inherited from the parent.
- The worker exit handler now includes the exit code in the error message for diagnostics.
- The worker's pre-flight checks (`DSH_DIALOG_TITLE`, IPC channel) now write diagnostic messages to stderr before exiting, pointing at `ELECTRON_RUN_AS_NODE` as a likely cause.
- The NSIS installer now removes stale runtime directories (`node_modules`, `packages`, `apps`) from the previous installation before extracting the new payload. User data in `%APPDATA%` is never touched.
- Installed (non-portable) builds write an `install-version.txt` marker to `%APPDATA%\FreeCode DeepSeek Harness\`. Portable builds check this marker at startup and warn if a newer installed version exists, prompting the user to update or remove the stale portable.

### Build and operations

- Shell typecheck and shell tests pass locally.
- Windows setup, portable, and Harness runtime artifacts were built locally and are published manually.

Source range: `v0.2.2..HEAD`
Reviewed commands: `pnpm --filter @freecode/shell typecheck`, `pnpm --filter @freecode/shell test`, `pnpm build:desktop`.

## Español

### Corregido

- El worker del directory picker nativo Win32 ahora fija `ELECTRON_RUN_AS_NODE=1` explícitamente en el entorno del proceso hijo, evitando el crash silencioso reportado como `directory picker failed: win32 folder dialog worker exited before reporting a result` cuando la variable no se heredaba del padre.
- El handler de salida del worker ahora incluye el código de salida en el mensaje de error para diagnóstico.
- Los chequeos previos del worker (`DSH_DIALOG_TITLE`, canal IPC) ahora escriben mensajes de diagnóstico a stderr antes de salir, señalando `ELECTRON_RUN_AS_NODE` como causa probable.
- El instalador NSIS ahora elimina directorios de runtime obsoletos (`node_modules`, `packages`, `apps`) de la instalación anterior antes de extraer el nuevo payload. Los datos del usuario en `%APPDATA%` no se tocan.
- Las builds instaladas (no portables) escriben un marker `install-version.txt` en `%APPDATA%\FreeCode DeepSeek Harness\`. Las builds portables verifican este marker al arrancar y avisan si hay una versión instalada más reciente, indicando al usuario que actualice o elimine el portable obsoleto.

### Build y operaciones

- El typecheck y tests del shell pasan localmente.
- Los artefactos Windows setup, portable y runtime del Harness se compilaron localmente y se publican manualmente.

Rango fuente: `v0.2.2..HEAD`
Comandos revisados: `pnpm --filter @freecode/shell typecheck`, `pnpm --filter @freecode/shell test`, `pnpm build:desktop`.
