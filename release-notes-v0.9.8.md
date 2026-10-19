# FreeCode DeepSeek Harness v0.9.8 — Windows x64

## English

### Replacement build

0.9.8 republishes the 0.9.6 desktop line after the 0.9.7 release was withdrawn.
It updates the opencode2api Go gateway to v1.4.1 (pinned in `vendor/opencode2api`,
with the FreeCode tool-name repair and `/inference/openai` namespace kept) and removes Tor.

### Why Tor was removed

- The Tor failover route reached OpenCode Zen through exit IPs that the free
  tier rejects: 403 `FreeTierError` and 429 responses. Direct connections
  returned 200.
- The Tor pool is removed from the GUI (Pool Status overlay, Tor tray entries,
  Rotate Tor menu item), from the backend (`tor-manager`, `tor-config`,
  `tor-control`, `tor-routing`) and from the packaged runtime (no
  `resources/freecode/tor`).
- The gateway runs with `proxies: ['direct']` only.

### Limits

- **When no free model loads, it is a temporary block, not a bug in this build.** OpenCode Zen answers 403 `FreeTierError` to some networks and 429 when free tiers hit their daily limit. This lasted hours or days in our logs (2026-10-13 to 2026-10-17). Try again later, or from another network. When no free model answers, the app shows a native notification (once per outage); the model selector stays empty.
- The Windows setup is not code-signed.
- The full release gate was not run for this build. Local package verification
  is required before publication.

## Español

### Versión de reemplazo

0.9.8 vuelve a publicar la línea de escritorio 0.9.6 tras retirar la release 0.9.7.
Actualiza el gateway opencode2api en Go a v1.4.1 (fijado en `vendor/opencode2api`,
con la reparación de nombres de herramienta y el namespace `/inference/openai` de FreeCode) y quita Tor.

### Por qué se quitó Tor

- La ruta de failover Tor llegaba a OpenCode Zen por IPs de salida que el tier
  gratuito rechaza: respuestas 403 `FreeTierError` y 429. La conexión directa
  devolvía 200.
- El pool Tor se quita de la GUI (overlay Pool Status, entradas de bandeja Tor,
  menú Rotate Tor), del backend (`tor-manager`, `tor-config`, `tor-control`,
  `tor-routing`) y del runtime empaquetado (sin `resources/freecode/tor`).
- El gateway corre solo con `proxies: ['direct']`.

### Límites

- **Cuando no carga ningún modelo free, es un bloqueo temporal, no un bug de esta build.** OpenCode Zen responde 403 `FreeTierError` a algunas redes y 429 cuando el tier free llega a su límite diario. En nuestros logs duró horas o días (2026-10-13 al 2026-10-17). Prueba más tarde o desde otra red. Cuando ningún modelo free responde, la app muestra una notificación nativa (una vez por corte); el selector queda vacío.
- El setup de Windows no está firmado con código.
- No se ejecutó el release gate completo para esta build. Hace falta la
  verificación local del paquete antes de publicar.
