# Known issues / Problemas conocidos

Última revisión / Last reviewed: 2026-10-01
Baseline revisada / Reviewed baseline: `0.9.0`

## Estado actual / Current status

El checkout publicado de `0.9.0` agrega resiliencia Tor (una instancia única
`tor.exe` empaquetada, con rotación `NEWNYM` y failover para opencode2api),
consolida el lane de modelos a un único `deepseek-free` sin duplicados, hace
que el seeder respete el modelo elegido por el usuario, incorpora el modo
Gentle AI integrado de 0.8.0, elimina freellmpool y WARP, y mantiene Engram
como tercera fila MCP administrada con el locale español corregido. Las
limitaciones honestas restantes: la cuota del upstream gobierna el lane
anónimo, los binarios RTK/Caveman/free-search no están empaquetados, y las
demás plataformas no están probadas. Windows ARM64, Linux y macOS no están
soportados en 0.9.0.

The published `0.9.0` checkout adds Tor resilience (a single bundled
`tor.exe` instance with `NEWNYM` rotation and opencode2api failover),
consolidates the model lane into a single duplicate-free `deepseek-free`, makes
the seeder preserve the user-chosen model, carries the 0.8.0 Gentle AI mode,
removes freellmpool and WARP, and keeps Engram as the third managed MCP row
with the fixed Spanish locale. Honest limitations remain: upstream quota
governs the anonymous lane, the RTK/Caveman/free-search binaries are not
vendored, and other platforms are untested. Windows ARM64, Linux and macOS
are unsupported in 0.9.0.

## Limitaciones operativas / Operational limitations

### KI-001 — Free Pool availability is external / La disponibilidad del Free Pool es externa

The OpenCode Free route depends on the local bridge, available workers, provider/session limits, and network conditions. A pool can temporarily report zero workers, retry, or lose a stream even when the API key is valid. FreeCode retries bounded failures and reports the pool state, but it cannot remove upstream, IP, quota, or network limits.

La ruta OpenCode Free depende del puente local, los workers disponibles, los límites de proveedor/sesión y la red. El pool puede informar temporalmente cero workers, reintentar o perder un stream aunque la API key sea válida. FreeCode reintenta fallos acotados e informa el estado del pool, pero no puede eliminar límites upstream, de IP, cuota o red.

### KI-002 — Windows artifacts are large / Los artefactos Windows son grandes

The portable and setup artifacts (~304 MB download, ~69,000 files, ~10
minutes to unpack) include a local runtime plus the bundled Tor binaries.
This is an operational cost of the current packaging, not evidence that the
application is hung. Slimmed from 559 MB in 0.7.0; further slimming is
deferred work.

Los artefactos portable y setup (~304 MB de descarga, ~69.000 archivos,
~10 minutos para desempaquetar) incluyen un runtime local más los binarios de
Tor incluidos. Es un costo operativo del empaquetado actual, no una evidencia
de que la aplicación se haya colgado. Adelgazado desde 559 MB en 0.7.0; más
recorte queda diferido.

### KI-003 — RTK/Caveman are PATH helpers, not bundled / RTK/Caveman son helpers por PATH, no empaquetados

RTK and Caveman are not bundled in the published `0.9.0` artifact. The code
probes the user PATH and treats a missing binary as an explicit no-op, so
the release works but is not self-contained for these helpers. Vendoring
them with version/hash/license metadata remains deferred work.

RTK y Caveman no están incluidos en el artefacto publicado de `0.9.0`: el
código consulta el PATH del usuario y la ausencia es un no-op explícito. La
release funciona pero no es autocontenida para estos helpers. Empaquetarlos
con metadata de versión/hash/licencia queda diferido.

### KI-004 — free-search binary not vendored / Binario free-search no empaquetado

The MCP client bridge, catalog, and configuration file are shipped. The
free-search binary is not vendored, so its entry starts disabled instead of
burning the reconnect budget; it enables automatically once the binary
exists. See [`mcp-servers.md`](mcp-servers.md).

El bridge cliente MCP, el catálogo y el archivo de configuración vienen
incluidos. El binario free-search no está empaquetado, así que su entrada
arranca deshabilitada en vez de quemar reconexiones; se activa sola cuando
exista el binario. Ver [`mcp-servers.md`](mcp-servers.md).

