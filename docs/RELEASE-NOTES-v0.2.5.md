# FreeCode DeepSeek Harness v0.2.5

## English

### Fixed

- Bounded pre-stream retry across workers: when the load balancer sees a 429/5xx or a connect error before any downstream byte is sent, it fans out to up to three distinct workers (each a different opencode2api exit rotation). The request body is buffered once for replay; once `res.writeHead` runs and the pipe starts, no retry ever fires. 429 responses do not park the worker; 5xx/connect failures park it ~8s. Sticky sessions are committed to the worker that actually served.
- The harness webview now reflows around the embedded browser panel instead of being covered by it. The harness is composed as an explicit `WebContentsView` child of the window so `setBounds` can shrink it when the browser opens.
- Closing the main window with the X button hides to the tray instead of destroying the window; tray click, double-click, and the "Show" menu item all restore the same window, and a destroyed window is recreated from the harness URL.
- Startup preflight verifies the harness runtime layout before spawning the supervisor and surfaces a specific error instead of the opaque "supervisor gave up".
- The stuck-supervisor dialog includes the last 800 characters of dsh stderr.

### Build and operations

- New pre-package gates (`verify-nsis-hooks`, `verify-vendor-bundles-fresh`, `smoke:nsis`) refuse to build a broken installer. Windows setup, portable, Linux AppImage, and Harness runtime artifacts were built locally and are published manually.

## Español

### Corregido

- Retry acotado pre-stream entre workers: cuando el load balancer ve un 429/5xx o error de conexión antes de mandar ningún byte al cliente, prueba hasta tres workers distintos (cada uno = rotación de exit distinta de opencode2api). El body del request se bufferea una vez para reintentar; una vez que corre `res.writeHead` y arranca el pipe, nunca reintenta. Las 429 no parkean el worker; 5xx/connect lo parkean ~8s. Las sticky sessions se commitean al worker que efectivamente sirvió.
- El webview del harness ahora se reacomoda alrededor del panel del navegador embebido en vez de quedar tapado. El harness se compone como `WebContentsView` explícito hijo de la ventana para que `setBounds` pueda achicarlo cuando abre el navegador.
- Cerrar la ventana principal con la X minimiza al tray en vez de destruir la ventana; el click, doble-click y el ítem "Mostrar" del tray restauran la misma ventana, y una ventana destruida se recrea desde la URL del harness.
- El preflight de arranque verifica el layout del runtime del harness antes de spawnear el supervisor y muestra un error específico en vez del opaco "supervisor se rindió".
- El diálogo de supervisor colgado incluye los últimos 800 caracteres del stderr de dsh.

### Build y operaciones

- Nuevos gates pre-package (`verify-nsis-hooks`, `verify-vendor-bundles-fresh`, `smoke:nsis`) rechazan buildear un instalador roto. Los artefactos Windows setup, portable, Linux AppImage y runtime del Harness se compilaron localmente y se publican manualmente.
