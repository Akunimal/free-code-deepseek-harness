# FreeCode DeepSeek Harness v1.0.0 — Windows x64

## English

### First stable release

1.0.0 is the first stable FreeCode desktop release. It runs the opencode2api Go
gateway (v1.4.1, pinned in `vendor/opencode2api`, with the FreeCode tool-name
repair and `/inference/openai` namespace) and no longer uses Tor.

### Egress proxy rotation (direct first)

Free access to OpenCode Zen is blocked from some networks: Zen answers `403
FreeTierError` to certain IPs and `429` when a free tier hits its daily cap.
1.0.0 adds a rotation lane to recover from that automatically.

- **Direct is always tried first.** The gateway's pool cursor starts on the
  direct connection and only advances to a proxy when a direct attempt returns
  a non-2xx response (403/429/5xx). When your own IP works, no proxy is used.
- A background rotator harvests public SOCKS5 proxies, verifies that each one
  currently reaches `cloudflare.com` and `opencode.ai`, and writes the healthy
  ones to the gateway's proxyfile. The pool refreshes every 15 minutes.
- **Third-party proxies — read this.** When direct fails, requests go out
  through a public proxy run by someone else. FreeCode is a free tool; nothing
  here is designed for secrecy, and the models and OpenCode already have their
  own telemetry. The proxy sees the destination host, timing and traffic
  volume. It does **not** see your prompts or code: every candidate is checked,
  and every request is sent, over an end-to-end TLS session to `opencode.ai`
  with full certificate verification (`rejectUnauthorized: true`), so a proxy
  that tampers with TLS fails verification and is dropped. Disable the lane with
  the environment variable `FREECODE_DISABLE_PROXY_ROTATION=1`.
- **No fixed ports.** Nothing in FreeCode binds a hard-coded port. Every local
  listener picks a free loopback port and skips any port already in use, so it
  never collides with another local gateway (for example a separate
  `C:\LocalAI` stack).

### Model selector and reasoning effort

- **Free models take a while to load.** At startup the app probes every free
  model before it appears in the selector. This usually takes from a few
  seconds to about two minutes, longer when the proxy lane is needed. The
  selector shows a spinner with "Loading free models…" meanwhile, also while
  proxies are being harvested.
- `deepseek-v4.1-flash-free` is the preferred default when it answers.
- The reasoning effort starts at each model's own default (no forced High).
  You can pick any level the model supports from the selector.
- Context window and output limits come from the gateway's free `zen` lane
  metadata, which wins over other lanes advertising the same model.
- When no free model answers, the app shows a native notification (once per
  outage). Proxy notifications appear only when the routes drop to zero or come
  back, not on every 15-minute refresh.
- The official DeepSeek API-key prompt no longer appears on the FreeCode
  desktop.

### Removed

- Tor: no Tor binary, pool, overlay or "TOR" pill next to the selector.
- The Gentle AI mode and its IPC/binary integration; the Standard modes cover
  its use.
- The Engram MCP server; rows saved by older builds are dropped on the next
  boot, which also stops its reconnect loop in the log.
- The legacy "Pool" menu is now "Harness".

### Runtime

DSH runtime `0.2.1-alpha.11` (Windows x64, ~423 MB) is built from this
repository's patch stack and published separately in the
[runtime-0.2.1-alpha.11](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/runtime-0.2.1-alpha.11) pre-release. On first launch FreeCode downloads
it, verifies its SHA-256 and Electron ABI, and caches it under
`<userData>/harness-runtime`. The patch stack carries no revert patches: the
Gentle AI and Tor-pill patches were removed and the Spanish conversation locale
kept as its own patch.

### Limits

- The Windows setup is not code-signed.
- Free models have daily caps and provider overloads; a temporary outage is not
  a bug in this build. Through the proxy lane, responses can take tens of
  seconds.

## Español

### Primera versión estable

1.0.0 es la primera versión estable de FreeCode para escritorio. Usa el gateway
opencode2api en Go (v1.4.1, fijado en `vendor/opencode2api`, con la reparación
de nombres de herramienta y el namespace `/inference/openai` de FreeCode) y ya
no usa Tor.

### Rotación de proxies de salida (directo primero)