### KI-005 — Provider/model desynchronization can look like an invalid API key / El desajuste proveedor-modelo puede parecer una API key inválida

On 2026-08-26, a long session first received a `503 Endpoint is unavailable` from the upstream and, on subsequent retries, `401 Model x-preview-f(-free) is not supported`. The UI rendered the latter as `API key is invalid` because it maps the generic `AUTH` code to that message. Context pruning/compaction was present, but there was no evidence of a hard token or context ceiling.

Changing provider may recover the request only when the selected model is supported and healthy on that provider; changing the provider alone is not sufficient. The next version should refresh the catalog and automatically select a healthy compatible model, then try the next configured provider/model when available, while preserving the actual upstream diagnostic in the UI.

El 2026-08-26, una sesión extensa recibió primero `503 Endpoint is unavailable` del upstream y, en los reintentos posteriores, `401 Model x-preview-f(-free) is not supported`. La interfaz mostró `API key is invalid` porque traduce el código genérico `AUTH` a ese mensaje. Hubo pruning/compaction por el tamaño de la conversación, pero no evidencia de haber alcanzado un techo duro de tokens o contexto.

Cambiar de proveedor puede recuperar la solicitud sólo si el modelo seleccionado es compatible y está saludable en ese proveedor; cambiar el proveedor por sí solo no alcanza. Desde 0.7.0 el lane anónimo refresca el catálogo, expone solo modelos que responden 200 y reintenta acotadamente, conservando en la interfaz el diagnóstico real del upstream.

### KI-006 — Anonymous lane quota is external / La cuota del lane anónimo es externa

The single `deepseek-free` lane (opencode2api) depends on shared opencode.ai
quota: under congestion it offers few models or hides until recovery (bounded
retries, then the 30-minute cadence). This is an upstream limit, not an app
defect.

El lane único `deepseek-free` (opencode2api) depende de la cuota compartida de
opencode.ai: con congestión ofrece pocos modelos o se oculta hasta recuperarse
(reintentos acotados, luego cadencia de 30 minutos). Es un límite del upstream,
no un defecto de la app.

### KI-007 — Non-Windows platforms untested / Plataformas no-Windows sin probar

Windows ARM64, Linux and macOS were not tested by the maintainer and have
no published artifacts. The bundled Tor payload (`tor.exe`, `geoip`,
`geoip6`) is Windows-only. Contributor builds for those platforms must not be
treated as usable releases.

Windows ARM64, Linux y macOS no fueron probados por el mantenedor y no
tienen artefactos publicados. El payload de Tor incluido (`tor.exe`, `geoip`,
`geoip6`) es solo para Windows. Los builds de contribuidores para esas
plataformas no deben tratarse como releases utilizables.

### KI-008 — Tor is failover, not the default path / Tor es failover, no la ruta por defecto

opencode2api is launched with `[direct, socks5://127.0.0.1:9050]`: the direct
route is preferred, so normal latency is unchanged and Tor only carries
traffic when direct egress fails. A `NEWNYM` rotation from the overlay is
asynchronous — the new circuit takes effect within Tor's `MAXCLIENTSOCKSDELAY`
window, not instantly. Ports 9050/9051 are fixed on loopback: another Tor
instance already bound there will fail the shell's startup check.

opencode2api se lanza con `[direct, socks5://127.0.0.1:9050]`: se prefiere la
ruta directa, así que la latencia normal no cambia y Tor solo transporta
tráfico cuando falla el egress directo. Una rotación `NEWNYM` desde el overlay
es asíncrona — el circuito nuevo surte efecto dentro de la ventana de
`MAXCLIENTSOCKSDELAY` de Tor, no al instante. Los puertos 9050/9051 están
fijos en loopback: otra instancia de Tor ya ligada ahí hará fallar el chequeo
de arranque del shell.

## Issues resueltos / Resolved historical issues

These entries are kept here so an old report is easy to classify:

