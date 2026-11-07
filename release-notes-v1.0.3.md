# FreeCode DeepSeek Harness v1.0.3 — Windows x64

## English

### Release v1.0.3 — Windows x64 (published)

v1.0.3 is published for Windows x64 with an NSIS setup installer and a
standalone portable executable. It integrates the latest opencode2api v1.4.7
gateway binary, adds an adaptive gateway supervisor with anti-zombie process
management, and introduces transparent SOTA fallback model rotation on 429
quota limits.

### What is new in v1.0.3

- **opencode2api v1.4.7 upstream integration**:
  - Pinned and bundled verified binary (`opencode2api-win-x64.exe`, SHA-256 `fffb6edcd48e988355065678f438266216e55d3170464485aef51d3ef38959ea`).
  - Native tool calling in free tier with automated ghost-tool parameter cleanup.
  - Title request protections and request sanitization.
  - Automated WARP pool cooldown based on upstream `Retry-After` headers.
  - Direct connectivity and health checks for `opencode.ai`.
- **Adaptive Gateway Resolution & Supervisor**:
  - Dynamic discovery and auto-tuning supporting port 8080 and 8088 detection.
  - Headless launcher integration with Windows Job object isolation, preventing orphaned and zombie background processes.
  - Strict model preservation and per-retry session refresh for WARP pool rotation.
  - Transparent SOTA model rotation chain on HTTP 429 quota exhaustion.
  - Vendored mounting and packaging of `dsh-our-free-model` v2.7.3.

### Release checks and artifacts

- Verified build receipt with matching SHA-256 for bundled binaries.
- Full unit tests and contract test suites passing.
- Verified packaging and successful local testing on Windows x64.

| Artifact | Size (bytes) | SHA-256 |
| --- | --- | --- |
| Setup `FreeCode-DeepSeek-Harness-1.0.3-win-x64-setup.exe` | 180,885,139 | `db08fd0507cca7d21c8dd534d3b3cc1baaac89757a0d8ca3efe470aa09b6ceac` |
| Portable `FreeCode-DeepSeek-Harness-1.0.3-win-x64-portable.exe` | 180,510,015 | `d7172c59f7ba70b0824924c8647a1aa54f4cb55c52e751f09e79bbc2ffaa7309` |

Output is in `apps/shell/release-1.0.3-local-4RbPpx/`. Earlier releases and
their artifacts are unchanged.

## Español

### Release v1.0.3 — Windows x64 (publicada)

v1.0.3 está publicada para Windows x64 con instalador NSIS y ejecutable
portable. Integra el binario de gateway opencode2api v1.4.7, incorpora un
supervisor adaptativo con gestión de procesos anti-zombi, e introduce rotación
transparente de modelos SOTA de fallback ante límites de cuota HTTP 429.

### Novedades en v1.0.3

- **Integración upstream de opencode2api v1.4.7**:
  - Binario verificado y empaquetado (`opencode2api-win-x64.exe`, SHA-256 `fffb6edcd48e988355065678f438266216e55d3170464485aef51d3ef38959ea`).
  - Soporte de tool calling nativo en el tier gratuito con limpieza de parámetros fantasma (ghost tools).
  - Protección en solicitudes de títulos y sanitización de llamadas.
  - Cooldown automatizado para el pool WARP respetando cabeceras `Retry-After`.
  - Chequeo de salud y conectividad directa con `opencode.ai`.
- **Resolución adaptativa de gateway y supervisor**:
  - Descubrimiento dinámico y auto-ajuste con detección de puertos 8080 y 8088.
  - Integración con launcher headless y aislamiento Job en Windows para evitar procesos huérfanos o zombis.
  - Preservación estricta del modelo y refresco de sesión por reintento en el pool WARP.
  - Cadena de rotación transparente de modelos SOTA ante códigos 429 de cuota.
  - Empaquetado y montaje de `dsh-our-free-model` v2.7.3.

### Verificación y artefactos

- Receipt de compilación y binarios verificados con SHA-256 idéntico.
- Suites de tests unitarios y tests de contrato ejecutadas con 100% de éxito.
- Empaquetado y ejecución local verificados exitosamente en Windows x64.

| Artefacto | Tamaño (bytes) | SHA-256 |
| --- | --- | --- |
| Setup `FreeCode-DeepSeek-Harness-1.0.3-win-x64-setup.exe` | 180.885.139 | `db08fd0507cca7d21c8dd534d3b3cc1baaac89757a0d8ca3efe470aa09b6ceac` |
| Portable `FreeCode-DeepSeek-Harness-1.0.3-win-x64-portable.exe` | 180.510.015 | `d7172c59f7ba70b0824924c8647a1aa54f4cb55c52e751f09e79bbc2ffaa7309` |

La salida está en `apps/shell/release-1.0.3-local-4RbPpx/`. Las versiones
anteriores y sus artefactos no cambian.
