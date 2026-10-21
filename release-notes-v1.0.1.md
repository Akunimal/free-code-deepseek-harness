# FreeCode DeepSeek Harness v1.0.1 — Windows x64

## English

### Release v1.0.1 — Windows x64

v1.0.1 is published for Windows x64 with an NSIS setup installer and a standalone
portable executable. This release replaces the retired `opencode2api` gateway
with a bundled, hash- and provenance-verified Phoenix gateway built from pinned
FreeLLMpool 0.13.0 source, introduces strict model pinning with quality-first
ordering, fixes loopback HTTP 431 cookie overflow, and preserves turn context
across catalog refreshes.

### Phoenix replaces OpenCode2API due to upstream instability

- **Deprecated OpenCode2API gateway retired:** The previous `opencode2api` Go
  gateway was deprecated and retired because upstream endpoint instability,
  persistent failures in public proxy rotation, unexpected external API breaking
  changes, and frequent provider rate limits caused recurring service disruptions,
  broken tool calls, and unresolvable request failures.
- **Bundled, self-contained Phoenix gateway:** Replaces `opencode2api` with
  Phoenix, built from immutable FreeLLMpool 0.13.0 source. Ships a verified
  Windows x64 executable, model allowlist, MIT license, and source/build receipt.
  Startup verifies SHA-256, provenance, and architecture before launching through
  the verified `freecode-launcher` / `headless-host` containment path.
- **Zero user-machine dependencies:** Does not require `C:\LocalAI`, Python
  installed on the host computer, a separate FreeLLMpool installation, or an
  existing local port/service.
- **DSH runtime:** Pinned to `0.2.1-alpha.12` (ABI 149), downloaded on first
  launch when cache is empty and verified by SHA-256.

### Loopback cookie cleanup and HTTP 431 mitigation

- Resolves a white-screen launch issue caused by HTTP 431 (`Request Header Fields
  Too Large`) when connecting to the local DSH supervisor at `127.0.0.1`.
- Chromium attaches cookies by domain regardless of port (RFC 6265). Over multiple
  sessions, ephemeral `dsh-auth-*` authentication tokens accumulated on
  `127.0.0.1`, eventually exceeding Node's 16 KB default header buffer.
- The shell now automatically cleans up stale `dsh-auth-*` loopback cookies on
  startup and pre-navigation (`cleanupStaleLoopbackCookies`).
- Harness supervisor process now passes `NODE_OPTIONS: --max-http-header-size=65536`
  to safeguard against large request headers.

### Model selection and failover

Health refresh hides unavailable models without deleting their configured
descriptors. Existing pinned turns retain their model, context and reasoning
settings after tools; a later successful probe restores selector availability.
Auto compacts under pressure before the next step using a 4,096-token summary
budget compatible with its 32K cap. Failed summarization retains history, and
Auto failover forwards the complete prepared messages and tool results.

- **Auto Phoenix** appears first in the selector and can use eligible,
  allowlisted FreeLLMpool routes.