- **Spanish locale (resolved in 0.8.0)** — The Spanish language option was
  missing from the selector in 0.6.0 and 0.7.0 web UI builds. Fixed in 0.8.0
  via patch `141-*` (30 locale files, ~1000 ES keys). The selector now renders
  Spanish correctly. / **Locale español (resuelto en 0.8.0)** — La opción de
  español faltaba en el selector en las builds web de 0.6.0 y 0.7.0. Corregido
  en 0.8.0 con el parche `141-*` (30 archivos, ~1000 claves ES). El selector
  ahora renderiza español correctamente.
- **Duplicate model lanes (resolved in 0.9.0)** — The selector used to list
  every gateway model twice: once under `deepseek-free` (FreeLLMPool) and once
  under `opencode-free` (OpenCode No-Auth), because both pointed at the same
  opencode2api gateway. Consolidated into one `deepseek-free` lane labeled
  *OpenCode Free*. / **Lane duplicados (resuelto en 0.9.0)** — el selector
  listaba cada modelo dos veces; consolidado en un único lane
  `deepseek-free` (*OpenCode Free*).
- **Cloudflare WARP dependency (replaced in 0.9.0)** — WARP, `warfleet.ts`,
  `torfleet.ts` and the `warp.auto.*` notifications are gone; a single bundled
  Tor instance provides egress failover. / **Dependencia de Cloudflare WARP
  (reemplazada en 0.9.0)** — WARP, `warfleet`, `torfleet` y las notificaciones
  `warp.auto.*` fueron eliminados; una instancia única de Tor provee el
  failover de egress.
- **User model choice clobbered on boot (resolved in 0.9.0)** — The seeder used
  to force `deepseek-free` + first model on every start; it now preserves a
  valid user selection. / **Modelo del usuario sobrescrito al arrancar
  (resuelto en 0.9.0)** — el seeder ahora conserva una selección válida.
- Tool calls request headless execution through `windowsHide` at every
  owned spawn layer; renderer popups are denied and a window-registry
  backstop destroys any native window outside splash/main/overlay (each
  kill is logged). Isolated transient reports are still welcome: window
  title/content plus what the agent was doing.
- The FreeCode animated working background is present.
- Pool shutdown errors are handled as state/diagnostic information rather than an API-key failure.
- The primary README, Spanish README, and release descriptions have bilingual coverage.
- The embedded Chromium address bar and panel layout were corrected in `v0.2.2`; Enter/Go, bare-host HTTPS navigation, and text reflow are covered by the release implementation.

Estas entradas quedan para clasificar rápidamente reportes antiguos:

- **Locale español (resuelto en 0.8.0)** — ver arriba.
- **Lane duplicados (resuelto en 0.9.0)** — ver arriba.
- **Dependencia WARP (reemplazada en 0.9.0)** — ver arriba.
- **Modelo del usuario sobrescrito al arrancar (resuelto en 0.9.0)** — ver arriba.
- Los tool calls piden ejecución headless con `windowsHide` en cada capa
  propia de spawn; los popups del renderer se deniegan y un backstop
  destruye cualquier ventana nativa fuera de splash/main/overlay (cada kill
  queda logueado). Los reportes aislados de transitorias siguen bienvenidos:
  título/contenido de la ventana más qué hacía el agente.
- Está presente el fondo animado de trabajo de FreeCode.
- Los errores de apagado del pool se tratan como estado/diagnóstico y no como fallo de API key.
- El README principal, el README en español y las descripciones de release tienen cobertura bilingüe.
- La barra de direcciones y el layout del Chromium embebido se corrigieron en `v0.2.2`; Enter/Ir, navegación HTTPS de hosts simples y reflow del texto quedan cubiertos por la implementación del release.

## Cómo reportar un problema nuevo / How to report a new issue

Include the FreeCode version, Windows architecture, selected language, model/pool, whether RTK is enabled, the approximate time, and the relevant session-log excerpt with secrets removed. For stream failures, include whether the failure recovered automatically and whether the same request works after switching model or pool.

Incluí la versión de FreeCode, arquitectura de Windows, idioma elegido, modelo/pool, si RTK está habilitado, hora aproximada y el fragmento relevante del log de sesión sin secretos. Para fallos de stream, indicá si se recuperó automáticamente y si la misma solicitud funciona después de cambiar de modelo o pool.
