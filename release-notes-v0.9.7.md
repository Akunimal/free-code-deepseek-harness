# FreeCode DeepSeek Harness v0.9.7 — Windows x64

## English

### Local candidate, not published

This build is for local testing. It is not pushed, tagged or released.

### Changes

- **Free lane is now Kilo.** `apps/shell/src/main/kilo-lane.ts` runs a
  loopback OpenAI-compatible endpoint that forwards to
  `https://ai-gateway.kilo.ai/api/v1`. It checks the local key, then strips
  every Authorization header upstream: the Kilo gateway returns 401 for
  `Bearer public` but serves the free models anonymously.
- **opencode2api removed.** The Go sidecar, its staging script and its
  prepackage verification are gone. `vendor/opencode2api` is kept until the
  migration is confirmed.
- **Selector filtered.** Only these free models are shown:
  `kilo-auto/free`, `dots-studio/dots-3-note-preview:free`,
  `liquid/lfm-2.5-2.6b:free`, `nvidia/nemotron-3.5-lightning:free`,
  `nvidia/nemotron-3.5-super-vl:free`, `xingchen-agi/xing4.0-29b-a4b:free`,
  `cohere/north-mini-code:free`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`,
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

## Español

### Candidata local, no publicada

Esta build es para pruebas locales. No se sube, no se etiqueta y no se publica.

### Cambios

- **El lane gratuito ahora es Kilo.** `apps/shell/src/main/kilo-lane.ts`
  expone un endpoint compatible con OpenAI en loopback que reenvía a
  `https://ai-gateway.kilo.ai/api/v1`. Valida la clave local y quita todo
  header Authorization aguas arriba.
- **opencode2api eliminado.** Se quitan el sidecar Go, su script de staging y
  su verificación de empaquetado. `vendor/opencode2api` se conserva hasta
  confirmar la migración.
- **Selector filtrado.** Solo se muestran los 10 modelos free listados arriba.
- **Tor fuera de la GUI.** Sin overlay Pool Status, entradas de bandeja Tor ni
  menú Rotate Tor.

### Límites

- Los modelos free tienen límites de uso (cuota diaria, sobrecargas). Espera
  respuestas 429 y 5xx. Quedaron fuera los cuatro que fallaron el probe.
- El probe se hizo una vez por modelo el 2026-10-17. La fiabilidad de tool
  calls no está garantizada en el tiempo.