El acceso gratuito a OpenCode Zen está bloqueado desde algunas redes: Zen
responde `403 FreeTierError` a ciertas IP y `429` cuando un tier gratuito llega
a su límite diario. 1.0.0 agrega una vía de rotación para recuperarse solo.

- **Siempre se intenta directo primero.** El cursor del pool del gateway empieza
  por la conexión directa y solo pasa a un proxy cuando un intento directo
  devuelve una respuesta no-2xx (403/429/5xx). Si tu IP funciona, no se usa
  ningún proxy.
- Un rotador en segundo plano cosecha proxies SOCKS5 públicos, verifica que cada
  uno llegue a `cloudflare.com` y `opencode.ai`, y escribe los sanos en el
  proxyfile del gateway. El pool se refresca cada 15 minutos.
- **Proxies de terceros — leé esto.** Cuando directo falla, las peticiones salen
  por un proxy público de otra persona. FreeCode es una herramienta gratuita;
  nada acá está pensado para el secreto, y los modelos y OpenCode ya tienen su
  propia telemetría. El proxy ve el host destino, los tiempos y el volumen de
  tráfico. **No** ve tus prompts ni tu código: cada candidato se verifica, y
  cada petición se envía, por una sesión TLS de extremo a extremo a
  `opencode.ai` con verificación completa de certificado (`rejectUnauthorized:
  true`), así que un proxy que altera el TLS falla la verificación y se descarta.
  Desactivá la vía con la variable de entorno `FREECODE_DISABLE_PROXY_ROTATION=1`.
- **Sin puertos fijos.** Nada en FreeCode usa un puerto hard-coded. Cada listener
  local toma un puerto libre de loopback y saltea cualquiera ya en uso, así que
  nunca choca con otro gateway local (por ejemplo un stack aparte en
  `C:\LocalAI`).

### Selector de modelos y esfuerzo de razonamiento

- **Los modelos free tardan un poco en cargar.** Al iniciar, la app prueba cada
  modelo gratuito antes de mostrarlo en el selector. Suele tardar desde unos
  segundos hasta unos dos minutos, más si hace falta el lane de proxies.
  Mientras tanto el selector muestra un spinner con "Cargando modelos free…",
  también mientras se buscan proxies.
- `deepseek-v4.1-flash-free` es el predeterminado preferido cuando responde.
- El esfuerzo de razonamiento arranca en el predeterminado de cada modelo (ya no
  se fuerza High). Podés elegir cualquier nivel que el modelo soporte.
- El contexto y la salida máxima salen de la metadata del lane gratuito `zen`
  del gateway, que gana sobre otros lanes con el mismo modelo.
- Cuando ningún modelo free responde, la app muestra una notificación nativa
  (una vez por corte). Las notificaciones de proxies aparecen solo cuando las
  rutas llegan a cero o vuelven, no en cada refresco de 15 minutos.
- El cartel de API key de DeepSeek ya no aparece en el escritorio de FreeCode.

### Eliminado

- Tor: sin binario, pool, overlay ni la pastilla "TOR" al lado del selector.
- El modo Gentle AI y su integración IPC/binario; los modos Standard cubren su uso.
- El servidor MCP Engram; las filas guardadas por builds anteriores se descartan
  en el siguiente arranque, lo que también corta su loop de reconexión en el log.
- El menú "Pool" pasa a llamarse "Harness".

### Runtime

El runtime DSH `0.2.1-alpha.11` (Windows x64, ~423 MB) se arma desde la pila de
parches de este repositorio y se publica aparte en la pre-release
[runtime-0.2.1-alpha.11](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/runtime-0.2.1-alpha.11). En el primer inicio FreeCode lo descarga,
verifica su SHA-256 y la ABI de Electron, y lo guarda en
`<userData>/harness-runtime`. La pila de parches no tiene parches de reversión:
se quitaron los de Gentle AI y la pastilla Tor, y el idioma español del chat
quedó como parche propio.

### Límites

- El setup de Windows no está firmado con código.
- Los modelos free tienen límites diarios y sobrecargas; un corte temporal no es
  un bug de esta build. Por el lane de proxies, las respuestas pueden tardar
  decenas de segundos.
