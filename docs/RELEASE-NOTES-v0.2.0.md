# FreeCode DeepSeek Harness v0.2.0

## English

- Replaced the separate browser window with an integrated visible Chromium side panel, including persistent tabs, navigation controls, durable browser sessions, and Harness `computer_use` access.
- Added tab-aware browser actions (`status`, `tabs`, `new_tab`, `select_tab`, `close_tab`, and `wait`) so the Harness can navigate and inspect the same browser surface a user sees.
- Changed the in-app brand fallback from `DSH Local Build` to `FreeCode` and localized the Session log action in English, Spanish, and Chinese.
- Migrates the legacy `DeepSeek Free (pool)` provider label to `OpenCode Free Pool` without overwriting unrelated provider customizations.
- Runs automatic update checks and shows a localized download-arrow indicator beside Settings when a FreeCode or Harness update is available; the Help menu no longer contains a manual update command.
- Uses 75% of the active model context as the automatic compaction threshold, including after switching to a model with a smaller context window, and preserves the real error from manual compaction failures.
- Adds optional RTK output compression for supported plain CLI commands when an `rtk` executable is already available. No RTK binary is installed or downloaded by FreeCode.
- Keeps transient stream/network failures retriable, preserves the last known-good model selection, and keeps ordinary tool calling headless except for the project selector.

Verification: shell typecheck; shell i18n/updater tests; seeder and contract tests; compaction tests (80 passed); browser/RTK source contracts; desktop package build.

Includes the Windows x64 NSIS installer, portable executable, blockmap, `latest.yml`, Harness runtime archive, and SHA-256 digest. This release was built and uploaded manually; GitHub Actions is intentionally not used so it does not consume the repository's free quota.

## Español

- Se reemplazó la ventana separada por un panel lateral de Chromium visible e integrado, con pestañas persistentes, controles de navegación, sesiones durables y acceso `computer_use` desde el Harness.
- Se agregaron acciones de navegador con pestañas (`status`, `tabs`, `new_tab`, `select_tab`, `close_tab` y `wait`) para que el Harness pueda navegar e inspeccionar la misma superficie que ve el usuario.
- La marca fallback de la aplicación pasó de `DSH Local Build` a `FreeCode` y la acción Session log ahora se traduce en inglés, español y chino.
- Se migra la etiqueta heredada `DeepSeek Free (pool)` a `OpenCode Free Pool` sin sobrescribir personalizaciones ajenas del provider.
- FreeCode busca actualizaciones automáticamente y muestra una flecha de descarga localizada junto a Configuración cuando hay una actualización de FreeCode o del Harness; el menú Ayuda ya no contiene un comando manual para buscar actualizaciones.
- El compactado automático usa el 75% del contexto del modelo activo, incluso después de cambiar a un modelo con una ventana de contexto menor, y conserva el error real cuando falla un compactado manual.
- Se agregó compresión opcional de salidas con RTK para comandos CLI simples compatibles cuando el ejecutable `rtk` ya está disponible. FreeCode no instala ni descarga el binario RTK.
- Se mantienen los reintentos ante fallos transitorios de red/stream, la última selección válida del catálogo y el tool calling normal en modo headless, dejando visible sólo el selector de proyecto cuando corresponde.

Verificación: typecheck del shell; tests de idioma/actualizador; tests del seeder y contratos; tests de compactado (80 pasaron); contratos de navegador/RTK; build del paquete de escritorio.

Incluye instalador NSIS Windows x64, ejecutable portable, blockmap, `latest.yml`, archivo del runtime del Harness y digest SHA-256. Esta release se compiló y subió manualmente; GitHub Actions se mantiene fuera del proceso para no consumir la cuota gratuita del repositorio.
