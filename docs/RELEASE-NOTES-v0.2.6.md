# FreeCode DeepSeek Harness v0.2.6

## English

### Fixed

- Startup preflight no longer kills the app during the auto-update settling window. The v0.2.5 preflight ran a single synchronous layout check right after launch and exited on any incompleteness; during an auto-update, `electron-updater` relaunches the app in the window where the NSIS setup has only just finished extracting 600+ `node_modules` directories, and Windows disk buffering / indexing / antivirus can make a freshly written directory read as briefly empty. The preflight now retries up to six times with a one-second delay; a genuinely broken install stays empty across every attempt and still fails with the same actionable dialog.

### Build and operations

- Windows setup, portable, Linux AppImage, and Harness runtime artifacts were built locally and are published manually. (v0.2.6 was tagged but rolled into the v0.2.7 release.)

## Español

### Corregido

- El preflight de arranque ya no mata la app durante la ventana de asentamiento del auto-update. El preflight de v0.2.5 corría un único chequeo síncrono justo tras el arranque y salía ante cualquier incompletitud; durante un auto-update, `electron-updater` relanza la app en el instante donde el setup NSIS recién terminó de extraer 600+ directorios de `node_modules`, y el buffering de disco / indexado / antivirus de Windows pueden hacer que un directorio recién escrito se lea como vacío por un instante. El preflight ahora reintenta hasta seis veces con un segundo de delay; un install genuinamente roto queda vacío en todos los intentos y falla igual con el mismo diálogo accionable.

### Build y operaciones

- Los artefactos Windows setup, portable, Linux AppImage y runtime del Harness se compilaron localmente y se publican manualmente. (v0.2.6 fue etiquetada pero se integró en la release v0.2.7.)
