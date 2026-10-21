# FreeCode DeepSeek Harness v1.0.1 — Windows x64 candidate

## English

### Candidate status — not published

This document describes a local source candidate, not a finished release. The
v1.0.1 setup and portable packages were built locally and passed static
artifact verification before the Kilo/catalog follow-up. The setup was later
launched once at the user's request, but successful installation is unverified.
Those artifacts are stale for the current source and must be rebuilt. The
mandatory public clean-cache DSH first-run smoke and full release gate have
**not** run. Do not treat a local build, runtime cache or test fixture as proof
that a fresh installation works. The last published desktop release remains
v1.0.0.

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
- DSH `0.2.1-alpha.11` remains a separate first-launch download, verified by
  SHA-256 and Electron ABI. Its public empty-cache first-run gate is still
  mandatory and pending for this candidate.

### Model selection and failover

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

### Candidate validation boundary

Local source, contract, unit and package-resource checks plus static artifact
verification do not replace the real public clean-cache DSH smoke. The local
artifacts are in `apps/shell/release-1.0.1-candidate/`:

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-setup.exe` | 211,656,469 bytes | `60e62b7dc78daeb47a47cbb53ed08d03cef661948c77b462a561063c16c1acce` |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-portable.exe` | 211,281,345 bytes | `695cd3ff7f5e0645ada140feae3d788d5091b81a15aeb1fc463cb0679a70ea0a` |

The setup blockmap and `latest.yml` also passed static checks. The setup was
launched once, but its install completion is unknown; the portable was not
launched. These files predate the Kilo/model-order source changes and are stale
for the current source; they are not a published or clean-install-validated
release. Follow the bilingual [release policy](docs/RELEASE-POLICY.md) before
any future publication.

## Español

### Estado candidato — no publicada

Este documento describe una candidata local, no una release terminada. El setup
y el portable v1.0.1 se compilaron localmente y pasaron la verificación estática
antes del seguimiento de Kilo/catálogo. Luego se inició el setup una vez a pedido
del usuario, pero no se pudo verificar que la instalación terminara. Esos
artefactos ya no corresponden a la fuente actual y hay que recompilarlos. Todavía
no corrieron el smoke obligatorio de primer inicio de DSH con caché pública vacía
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
- DSH `0.2.1-alpha.11` sigue como descarga separada del primer inicio,
  verificada por SHA-256 y ABI de Electron. Su gate público con caché vacía
  sigue siendo obligatorio y está pendiente para esta candidata.

### Selector de modelos y failover

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

### Límite de validación de la candidata

Los checks locales de fuente, contratos, unit tests, recursos y verificación
estática de artefactos no reemplazan el smoke real de DSH desde caché pública
vacía. Los builds locales están en `apps/shell/release-1.0.1-candidate/`:

| Artefacto | Tamaño | SHA-256 |
| --- | ---: | --- |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-setup.exe` | 211.656.469 bytes | `60e62b7dc78daeb47a47cbb53ed08d03cef661948c77b462a561063c16c1acce` |
| `FreeCode-DeepSeek-Harness-1.0.1-win-x64-portable.exe` | 211.281.345 bytes | `695cd3ff7f5e0645ada140feae3d788d5091b81a15aeb1fc463cb0679a70ea0a` |

El blockmap del setup y `latest.yml` también pasaron checks estáticos. El setup
se inició una vez, pero se desconoce si terminó la instalación; el portable no
se ejecutó. Estos archivos son anteriores a los cambios de Kilo/orden de
modelos y están obsoletos para la fuente actual; no constituyen una release
publicada ni validada desde una instalación limpia. Antes de publicar, seguí la
[política bilingüe de release](docs/RELEASE-POLICY.es.md).
