# FreeCode DeepSeek Harness v0.1.8

## English

- Embedded visible Chromium browser with a persistent profile and `computer_use` support for the Harness.
- Complete English, Spanish, and Chinese localization across the web UI, native menus, and tray; fixed the language selector and remaining untranslated labels.
- Keeps `x-preview-f` exposed during slow or degraded catalog probes; the model refresh timeout is 120 seconds and the last known-good selection is preserved.
- Migrates the visible provider label from the legacy `DeepSeek Free (pool)` name to `OpenCode Free Pool`, including existing installations.
- Resilient handling for transient `network_error` failures and headless tool-calling paths, keeping only the project selector visible when required.
- Restored CSS animated conversation backgrounds with `prefers-reduced-motion` support.
- Updated the desktop shell and the DeepSeek Harness runtime.
- Updated the README screenshot.

Includes the Windows x64 NSIS installer, portable executable, blockmap, `latest.yml`, Harness runtime archive, and SHA-256 digest. This release was built and uploaded manually; GitHub Actions is intentionally not used so it does not consume the free repository quota.

## Español

- Navegador Chromium embebido visible con perfil persistente y soporte `computer_use` para el Harness.
- Localización completa en inglés, español y chino en la interfaz web, los menús nativos y la bandeja; se corrigieron el selector de idioma y las etiquetas que quedaban sin traducir.
- `x-preview-f` permanece expuesto durante probes lentas o degradadas del catálogo; el timeout de refresco es de 120 segundos y se conserva la última selección válida.
- Migra la etiqueta visible del provider desde el nombre heredado `DeepSeek Free (pool)` a `OpenCode Free Pool`, también en instalaciones existentes.
- Manejo resiliente de fallos transitorios `network_error` y de las rutas de tool calling headless, manteniendo visible sólo el selector de proyecto cuando corresponde.
- Fondos animados CSS de las conversaciones restaurados con soporte para `prefers-reduced-motion`.
- Shell de escritorio y runtime de DeepSeek Harness actualizados.
- Screenshot del README actualizado.

Incluye instalador NSIS Windows x64, ejecutable portable, blockmap, `latest.yml`, archivo del runtime del Harness y digest SHA-256. Esta release se compiló y subió manualmente; GitHub Actions se mantiene fuera del proceso para no consumir la cuota gratuita del repositorio.
