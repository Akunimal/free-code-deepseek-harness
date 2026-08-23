# FreeCode DeepSeek Harness v0.2.2

## English

### Fixed

- Suppressed the misleading first-start `Model catalog degraded` notification while the OpenCode Free workers and model probes are still warming. Real catalog transitions after startup continue to notify.
- Serialized concurrent update checks so the download arrow cannot present stale metadata while another check is still running.
- Added a release preflight before `electron-updater` downloads, preventing `Please check update first` when the indicator was clicked during a background check.
- Anchored the circular download indicator to the Settings footer row instead of fixed coordinates that could cover the Settings gear; it stays hidden when the installed release is already current.
- Fixed the embedded Chromium address bar: Enter and Go now dispatch reliably, bare hosts are normalized to HTTPS, and opening the browser resizes the Harness viewport so conversation text reflows instead of being covered by the browser panel.
- Forced Windows PTY tool terminals through ConPTY; regular child processes keep their hidden-window policy.

### Tests and operations

- Added regression coverage for initial backend settling and concurrent update checks.
- Shell typecheck and shell tests pass locally.
- Release publication remains manual and is performed manually after artifact review; the generated installer is run only as an explicit operator action.

## Español

### Corregido

- Se suprimió el aviso engañoso inicial `Catálogo de modelos degradado` mientras los workers de OpenCode Free y los probes de modelos todavía están calentando. Las transiciones reales del catálogo después del arranque siguen notificándose.
- Se serializaron los checks de actualización concurrentes para que la flecha no presente metadatos viejos mientras otro check sigue en curso.
- Se agregó un preflight antes de que `electron-updater` descargue, evitando `Please check update first` cuando se pulsa la flecha durante un check automático.
- La flecha circular de descarga ahora se ancla a la fila de Configuración en vez de usar coordenadas fijas que podían cubrir el engranaje, y permanece oculta cuando la release instalada ya es la última.
- Se corrigió la barra de direcciones del Chromium embebido: Enter e Ir ahora despachan de forma confiable, los hosts sin esquema se normalizan a HTTPS y al abrir el navegador se reduce el viewport del Harness para que el texto se reacomode en vez de quedar tapado por el panel.
- Los terminales PTY de herramientas en Windows ahora usan ConPTY; los procesos hijos normales conservan la política de ventanas ocultas.

### Tests y operaciones

- Se agregó cobertura de regresión para la estabilización inicial del backend y los checks de actualización concurrentes.
- El typecheck y los tests del shell pasan localmente.
- La publicación de releases sigue siendo manual y se realiza manualmente después de revisar los artefactos; el instalador generado solo se ejecuta como acción explícita del operador.
