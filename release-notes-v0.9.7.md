# FreeCode DeepSeek Harness v0.9.7 — Windows x64

## English

### Why opencode2api was removed

opencode2api did not work for this app and is no longer shipped:

- **Tool calls failed.** During local testing the opencode2api lane produced
  tool-call failures, so the harness could not run tool-driven sessions
  reliably.
- **Tor made it worse.** The Tor failover route reached OpenCode Zen through
  exit IPs that the free tier rejects: 403 `FreeTierError` and 429 responses.
  Direct connections returned 200. The Tor pool therefore cannot keep the free
  lane usable, and it is removed from the GUI and the packaged runtime.
- **Maintenance.** The Go sidecar had to be built, patched and staged per
  release (about 180 MB OpenCode binary plus gateway). The replacement needs
  no bundled gateway binary.

### What replaces it

- **The free lane is now Kilo.** `apps/shell/src/main/kilo-lane.ts` runs a
  loopback OpenAI-compatible endpoint that forwards to
  `https://ai-gateway.kilo.ai/api/v1`. It checks the local key, then strips
  every Authorization header upstream: the Kilo gateway returns 401 for
  `Bearer public` but serves the free models anonymously.
- **Selector filtered.** Only the 10 free models that answered a live
  tool-call probe are shown: `kilo-auto/free`,
  `dots-studio/dots-3-note-preview:free`, `liquid/lfm-2.5-2.6b:free`,
  `nvidia/nemotron-3.5-lightning:free`, `nvidia/nemotron-3.5-super-vl:free`,
  `xingchen-agi/xing4.0-29b-a4b:free`, `cohere/north-mini-code:free`,
  `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`,
  `nvidia/nemotron-3-super-120b-a12b:free`, `openrouter/free`.
- **Tor removed from the GUI.** No Pool Status overlay, Tor tray entries or
  Rotate Tor menu item.

### Limits

- Free models are rate-limited (daily caps, provider overloads). Expect 429
  and 5xx responses. `thinkingmachines/inkling-small:free`,
  `poolside/laguna-s-2.1:free`, `poolside/laguna-xs-2.1:free` and
  `nvidia/nemotron-3-ultra-550b-a55b:free` failed the probe and are excluded.
- The probe ran once per model on 2026-10-17. Tool-call reliability is not
  guaranteed over time.
- Windows setup is not code-signed.

## Español

### Por qué se quitó opencode2api

opencode2api no funcionaba para esta app y ya no se distribuye:

- **Fallaban las tool calls.** En pruebas locales el lane opencode2api produjo
  fallos de tool calls, así que el harness no podía ejecutar sesiones con
  herramientas de forma fiable.
- **Tor empeoraba el problema.** La ruta de failover Tor llegaba a OpenCode Zen
  por IPs de salida que el tier gratuito rechaza: respuestas 403
  `FreeTierError` y 429. La conexión directa devolvía 200. El pool Tor no puede
  mantener usable el lane gratuito, así que se quita de la GUI y del runtime
  empaquetado.
- **Mantenimiento.** El sidecar Go había que compilar, parchear y preparar en
  cada release (binario OpenCode de unos 180 MB más el gateway). El reemplazo
  no necesita binario de gateway empaquetado.

### Qué lo reemplaza

- **El lane gratuito ahora es Kilo.** `apps/shell/src/main/kilo-lane.ts`
  expone un endpoint compatible con OpenAI en loopback que reenvía a
  `https://ai-gateway.kilo.ai/api/v1`. Valida la clave local y quita todo
  header Authorization aguas arriba.
- **Selector filtrado.** Solo se muestran los 10 modelos free que respondieron
  con tool calls en el probe en vivo (lista arriba).
- **Tor fuera de la GUI.** Sin overlay Pool Status, entradas de bandeja Tor ni
  menú Rotate Tor.

### Límites

- Los modelos free tienen límites de uso (cuota diaria, sobrecargas). Espera
  respuestas 429 y 5xx. Quedaron fuera los cuatro que fallaron el probe.
- El probe se hizo una vez por modelo el 2026-10-17. La fiabilidad de tool
  calls no está garantizada en el tiempo.
- El setup de Windows no está firmado con código.