- Concrete models follow the pinned FreeLLMpool capability-score order;
  measured latency cannot promote a lower-ranked model. Kilo uses its
  documented Code-agent usage rank only as a weaker, changing proxy when no
  common capability score is available; the two scales are not directly
  comparable. In the Kilo snapshot checked 2026-10-21, the ranks are #14, #98
  and #99 for the three included routes. Kilo documents anonymous access at
  200 requests/hour/IP. See its [free catalog](https://kilo.ai/landing/free-models)
  and [anonymous-access policy](https://kilo.ai/docs/gateway/authentication).
- The current Kilo no-auth free snapshot includes MiniMax M3.1 Flash, Laguna S
  2.1 and Dots3 Note Preview. Every Nemotron model plus `openrouter/free` and
  `kilo-auto/free` are excluded; the latter can change its upstream routing.
- Choosing a concrete model is a strict pin: if that model/provider fails,
  FreeCode returns the failure and does not silently pick a different model.
- Only models with a parseable, valid non-empty HTTP 200 chat completion stay
  selectable. A failed current probe is hidden immediately, including transport
  failures, HTTP errors and empty/malformed HTTP-200 bodies. Prior success is
  diagnostic only; a later valid completion makes the model reappear.
- Only Auto may retry another eligible free route, with bounded retries before
  response streaming starts. Once stream output is committed, the selected
  route is never changed mid-stream.
- Catalog visibility and successful responses still depend on the configured
  upstream free providers and network. Packaging Phoenix does not make those
  external providers available during an outage.

### Per-model context windows

The gateway's `/models` catalog does not declare context for every route, so a
generic 262,144-token fallback made unrelated models look like 256K. FreeCode
now uses reviewed native model-card/config values for named routes when the live
gateway gives no value. These are model-native limits, not a promise that a
specific free provider route accepts the full window; route/provider caps may
be lower. A live gateway declaration takes precedence. `auto`, `llm7/default`,
`llm7/fast` and `pollinations/ovh-reasoning` are changing aliases, so the app
uses a conservative 32,768-token cap unless the gateway declares a value.

| Context (tokens) | Routes / interpretation |
| ---: | --- |
| 1,000,000 | [MiniMax M3.1 Flash](https://agent.minimax.io/tools/m3.1-flash); [Poolside Laguna S 2.1](https://poolside.ai/blog/introducing-laguna-s-2-1) |
| 512,000 | [Dots3 Note Preview](https://huggingface.co/dots-studio/dots3-note-prev-fp8) |
| 262,144 | Qwen3.5-397B-A17B, Qwen3.6-27B, Qwen3.8-27B, Qwen3.5-9B and Qwen3-Coder-30B-A3B-Instruct ([Qwen model cards](https://huggingface.co/Qwen)) |
| 131,072 | GPT-OSS 120B/20B, Llama 3.3 70B, Mistral Small 3.2, Mistral Nemo and Codestral ([GPT-OSS 120B](https://developers.openai.com/api/docs/models/gpt-oss-120b), [GPT-OSS 20B](https://developers.openai.com/api/docs/models/gpt-oss-20b), [Llama 3.3](https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/MODEL_CARD.md), [Mistral Small 3.2](https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506/blob/main/params.json), [Mistral Nemo](https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407), [Codestral](https://docs.mistral.ai/models/codestral-25-08)); pinned Pollinations GPT-OSS aliases use this value provisionally |
| 128,000 | [Qwen2.5-VL-72B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct/blob/main/config.json) |
| 32,768 | [Mistral 7B v0.3](https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3/blob/main/config.json); conservative app cap for `auto`, `llm7/default`, `llm7/fast` and `pollinations/ovh-reasoning` |

The 32,768-token value for aliases is an app-side safety cap, not a claim about
their native capacity. Pollinations aliases are mapped by the pinned
FreeLLMpool provider configuration and can change when that mapping changes.

### Verified Release Artifacts

The verified release artifacts are built and statically verified in
`apps/shell/release-1.0.1-final-20261021/`:

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-setup.exe` | 211,665,775 bytes | `04baa4c87391ab258bb00690d354c52fb8f6d8770ed64fedcb8a666bc6bd2fe8` |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-portable.exe` | 211,290,637 bytes | `ce7e6db14c8cd1a502068a51345311be4bf6a6dc7c369a1207637d0118a9157b` |

The setup blockmap (223,287 bytes; SHA-256
`c38f8ee8b3915aff8048817cbb9f6dc0d6bc2bf3d28c1da62008adad8e56f255`) and
`latest.yml` were also statically verified.

---

## Español

### Release v1.0.1 — Windows x64

v1.0.1 está publicada para Windows x64 con instalador NSIS y ejecutable portable
independiente. Esta versión reemplaza el gateway retirado `opencode2api` por el
gateway Phoenix empaquetado, verificado por hash y procedencia, compilado desde
la fuente fijada de FreeLLMpool 0.13.0. Introduce anclaje estricto de modelos
con orden por calidad, soluciona el desbordamiento de cookies HTTP 431 en loopback
y preserva el contexto del turno ante refrescos del catálogo.

### Phoenix reemplaza a OpenCode2API por inestabilidad upstream

- **Retiro del gateway OpenCode2API:** El gateway anterior `opencode2api` en Go
  fue retirado y reemplazado debido a la persistente inestabilidad de los
  servicios upstream, fallas constantes en el pool de rotación de proxies
  públicos, modificaciones imprevistas en las APIs externas y frecuentes límites
  de cuota que provocaban caídas continuas y fallas irrecuperables en las respuestas.
- **Gateway Phoenix empaquetado y autónomo:** Reemplaza `opencode2api` por Phoenix,
  compilado desde el source inmutable de FreeLLMpool 0.13.0. Incluye el servicio
  Phoenix Windows x64 fijado, allowlist de modelos, licencia MIT y receipt de
  fuente/build. Antes de iniciarlo, verifica SHA-256, procedencia y arquitectura;
  luego usa la contención verificada de `freecode-launcher` / `headless-host`.
- **Cero dependencias locales:** No requiere `C:\LocalAI`, Python instalado en la
  computadora del usuario, FreeLLMpool instalado aparte ni un servicio/puerto local
  preexistente.
- **Runtime DSH:** Fijado en `0.2.1-alpha.12` (ABI 149), descargado en el primer
  inicio si no hay caché y verificado mediante SHA-256.

### Limpieza de cookies de loopback y mitigación de HTTP 431

- Corrige el problema de pantalla en blanco provocado por el error HTTP 431
  (`Request Header Fields Too Large`) al conectarse al supervisor local de DSH
  en `127.0.0.1`.
- Chromium asocia cookies por dominio sin distinguir puerto (RFC 6265). A lo largo
  de múltiples ejecuciones, las cookies de autenticación efímeras `dsh-auth-*` se
  acumularon en `127.0.0.1`, superando el búfer de encabezados de 16 KB por defecto
  de Node.js.
- El shell ahora limpia automáticamente las cookies viejas `dsh-auth-*` de loopback
  al arrancar y antes de cada navegación (`cleanupStaleLoopbackCookies`).
- El supervisor del proceso DSH ahora pasa `NODE_OPTIONS: --max-http-header-size=65536`
  para proteger el proceso ante encabezados HTTP extensos.

### Selector de modelos y failover

El refresco oculta modelos no disponibles sin borrar sus descriptores
configurados. Los turnos fijados conservan modelo, contexto y effort después
de las herramientas; una sonda válida posterior los devuelve al selector.
Auto compacta ante presión antes del próximo paso con un presupuesto de
resumen de 4.096 tokens compatible con su límite de 32K. Si falla el resumen,
conserva el historial; el failover reenvía todos los mensajes preparados y
resultados de herramientas.

- **Auto Phoenix** aparece primero en el selector y puede usar las rutas
  FreeLLMpool permitidas y elegibles.
- Los modelos concretos siguen el orden de puntuación de capacidad fijado de
  FreeLLMpool; la latencia medida no puede adelantar un modelo de menor rango.
  Kilo usa su ranking documentado de uso del agente Code únicamente como proxy
  más débil y cambiante cuando no hay una puntuación común; ambas escalas no
  son directamente comparables. En la instantánea Kilo revisada el 2026-10-21,
  los puestos son #14, #98 y #99 para las tres rutas incluidas. Kilo documenta
  un límite de acceso anónimo de 200 solicitudes/hora/IP. Ver el [catálogo
  gratuito](https://kilo.ai/landing/free-models) y la [política de acceso
  anónimo](https://kilo.ai/docs/gateway/authentication).
- La instantánea Kilo gratuita sin clave incluye MiniMax M3.1 Flash, Laguna S
  2.1 y Dots3 Note Preview. Se excluyen todos los Nemotron, además de
  `openrouter/free` y `kilo-auto/free`, cuya ruta upstream puede cambiar.
- Elegir un modelo concreto lo fija estrictamente: si falla ese modelo/proveedor,
  FreeCode devuelve el error y no elige otro modelo a escondidas.
- Solo los modelos con una respuesta de chat HTTP 200 válida, parseable y no vacía
  siguen en el selector. Una sonda actual fallida quita el modelo inmediatamente,
  incluidos errores de transporte/HTTP y cuerpos HTTP 200 vacíos o inválidos.
  El éxito anterior queda solo como diagnóstico; una respuesta válida posterior
  vuelve a mostrar el modelo.
- Solo Auto puede reintentar otra ruta gratuita elegible, con reintentos
  acotados y antes de comenzar el stream. Después de confirmar la salida del
  stream, la ruta no cambia a mitad de respuesta.
- La visibilidad del catálogo y las respuestas dependen de los proveedores
  gratuitos externos configurados y de la red. Empaquetar Phoenix no los hace
  disponibles durante una caída externa.

### Ventanas de contexto por modelo

El catálogo `/models` del gateway no declara contexto para cada ruta; por eso,
el fallback genérico de 262.144 tokens hacía que modelos distintos aparecieran
como 256K. Si el gateway en vivo no informa un valor, FreeCode ahora usa los
valores nativos revisados en las fichas/configs de cada modelo identificable.
Son ventanas nativas del modelo, no una promesa de que una ruta gratuita acepte
el máximo: cada proveedor puede imponer un límite menor. Un valor declarado por
el gateway en vivo tiene prioridad. `auto`, `llm7/default`, `llm7/fast` y
`pollinations/ovh-reasoning` son alias cambiantes; la app les aplica un límite
conservador de 32.768 tokens salvo que el gateway declare otro valor.

| Contexto (tokens) | Rutas / interpretación |
| ---: | --- |
| 1.000.000 | [MiniMax M3.1 Flash](https://agent.minimax.io/tools/m3.1-flash); [Poolside Laguna S 2.1](https://poolside.ai/blog/introducing-laguna-s-2-1) |
| 512.000 | [Dots3 Note Preview](https://huggingface.co/dots-studio/dots3-note-prev-fp8) |
| 262.144 | Qwen3.5-397B-A17B, Qwen3.6-27B, Qwen3.8-27B, Qwen3.5-9B y Qwen3-Coder-30B-A3B-Instruct ([fichas Qwen](https://huggingface.co/Qwen)) |
| 131.072 | GPT-OSS 120B/20B, Llama 3.3 70B, Mistral Small 3.2, Mistral Nemo y Codestral ([GPT-OSS 120B](https://developers.openai.com/api/docs/models/gpt-oss-120b), [GPT-OSS 20B](https://developers.openai.com/api/docs/models/gpt-oss-20b), [Llama 3.3](https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/MODEL_CARD.md), [Mistral Small 3.2](https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506/blob/main/params.json), [Mistral Nemo](https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407), [Codestral](https://docs.mistral.ai/models/codestral-25-08)); los alias GPT-OSS de Pollinations fijados se asignan provisionalmente a este valor |
| 128.000 | [Qwen2.5-VL-72B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct/blob/main/config.json) |
| 32.768 | [Mistral 7B v0.3](https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3/blob/main/config.json); límite conservador de la app para `auto`, `llm7/default`, `llm7/fast` y `pollinations/ovh-reasoning` |

El límite de 32.768 para los alias es una protección de la app, no una
afirmación sobre su capacidad nativa. Los alias de Pollinations se basan en la
configuración FreeLLMpool fijada y pueden cambiar si upstream modifica ese mapa.

### Artefactos de Release Verificados

Los artefactos verificados de la release se encuentran en
`apps/shell/release-1.0.1-final-20261021/`:

| Artefacto | Tamaño | SHA-256 |
| --- | ---: | --- |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-setup.exe` | 211.665.775 bytes | `04baa4c87391ab258bb00690d354c52fb8f6d8770ed64fedcb8a666bc6bd2fe8` |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-portable.exe` | 211.290.637 bytes | `ce7e6db14c8cd1a502068a51345311be4bf6a6dc7c369a1207637d0118a9157b` |

El blockmap del setup mide 223.287 bytes (SHA-256: `c38f8ee8b3915aff8048817cbb9f6dc0d6bc2bf3d28c1da62008adad8e56f255`);
`latest.yml` también pasó la verificación estática.
