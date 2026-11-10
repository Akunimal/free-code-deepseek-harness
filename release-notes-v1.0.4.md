# FreeCode DeepSeek Harness v1.0.4 — Windows x64

## English

### Release v1.0.4 — Windows x64 (published)

v1.0.4 is published for Windows x64 with an NSIS setup installer, a standalone
portable executable, the setup blockmap and `latest.yml`. It adds an embedded
SearXNG web search provider, a tool-name bridge for the free model lane and a
web_search-first research policy, with DSH runtime `0.2.1-alpha.13`.

### What is new in v1.0.4

- **Embedded SearXNG search.** A pinned SearXNG runtime is staged and mounted
  through a managed loopback proxy. Research starts with `web_search`; the
  embedded browser opens for a specific page, an interaction, or when search
  returns no usable source.
- **Tool-name bridge.** On the free model lane, the `shell` tool is presented to
  the opencode2api gateway as `pwsh`. `execute` and `patch` are not bridged yet
  (see known issues).
- **Gateway.** The desktop payload includes the opencode2api v1.4.7 gateway
  (`oc-gateway`). Phoenix is no longer part of the payload.
- **DSH runtime `0.2.1-alpha.13`** (ABI 149), published as the
  `runtime-0.2.1-alpha.13` pre-release. The first launch downloads it and checks
  its SHA-256, manifest and Electron ABI before starting the Harness.
- **Packaging repairs.** The release packaging no longer depends on the retired
  Phoenix entries, keeps the opencode2api gateway, and runs the vendor pnpm at
  the version pinned by the vendor tree.

### Known issues in this release

- `execute` and `patch` are not bridged to the free model lane (KI-013).
- The v1.0.3 GitHub release has only the setup and portable executables. It has
  no `latest.yml` or blockmap, so the in-app updater cannot read update metadata
  from it. v1.0.4 publishes both.
- Windows x64 only. Binaries are unsigned. The interactive installer smoke was
  not run on a clean machine.

### Release checks and artifacts

- `pnpm release:gate` passed, including the empty-cache first-run download of
  `runtime-0.2.1-alpha.13` (SHA-256, manifest, Electron ABI 149 and hidden CLI
  `--help`).
- Source: commit `8bfa56e92f` (documentation and release tests on top of the
  tested candidate code).
- The final artifacts were rebuilt after the gate. Sizes match the local
  candidate that was tested, but the SHA-256 values differ.

| Artifact | Size (bytes) | SHA-256 |
| --- | --- | --- |
| Setup `FreeCode-DeepSeek-Harness-1.0.4-win-x64-setup.exe` | 221,244,320 | `095107dfb7f6daea2eada18508028758b3d5823089df38bbf5a9be1ee6ae9053` |
| Portable `FreeCode-DeepSeek-Harness-1.0.4-win-x64-portable.exe` | 220,869,196 | `4d4734d6bc091b52b93711958e39a0f4d3a2157222ecef1c1323b64442a5f9d2` |
| Setup blockmap `FreeCode-DeepSeek-Harness-1.0.4-win-x64-setup.exe.blockmap` | 233,864 | `8225616004c589bdde6ce0c15ca9cd4495a9f99f07cbd91e6406957708da718f` |
| `latest.yml` | 395 | `d2b8ccddaa88d5d57d42d0d87e618f19e6c1159ed3f45c834824eee29c449b48` |
| DSH runtime `deepseek-harness-runtime-0.2.1-alpha.13-win32-x64.tar.gz` (pre-release `runtime-0.2.1-alpha.13`) | 423,272,797 | `6692be80b258968c09a210bf3a41456e72ae59343a879e9edeee9faf7da9b3b2` |

Output is in `apps/shell/release-1.0.4-final-20261110/`. Earlier releases and
their artifacts are unchanged.

## Español

### Release v1.0.4 — Windows x64 (publicada)

