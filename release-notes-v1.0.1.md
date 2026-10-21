# FreeCode DeepSeek Harness v1.0.1 — Windows x64 candidate

## English

### Candidate status — not published

This document describes a local source candidate, not a finished release. The
v1.0.1 setup and portable packages were built locally and passed static
artifact verification, but neither has been installed or launched. The
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
- Choosing a concrete model is a strict pin: if that model/provider fails,
  FreeCode returns the failure and does not silently pick a different model.
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

The setup blockmap and `latest.yml` also passed static checks. Neither
executable was run; these local files are not a published or clean-install-
validated release. Follow the bilingual [release policy](docs/RELEASE-POLICY.md)
before any future publication.

## Español

### Estado candidato — no publicada

Este documento describe una candidata local, no una release terminada. El setup
y el portable v1.0.1 se compilaron localmente y pasaron la verificación estática
de artefactos, pero ninguno se instaló ni ejecutó. Todavía no corrieron el smoke
obligatorio de primer inicio de DSH con caché pública vacía ni el gate completo
de release. Un build local, caché o fixture de test no demuestra que funcione
una instalación nueva. La última release desktop publicada sigue siendo
v1.0.0.

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
- Elegir un modelo concreto lo fija estrictamente: si falla ese modelo/proveedor,
  FreeCode devuelve el error y no elige otro modelo a escondidas.
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

El blockmap del setup y `latest.yml` también pasaron checks estáticos. No se
ejecutó ninguno de los binarios; estos archivos locales no constituyen una
release publicada ni validada desde una instalación limpia. Antes de publicar,
seguí la [política bilingüe de release](docs/RELEASE-POLICY.es.md).
