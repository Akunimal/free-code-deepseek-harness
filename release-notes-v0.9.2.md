# FreeCode DeepSeek Harness v0.9.2 — Release notes / Notas de la release

## English

### Smaller desktop downloads, verified runtime on first launch

- The Windows x64 setup is about 178.5 MB and portable about 178.2 MB, down
  from roughly 304 MB each in v0.9.1.
- The DSH `0.2.1-alpha.2` Windows x64 runtime is a separate ~421.6 MB release
  asset instead of being bundled into setup/portable. If there is no valid
  per-user cache, the app downloads that pinned asset, verifies its
  SHA-256 and Electron ABI, and stores it under `<userData>/harness-runtime`.
  Later launches can reuse the verified cache offline. Any first launch
  without a valid cache therefore needs Internet access before the Harness can
  start. A failed download or validation offers Retry/Close and does not start
  the Harness.

### Fixes

- Win32-created `pwsh` child processes now start hidden, preventing transient
  console windows from stealing focus. Regression tests cover ordinary and
  restricted-token process creation.
- Update checks no longer present an older DSH runtime as an available upgrade.
- The update indicator is circular again.

### Verification

The shell Vitest suite, shell typecheck and desktop packaging were verified.
The installed v0.9.2 release was subsequently confirmed working on Windows x64.

## Español

### Descargas desktop más chicas y runtime validado en el primer inicio

- El setup Windows x64 pesa unos 178,5 MB y el portable unos 178,2 MB, frente
  a aproximadamente 304 MB cada uno en v0.9.1.
- El runtime DSH Windows x64 `0.2.1-alpha.2` se distribuye como un asset
  separado de ~421,6 MB, en vez de incluirse en setup/portable. Si no hay una
  caché válida por usuario, el primer inicio descarga ese asset fijado, verifica
  su SHA-256 y la ABI de Electron, y lo guarda en
  `<userData>/harness-runtime`. Los inicios siguientes pueden reutilizar la
  caché validada sin conexión. Por eso, cualquier primer inicio sin caché
  válida necesita Internet antes de que arranque el Harness. Si falla
  la descarga o validación, ofrece Reintentar/Cerrar y no inicia el Harness.

### Correcciones

- Los procesos `pwsh` hijos creados por Win32 ahora arrancan ocultos para que
  sus ventanas de consola transitorias no roben el foco. Los tests de regresión
  cubren la creación ordinaria y con token restringido.
- El chequeo de updates ya no ofrece un runtime DSH más viejo como actualización.
- El indicador de actualización vuelve a ser circular.

### Verificación

Se verificaron la suite Vitest del shell, el typecheck del shell y el
empaquetado desktop. Después se confirmó que la release v0.9.2 instalada
funciona en Windows x64.
