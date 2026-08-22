# Changelog

## 0.1.7 — 2026-08-22

### Fixed

- La política de razonamiento ahora es por modelo: solo los modelos DeepSeek publican `off/low/high/max`; el resto queda explícitamente sin razonamiento.
- Las instalaciones existentes migran `reasoning: high` y `agent-default-model.reasoningEffort` obsoletos, evitando que `x-preview-f` u otro modelo sin razonamiento falle con `UNSUPPORTED_REASONING_EFFORT`.
- El adaptador pi-ai ignora defaults de ruta heredados cuando el modelo seleccionado no declara razonamiento, pero conserva el rechazo de efforts explícitos incompatibles.
- El instalador NSIS ya incluye los overrides y parches efectivos de proceso y desinstalación; evita falsos positivos al detectar la aplicación y no aborta porque el desinstalador anterior devuelva un exit code no fatal.
- Las entradas de registro antiguas que apuntan a un desinstalador inexistente ya no dejan la instalación nueva trabajando indefinidamente.
- Se conserva el fallback nativo de extracción de electron-builder; se eliminó un parche frágil que podía dejar el script LogicLib sin un `${endIf}` balanceado.

### Build and operations

- `electron-builder@25.1.8` resuelve la misma copia de `app-builder-lib` que compila el instalador; la configuración activa conecta `beforePack` y `nsis.include` explícitamente.
- `electron-winstaller` quedó habilitado en `allowBuilds`, permitiendo que `pnpm install` y el build local terminen.
- Se reconstruyeron localmente los artefactos NSIS y portable 0.1.7 con `--publish never`.
- Se ejecutó el setup silenciosamente con exit code `0` usando el destino citado; se verificaron ejecutable, `app.asar`, runtime con el fix, desinstalador, registro HKCU y shortcut del menú Inicio apuntando a la ruta correcta.

### Release status

- Esta es una actualización de artefactos y documentación local. No se creó release remota ni se ejecutó ningún workflow de GitHub.

Source: working-tree changes audited on 2026-08-22 (no tag range; pre-existing model/pool work remains in the repository).
Reviewed commands: `pnpm install`, `pnpm build:desktop`, `pnpm --filter @freecode/shell typecheck`, `pnpm --filter @freecode/shell test -- --run` (8 files / 28 tests), vendored `llm-pi-ai` adapter tests (46), catalog/config tests (58), `pnpm --filter @freecode/opencode-adapter test` (10 tests), `git diff --check`, silent NSIS install with `/S` and quoted `/D`, registry/filesystem/shortcut checks. No remote release or GitHub workflow was used.