v1.0.4 está publicada para Windows x64 con instalador NSIS, ejecutable portable,
blockmap del setup y `latest.yml`. Agrega un proveedor de búsqueda web SearXNG
embebido, un puente de nombres de herramientas para el carril de modelos
gratuitos y una política de investigación con `web_search` primero, con el
runtime DSH `0.2.1-alpha.13`.

### Novedades en v1.0.4

- **Búsqueda SearXNG embebida.** Un runtime SearXNG fijado se empaqueta y monta
  por un proxy loopback administrado. La investigación empieza con `web_search`;
  el navegador embebido se abre para una página concreta, una interacción o
  cuando la búsqueda no devuelve fuentes útiles.
- **Puente de nombres de herramientas.** En el carril de modelos gratuitos, la
  tool `shell` se presenta al gateway opencode2api como `pwsh`. `execute` y
  `patch` todavía no están puenteadas (ver problemas conocidos).
- **Gateway.** El payload desktop incluye el gateway opencode2api v1.4.7
  (`oc-gateway`). Phoenix ya no forma parte del payload.
- **Runtime DSH `0.2.1-alpha.13`** (ABI 149), publicado como pre-release
  `runtime-0.2.1-alpha.13`. En el primer inicio se descarga y se verifican su
  SHA-256, manifest y ABI de Electron antes de arrancar el Harness.
- **Reparaciones de packaging.** El empaquetado ya no depende de las entradas
  retiradas de Phoenix, conserva el gateway opencode2api y usa el pnpm del vendor
  en la versión fijada por el árbol vendor.

### Problemas conocidos de esta release

- `execute` y `patch` no están puenteadas al carril de modelos gratuitos (KI-013).
- La release v1.0.3 en GitHub tiene solo el setup y el portable. No tiene
  `latest.yml` ni blockmap, así que el updater de la app no puede leer desde ella
  los metadatos de actualización. v1.0.4 publica ambos.
- Solo Windows x64. Los binarios no están firmados. El smoke interactivo del
  instalador no se ejecutó en una máquina limpia.

### Verificación y artefactos

- `pnpm release:gate` pasó, incluida la descarga en primer inicio con caché vacía
  de `runtime-0.2.1-alpha.13` (SHA-256, manifest, ABI 149 de Electron y `--help`
  del CLI oculto).
- Fuente: commit `8bfa56e92f` (documentación y tests de release sobre el código
  de la candidata probada).
- Los artefactos finales se recompilaron después del gate. Los tamaños coinciden
  con la candidata local probada, pero los SHA-256 difieren.

| Artefacto | Tamaño (bytes) | SHA-256 |
| --- | --- | --- |
| Setup `FreeCode-DeepSeek-Harness-1.0.4-win-x64-setup.exe` | 221.244.320 | `095107dfb7f6daea2eada18508028758b3d5823089df38bbf5a9be1ee6ae9053` |
| Portable `FreeCode-DeepSeek-Harness-1.0.4-win-x64-portable.exe` | 220.869.196 | `4d4734d6bc091b52b93711958e39a0f4d3a2157222ecef1c1323b64442a5f9d2` |
| Blockmap del setup `FreeCode-DeepSeek-Harness-1.0.4-win-x64-setup.exe.blockmap` | 233.864 | `8225616004c589bdde6ce0c15ca9cd4495a9f99f07cbd91e6406957708da718f` |
| `latest.yml` | 395 | `d2b8ccddaa88d5d57d42d0d87e618f19e6c1159ed3f45c834824eee29c449b48` |
| Runtime DSH `deepseek-harness-runtime-0.2.1-alpha.13-win32-x64.tar.gz` (pre-release `runtime-0.2.1-alpha.13`) | 423.272.797 | `6692be80b258968c09a210bf3a41456e72ae59343a879e9edeee9faf7da9b3b2` |

La salida está en `apps/shell/release-1.0.4-final-20261110/`. Las versiones
anteriores y sus artefactos no cambian.
