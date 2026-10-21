# Known issues / Problemas conocidos

Última sincronización documental / Last documentation sync: 2026-10-20
Última release desktop publicada / Latest published desktop release: `v1.0.0`

## Estado actual / Current status

Fuente candidata / Candidate source: `v1.0.1`; DSH `0.2.1-alpha.11` (ABI 149).
**Estado candidato:** v1.0.1 reemplaza OpenCode2API por Phoenix/FreeLLMpool 0.13.0 y todavía no está publicada. No se compilaron setup/portable ni se ejecutó el gate público de caché DSH vacía; una precarga local no los reemplaza.

**Candidate status:** v1.0.1 replaces OpenCode2API with Phoenix/FreeLLMpool 0.13.0 and is not published. Setup/portable and the public empty-cache DSH gate have not run; a local preload is not a substitute.

v1.0.1 sólo se soporta Windows x64; Windows ARM64, Linux y macOS no están
probados ni soportados. Phoenix va empaquetado y verificado en la candidata. DSH
alpha.11 sigue como runtime separado que se descarga con SHA-256; hace falta
Internet si no hay caché válida. Ver [notas candidatas](../release-notes-v1.0.1.md).

v1.0.1 targets Windows x64 only; other platforms are untested/unsupported.
Phoenix is bundled and verified in the candidate. DSH alpha.11 remains a
separate SHA-256-verified first-launch download requiring Internet without a
valid cache. Upstream model availability and optional PATH helpers remain limitations.

## Limitaciones operativas / Operational limitations

### KI-001 — Free Pool availability is external / La disponibilidad del Free Pool es externa

Phoenix FreeLLMpool routes depend on upstream provider availability, model limits and network conditions. A route may report no eligible model or lose a request even when the local gateway is healthy. A concrete model selection is a strict pin and returns its failure without changing models. Auto Phoenix is the only selection that can try another eligible free route, and only before stream bytes are committed; an in-progress stream is never switched. This cannot remove provider, quota, IP or network limits.

Las rutas Phoenix FreeLLMpool dependen de la disponibilidad upstream, límites de modelos y red. Una ruta puede no tener modelos elegibles o perder una solicitud aunque el gateway local esté sano. Elegir un modelo concreto lo fija estrictamente y devuelve su error sin cambiar de modelo. Solo Auto Phoenix puede probar otra ruta gratuita elegible y únicamente antes de confirmar bytes del stream; nunca se cambia una ruta durante un stream. Esto no elimina límites de proveedor, cuota, IP o red.

### KI-002 — Separate first-launch runtime download / Descarga del runtime en el primer inicio

The v1.0.1 desktop package has not been built, so its size and hashes are not
known. DSH is separate from setup/portable: the current source pins
`0.2.1-alpha.11` for Windows x64, downloaded and verified on first launch, then
cached per user. Earlier v0.9.4/v0.9.5 releases used alpha8 (`0.2.1-alpha.9`);
those historical assets do not satisfy the current pin. Network retrieval is
expected when the cache is absent and is not by itself evidence of a hang.

El paquete desktop v1.0.1 todavía no se compiló, así que no se conocen su tamaño
ni hashes. DSH va separado de setup/portable: la fuente actual fija
`0.2.1-alpha.11` para Windows x64, que se descarga y verifica al primer inicio
y luego se guarda en caché por usuario. Las releases anteriores v0.9.4/v0.9.5
usaban alpha8 (`0.2.1-alpha.9`); esos assets históricos no satisfacen el pin
actual. La descarga cuando falta caché es esperada y no demuestra por sí sola
que la app esté colgada.

### KI-003 — RTK/Caveman are PATH helpers, not bundled / RTK/Caveman son helpers por PATH, no empaquetados

RTK and Caveman are not bundled in the published `v0.9.4` artifact. The code
probes the user PATH and treats a missing binary as an explicit no-op, so
the release works but is not self-contained for these helpers. Vendoring
them with version/hash/license metadata remains deferred work.

RTK y Caveman no están incluidos en el artefacto publicado de `v0.9.4`: el
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

**Historical, superseded in v1.0.1:** the old `deepseek-free` OpenCode2API lane
depended on shared opencode.ai quota. Phoenix obtains its allowlisted catalog
from pinned FreeLLMpool; provider availability and quota remain external
operational limits, as described in KI-001.

**Histórico, reemplazado en v1.0.1:** el antiguo lane `deepseek-free` de
OpenCode2API dependía de la cuota compartida de opencode.ai. Phoenix obtiene
ahora su catálogo permitido desde FreeLLMpool fijado; la disponibilidad y cuota
del proveedor siguen siendo límites operativos externos, como describe KI-001.

### KI-007 — Non-Windows platforms untested / Plataformas no-Windows sin probar

Windows ARM64, Linux and macOS were not tested by the maintainer and have
no published artifacts. v1.0.1 supports Windows x64 only; its Phoenix service
is a Windows x64 executable and does not bundle Tor. Contributor builds for
other platforms must not be treated as usable releases.

Windows ARM64, Linux y macOS no fueron probados por el mantenedor y no
tienen artefactos publicados. v1.0.1 solo soporta Windows x64; el servicio
Phoenix es un ejecutable Windows x64 y no incluye Tor. Los builds de
contribuidores para otras plataformas no deben tratarse como releases utilizables.

