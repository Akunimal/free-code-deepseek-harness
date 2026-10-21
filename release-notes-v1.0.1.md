# FreeCode DeepSeek Harness v1.0.1 — Windows x64 candidate

## English

### Candidate status — not published

This document describes a local source candidate, not a finished release. The
v1.0.1 setup and portable packages have **not** been built, installed or
validated. The mandatory public clean-cache DSH first-run smoke and full
release gate have **not** run. Do not treat a source checkout, local runtime
cache or test fixture as proof that a fresh installation works. The last
published desktop release remains v1.0.0.

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

Local source, contract, unit and package-resource checks are useful but do not
replace building the desktop artifacts or the real public clean-cache DSH
smoke. No setup/portable filename, size, checksum, release tag or publication
claim exists for v1.0.1 yet. Follow the bilingual [release policy](docs/RELEASE-POLICY.md)
before any future release.

## Español

### Estado candidato — no publicada

Este documento describe una candidata local de fuente, no una release
terminada. El setup y el portable v1.0.1 **no** se compilaron, instalaron ni
validaron. Tampoco se ejecutaron el smoke obligatorio de primer inicio de DSH
con caché pública vacía ni el gate completo de release. Un checkout, caché
local o fixture de test no demuestra que funcione una instalación nueva. La
última release desktop publicada sigue siendo v1.0.0.

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

Los checks locales de fuente, contratos, unit tests y recursos del paquete son
útiles, pero no reemplazan compilar los artefactos desktop ni el smoke real de
DSH desde caché pública vacía. Todavía no existen nombre, tamaño o checksum de
setup/portable, tag ni publicación v1.0.1. Antes de una futura release, seguir
la [política bilingüe de release](docs/RELEASE-POLICY.es.md).
