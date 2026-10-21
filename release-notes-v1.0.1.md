# FreeCode DeepSeek Harness v1.0.1 — Windows x64 candidate

## English

### Candidate status — not published

This document describes a local source candidate, not a finished release. The
v1.0.1 setup and portable were built locally and statically verified for the
user's test; this workflow did not run or install them. An older setup was launched previously,
but successful installation was never verified. The mandatory public
clean-cache DSH first-run smoke and full release gate have **not** run. Do not
treat a local build, runtime cache or test fixture as proof that a fresh
installation works. The last published desktop release remains v1.0.0.

### Phoenix replaces OpenCode2API

- Replaces the active OpenCode2API gateway, adapter, runtime dependency,
  process startup, staging, packaging and runtime checks with Phoenix, built
  from immutable FreeLLMpool 0.13.0 source.
- Bundles the pinned Windows x64 Phoenix service, model allowlist, MIT license
  and source/build receipt. Startup verifies the executable's SHA-256,
  provenance and architecture before launching it through the verified
  `freecode-launcher` / `headless-host` containment path.
- Does not require `C:\LocalAI`, Python installed on the user's computer, a
  separate FreeLLMpool installation, or an existing local service/port.
- DSH `0.2.1-alpha.12` remains a separate first-launch download, verified by
  SHA-256 and Electron ABI. Its public empty-cache first-run gate is still
  mandatory and pending for this candidate.

### Model selection and failover

Health refresh hides unavailable models without deleting their configured
descriptors. Existing pinned turns retain their model, context and reasoning
settings after tools; a later successful probe restores selector availability.
Auto compacts under pressure before the next step using a 4,096-token summary
budget compatible with its 32K cap. Failed summarization retains history, and
Auto failover forwards the complete prepared messages and tool results.
The new alpha.12 runtime is local and unpublished; use the matching archive
and preparation script in the local test bundle before running setup.

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

### Candidate validation boundary

Local source, contract, unit and package-resource checks plus static artifact
verification do not replace the real public clean-cache DSH smoke. The updated
local artifacts are built for user testing in
`apps/shell/release-1.0.1-local-20261021-recovery/`:

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-setup.exe` | 211,664,279 bytes | `4d9062b3b62b930c4c539b3f44139c2824056729f4d8f27ba116622d736591f4` |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-portable.exe` | 211,289,141 bytes | `849b3e8ebac7af5bf014eb7296d7a4dda3693360ff0d528bc52b5aa1b8bd26dd` |

The setup blockmap (223,228 bytes; SHA-256
`e075fad134dc1ca7421b05122a709a7e5e9e2e03e4ddd1ea130cef5e9bf36d85`) and
`latest.yml` were also statically verified. Neither new artifact is run or
installed; the user will test them. This
candidate remains unpublished and is not clean-install validated. Follow the
bilingual [release policy](docs/RELEASE-POLICY.md) before any future
publication.

## Español

### Estado candidato — no publicada

Este documento describe una candidata local, no una release terminada. El setup
y el portable v1.0.1 se compilaron y verificaron estáticamente para que el
usuario los pruebe; este flujo no los ejecutó ni instaló. Un setup anterior se inició en otra
ocasión, pero nunca se verificó que la instalación terminara. Todavía no
corrieron el smoke obligatorio de primer inicio de DSH con caché pública vacía
ni el gate completo de release. Un build local, caché o fixture de test no
demuestra que funcione una instalación nueva. La última release desktop
publicada sigue siendo v1.0.0.

### Phoenix reemplaza OpenCode2API

- Reemplaza el gateway, adaptador, dependencia de runtime, inicio de procesos,
  staging, empaquetado y checks activos de OpenCode2API por Phoenix, compilado
  desde el source inmutable de FreeLLMpool 0.13.0.
- Incluye el servicio Phoenix Windows x64 fijado, allowlist de modelos, licencia
  MIT y receipt de fuente/build. Antes de iniciarlo, verifica SHA-256,
  procedencia y arquitectura; luego usa la contención verificada de
  `freecode-launcher` / `headless-host`.
- No requiere `C:\LocalAI`, Python instalado en la computadora del usuario,
  FreeLLMpool instalado aparte ni un servicio/puerto local preexistente.
- DSH `0.2.1-alpha.12` sigue como descarga separada del primer inicio,
  verificada por SHA-256 y ABI de Electron. Su gate público con caché vacía
  sigue siendo obligatorio y está pendiente para esta candidata.

### Selector de modelos y failover

El refresco oculta modelos no disponibles sin borrar sus descriptores
configurados. Los turnos fijados conservan modelo, contexto y effort después
de las herramientas; una sonda válida posterior los devuelve al selector.
Auto compacta ante presión antes del próximo paso con un presupuesto de
resumen de 4.096 tokens compatible con su límite de 32K. Si falla el resumen,
conserva el historial; el failover reenvía todos los mensajes preparados y
resultados de herramientas. El nuevo runtime alpha.12 es local y no está
publicado: usá su archivo y script de preparación junto al setup para probarlo.

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

### Límite de validación de la candidata

Los checks locales de fuente, contratos, unit tests, recursos y verificación
estática de artefactos no reemplazan el smoke real de DSH desde caché pública
vacía. Los artefactos locales actualizados se compilan para prueba del usuario
en `apps/shell/release-1.0.1-local-20261021-recovery/`:

| Artefacto | Tamaño | SHA-256 |
| --- | ---: | --- |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-setup.exe` | 211.664.279 bytes | `4d9062b3b62b930c4c539b3f44139c2824056729f4d8f27ba116622d736591f4` |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-portable.exe` | 211.289.141 bytes | `849b3e8ebac7af5bf014eb7296d7a4dda3693360ff0d528bc52b5aa1b8bd26dd` |

El blockmap del setup mide 223.228 bytes (SHA-256: e075fad134dc1ca7421b05122a709a7e5e9e2e03e4ddd1ea130cef5e9bf36d85); latest.yml también pasó la verificación estática. No
se ejecutó ni instaló ninguno de los dos artefactos nuevos; el usuario los
probará. Esta candidata sigue sin publicarse y no está validada desde una
instalación limpia. Antes de publicar, seguí la [política bilingüe de release](docs/RELEASE-POLICY.es.md).