### KI-008 — Tor is failover, not the default path / Tor es failover, no la ruta por defecto

**Historical, superseded in v1.0.1:** the previous OpenCode2API/Tor egress
rotation lane is no longer part of the active runtime or package. Phoenix uses
its configured FreeLLMpool routes and does not bundle or control Tor.

**Histórico, reemplazado en v1.0.1:** el lane anterior de rotación de salida
OpenCode2API/Tor ya no forma parte del runtime ni del paquete activo. Phoenix
usa sus rutas FreeLLMpool configuradas y no incluye ni controla Tor.

### KI-009 — A semantic session tail can hide valid history / Un sufijo semántico puede ocultar historial válido

Before v0.9.3, the reader treated a complete V4 row with a broken tool-result
identity as corruption of the whole log, so earlier valid events were not
returned to the caller. Resolved in v0.9.3: the reader recovers only the
validated prefix in read-only mode, reports the first invalid sequence,
preserves the original raw/Zstandard bytes, and refuses write-open. It does not
repair or reconstruct the discarded suffix; keep the original session file
unchanged if manual recovery is needed.

Antes de v0.9.3, el lector trataba una fila V4 completa con identidad de
resultado de herramienta rota como corrupción de todo el log, por lo que no
devolvía los eventos válidos anteriores. Resuelto en v0.9.3: recupera solo el
prefijo validado en modo de solo lectura, informa la primera secuencia inválida,
preserva los bytes originales raw/Zstandard y rechaza abrir para escritura. No
repara ni reconstruye el sufijo descartado; si se requiere recuperación manual,
conservá intacto el archivo de sesión original.

### KI-010 — DSH alpha8 first-launch runtime asset / Asset runtime DSH alpha8 del primer inicio

Resolved in v0.9.4: the public release includes the immutable DSH alpha8 runtime asset, version `0.2.1-alpha.9`, and its SHA-256. The v0.9.5 release gate additionally proves first-run retrieval from a newly created empty profile/cache through production bootstrap/updater code, validates GitHub's SHA-256 digest, runtime manifest, extraction layout and Electron ABI, then starts the downloaded DSH CLI hidden with `--help` exit 0. The archive is 421,507,898 bytes; SHA-256 `bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6`. Older alpha4/alpha6 caches do not satisfy this pin.

Resuelto en v0.9.4: la release pública e inmutable incluye el asset runtime DSH alpha8 para Windows x64 (`0.2.1-alpha.9`) y su SHA-256. El gate v0.9.5 también prueba el primer inicio desde un perfil/caché nuevos y vacíos, descarga ese asset público mediante el bootstrap/updater de producción, valida SHA-256, manifest, estructura extraída y ABI de Electron, y luego inicia el CLI DSH en modo oculto; `--help` termina con código 0. El archivo mide 421.507.898 bytes; SHA-256 `bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6`. Las cachés alpha4/alpha6 no satisfacen este pin.

### KI-011 — Pool-status window close button / Botón de cierre de estado del pool

Resolved in v0.9.5: the borderless Pool Status page used `window.close()` from a
`data:` URL, which cannot close a window not created by renderer script. The
button now calls the preload bridge; main-process IPC closes only the live
overlay whose WebContents exactly matches the sender. Regression tests reject
other senders and ensure the main window cannot be closed through this route.

Resuelto en v0.9.5: corregido el botón de cierre de Estado del pool. La página sin marco de Estado del pool usaba `window.close()`
desde una URL `data:`, que no puede cerrar una ventana que no abrió un script del
renderer. El botón ahora usa el bridge preload; el IPC main cierra únicamente
el overlay activo cuyo WebContents coincide exactamente con el emisor. Las
pruebas de regresión rechazan otros emisores y protegen la ventana principal.

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

### KI-012 — Background window flashes / Ventanas de fondo fugaces

**Estado:** corregido en el candidato v0.9.6 y confirmado funcionando por el
usuario en su prueba local. Escritorios privados, Job antes de ejecutar,
watchdog acotado al Job y broker GUI explícito reemplazan la dependencia
exclusiva de flags ocultos. Falta el gate público limpio antes de publicar.

**Status:** fixed in the v0.9.6 candidate and user-confirmed in its local test.
Private desktops, pre-execution Job attachment, a bounded Job-scoped watchdog
and an explicit GUI broker replace reliance on hidden flags alone. The public
clean-cache gate is still required before publication. This is not a sandbox
against malicious same-user code, UAC, services or OS brokers.

Implementation and limits: [Windows desktop containment](HEADLESS-DESKTOP.md).

## Cómo reportar un problema nuevo / How to report a new issue

Include the FreeCode version, Windows architecture, selected language, model/pool, whether RTK is enabled, the approximate time, and the relevant session-log excerpt with secrets removed. For stream failures, include whether the failure recovered automatically and whether the same request works after switching model or pool.

Incluí la versión de FreeCode, arquitectura de Windows, idioma elegido, modelo/pool, si RTK está habilitado, hora aproximada y el fragmento relevante del log de sesión sin secretos. Para fallos de stream, indicá si se recuperó automáticamente y si la misma solicitud funciona después de cambiar de modelo o pool.
