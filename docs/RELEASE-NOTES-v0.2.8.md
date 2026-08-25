# FreeCode DeepSeek Harness v0.2.8

## English

### Fixed

- Fixed the Windows NSIS upgrade regression that could leave `dsh/packages/` and `dsh/node_modules/` empty. Upgrades no longer run a stale previous uninstaller against the shared install directory; the shipped `resources/freecode` payload is cleared before the new payload is extracted.
- Added installer guardrails: the NSIS hook gate rejects unsupported cleanup hooks, and the post-build smoke test requires real files plus populated `packages/` and `node_modules/` directories.
- Added a local 0.2.4 → 0.2.8 upgrade smoke that proves stale payload files are removed while user data survives.
- Increased the Windows Harness cold-start readiness budget to 90 seconds so first-run profile materialization is not killed as a false supervisor failure.

### Build and operations

- Windows setup, portable, Linux AppImage, and Harness runtime artifacts are built locally and uploaded manually.

## Español

### Corregido

- Se corrigió la regresión de actualización NSIS en Windows que podía dejar vacíos `dsh/packages/` y `dsh/node_modules/`. Las actualizaciones ya no ejecutan un desinstalador anterior obsoleto contra la carpeta compartida; el payload `resources/freecode` se limpia antes de extraer el nuevo.
- Se agregaron guardrails del instalador: el gate de hooks NSIS rechaza limpiezas no soportadas y el smoke test posterior al build exige archivos reales y directorios `packages/` y `node_modules/` poblados.
- Se agregó un smoke local de actualización 0.2.4 → 0.2.8 que demuestra que se eliminan los restos del payload viejo y sobreviven los datos del usuario.
- Se amplió a 90 segundos el presupuesto de readiness del Harness en Windows para que la materialización del perfil en el primer arranque no se mate como un falso fallo del supervisor.

### Build y operaciones

- Los artefactos Windows setup, portable, Linux AppImage y runtime del Harness se compilan localmente y se suben manualmente.
