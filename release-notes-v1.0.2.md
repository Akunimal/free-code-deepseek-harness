# FreeCode DeepSeek Harness v1.0.2 — Windows x64

## English

### Release v1.0.2 — Windows x64 (local build, not yet published)

v1.0.2 is built locally for Windows x64 with an NSIS setup installer and a
standalone portable executable. It keeps the Phoenix/FreeLLMpool 0.13.0 gateway
from v1.0.1 and changes which Phoenix routes the selector offers.

### Phoenix selector: tool calling required

- A concrete route appears in the selector only after a live OpenAI tool call
  (declared function, `tool_choice: required`) succeeds. Text-only and failing
  routes are hidden, not deleted, and return when a later probe passes.
- Auto is the first entry and is labelled **Phoenix auto**.
- Allowlist: 25 IDs (Auto plus 24 routes), checked on 2026-10-23. Removed routes
  that returned 404/400/402 or answered without a tool call. Added six Free.ai
  routes and three Kilo routes that passed tool calling.
- Dynamic Kilo routers (`kilo-auto/*`, `openrouter/free`) and Nemotron routes
  stay excluded.
- Free.ai routes are capped at 32,768 tokens until a native window is published.
- Each route probe times out after 45 s. A hung route no longer holds the
  "Updating catalog" state for minutes.
- The gateway keeps per-route circuit breakers (base cooldown 60 s, maximum 1 h),
  so Auto stops routing to a route that keeps failing before the next refresh.

### Release checks and artifacts

- Gateway binary rebuilt from the pinned FreeLLMpool source; SHA-256
  `bde20c6741d783f0c9940e50b45601f4b06b98f69a9f8ed202b5ed594162cb20`.
- DSH runtime `0.2.1-alpha.12` (ABI 149) is published as a GitHub pre-release
  (`runtime-0.2.1-alpha.12`) with SHA-256
  `3ee296a82fa3a747d3c77b6a862bd4fea45a87327c4a2d7b008568c8e5275810`.
- The release gate, including the empty-cache first-run runtime download, passed
  on 2026-10-23.

| Artifact | Size (bytes) | SHA-256 |
| --- | --- | --- |
| Setup `FreeCode-DeepSeek-Harness-1.0.2-win-x64-setup.exe` | 210,614,305 | `622081e81be9c9851cb79dde99a5238901d1bb6bdec3a88ad909f45ed0042349` |
| Portable `FreeCode-DeepSeek-Harness-1.0.2-win-x64-portable.exe` | 210,239,181 | `c7813525ac396bb817b9e91c9423c2b982f45488c15dd92cfcf266af965c29d0` |

Output is in `apps/shell/release-1.0.2-final-20261023/`. Earlier releases and
their artifacts are unchanged.

## Español

### Release v1.0.2 — Windows x64 (compilación local, aún no publicada)

v1.0.2 está compilada localmente para Windows x64 con instalador NSIS y ejecutable
portable. Mantiene el gateway Phoenix/FreeLLMpool 0.13.0 de v1.0.1 y cambia qué
rutas Phoenix ofrece el selector.

### Selector Phoenix: se requiere tool calling

- Una ruta concreta aparece en el selector solo después de que una tool call
  OpenAI real (función declarada, `tool_choice: required`) tenga éxito. Las rutas
  que solo responden texto o fallan quedan ocultas, no borradas, y vuelven cuando
  una sonda posterior pasa.
- Auto es la primera entrada y se muestra como **Phoenix auto**.
- Allowlist: 25 IDs (Auto más 24 rutas), verificadas el 2026-10-23. Se quitaron
  rutas que respondieron 404/400/402 o contestaron sin tool call. Se agregaron seis
  rutas de Free.ai y tres de Kilo que pasaron tool calling.
- Los routers dinámicos de Kilo (`kilo-auto/*`, `openrouter/free`) y las rutas
  Nemotron siguen excluidos.
- Las rutas de Free.ai tienen tope de 32.768 tokens hasta que se publique una
  ventana nativa.
- Cada probe de ruta tiene timeout de 45 s. Una ruta colgada ya no mantiene el
  estado "Updating catalog" durante minutos.
- El gateway conserva circuit breakers por ruta (cooldown base 60 s, máximo 1 h),
  así Auto deja de enrutar a una ruta que sigue fallando antes del siguiente refresh.

### Verificación y artefactos

- Binario del gateway recompilado desde el fuente FreeLLMpool pinneado; SHA-256
  `bde20c6741d783f0c9940e50b45601f4b06b98f69a9f8ed202b5ed594162cb20`.
- Runtime DSH `0.2.1-alpha.12` (ABI 149) publicado como pre-release de GitHub
  (`runtime-0.2.1-alpha.12`), SHA-256
  `3ee296a82fa3a747d3c77b6a862bd4fea45a87327c4a2d7b008568c8e5275810`.
- El gate de release, incluida la descarga del runtime en primera ejecución con
  caché vacía, pasó el 2026-10-23.

| Artefacto | Tamaño (bytes) | SHA-256 |
| --- | --- | --- |
| Setup `FreeCode-DeepSeek-Harness-1.0.2-win-x64-setup.exe` | 210.614.305 | `622081e81be9c9851cb79dde99a5238901d1bb6bdec3a88ad909f45ed0042349` |
| Portable `FreeCode-DeepSeek-Harness-1.0.2-win-x64-portable.exe` | 210.239.181 | `c7813525ac396bb817b9e91c9423c2b982f45488c15dd92cfcf266af965c29d0` |

La salida está en `apps/shell/release-1.0.2-final-20261023/`. Las versiones
anteriores y sus artefactos no cambian.
