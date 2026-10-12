# FreeCode DeepSeek Harness

Programación en Windows con modelos OpenCode Free: elegí un proyecto,
describí el trabajo y dejá que el Harness coordine archivos, herramientas,
servidores MCP y llamadas al modelo.

[Read this in English](README.md)

## Español

## Estado actual: última release publicada: v0.9.3 (Windows x64)

Versión de la fuente: 0.9.3; última release publicada: v0.9.3 (Windows x64).

v0.9.3 está publicada para Windows x64. El usuario instaló el setup NSIS y
confirmó que funciona; el ejecutable portable se compiló, pero no se probó con
una instalación por separado.

La release v0.9.3 incluye:

- un instalador NSIS (~178,5 MB);
- un ejecutable portable de Windows (~651 MB / 620,8 MiB);
- `latest.yml` y el blockmap del setup para las actualizaciones;
- el runtime DSH fijado en `0.2.1-alpha.2` sigue como asset separado de ~421,6 MB
  en la release v0.9.2 y se descarga si no existe caché válida.

**Soporte de plataformas: solo Windows x64** (el setup v0.9.3 se empaquetó y se confirmó
que funciona después de instalarlo en Windows x64). Windows ARM64, Linux
(cualquier distribución/arquitectura) y macOS (ninguna arquitectura) no están
probados ni soportados. No se publican artefactos para estas plataformas. Los
builds de contribuidores existen pero no fueron probados por el mantenedor y no deben
tratarse como releases utilizables. Las compilaciones son locales y no usan
workflows de GitHub Actions.

`0.4.3` es una referencia histórica de recuperación, no la release actual ni
la fuente de verdad. v0.9.3 es la baseline publicada actual para Windows x64.

## Qué incluye

- **Modo integrado Gentle AI** — un preset de agente `gentle-ai` seleccionable
  que reutiliza IPC, MCP, ModelCatalog, permisos, sandbox y plan-mode. Se activa
  automáticamente cuando se detecta el binario; si no, usa `standard`. Un bridge
  IPC acotado `gentle-ai:*` (`status`, `doctor`, `run`) con contrato Zod queda
  expuesto al renderer mediante `window.freecode.gentleAi`.
- **Lane único de modelos** (`deepseek-free`, etiquetado *OpenCode Free*)
  servido por el gateway opencode2api incluido — modelos gratuitos anónimos,
  sin keys. Este es el único gateway de modelos: freellmpool se eliminó en
  0.8.0 y el lane duplicado `opencode-free` se consolidó en 0.9.0, de modo
  que cada modelo aparece una sola vez en el selector. Solo los modelos que
  responden un 200 real llegan al selector; los muertos se ocultan y el lane
  se recupera solo cuando vuelve la cuota.
- **Tor incluido para failover de egress** — una sola instancia `tor.exe`
  (`resources/freecode/tor/`, `torrc` endurecido de nodos rápidos) corre en
  `127.0.0.1:9050` (SOCKS) y `:9051` (control). opencode2api se lanza con
  `[direct, socks5://127.0.0.1:9050]` para que el tráfico de modelos pueda
  fallar vía Tor cuando el egress directo está bloqueado. El overlay de
  estado expone un bloque **Resiliencia Tor** con botón `NEWNYM` para rotar
  el circuito bajo demanda. Reemplaza la vieja dependencia de Cloudflare
  WARP; no hay servicio WARP, ni `warfleet`, ni sidecar `torfleet`.
- La UI upstream de DeepSeek Harness, sesiones, workspaces, permisos y
  herramientas de archivos.
- Una sola shell Electron y una sola generación del proceso `dsh` como objetivo
  de runtime.
- Los popups del renderer se deniegan y un backstop destruye cualquier ventana
  nativa fuera de splash/main/overlay. Los procesos `pwsh` hijos creados por
  Win32 en DSH también arrancan ocultos: no flashean consolas ni roban el foco.
- Engram y free-search como entradas MCP administradas. Engram está activado por
  defecto como la tercera fila administrada; free-search arranca deshabilitado
  hasta empaquetar su binario. Las entradas cuyo comando no puede ejecutarse
  arrancan deshabilitadas en vez de quemar el presupuesto de reconexión.
- Una tab Configuración → Plugins → MCP con toggles, estado de conexión,
  cantidad de herramientas registradas, errores y ruta de configuración.
- Configuración de Caveman en la tarjeta Shell, activada por defecto en el
  schema del shell; si falta el ejecutable queda como no-op explícito.
- Toggles separados para RTK y Caveman. Ambos son helpers opcionales por PATH,
  no binarios empaquetados.
- Tesseract incluido en Windows para los flujos de imágenes de modelos
  text-only.
- Navegador embebido solamente cuando el usuario lo abre explícitamente.
- Versión real en About, botón de actualizar igual a Enviar con flecha hacia
  abajo y avisos de tray durante descarga/instalación.
- **Locale español** completamente funcional en la UI web vía el parche `141-*`
  (30 archivos, ~1000 claves). El selector de idioma ahora renderiza español
  correctamente.

Gemini2API fue eliminado del runtime de 0.6.0. No queda proceso, provider,
modelo del selector, recurso empaquetado ni fallback Gemini para configurar.
Serena fue eliminada del catálogo MCP administrado en 0.8.0; Engram es la
superficie de memoria semántica.

## Instalación y primer uso

1. Descargá el setup o portable de Windows de la
   [release v0.9.3 en GitHub](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.3).
2. Instalalo o descomprimilo y abrí el acceso directo/ejecutable real.
3. Elegí la carpeta de tu proyecto en el picker.
4. Pedile al modelo que inspeccione o modifique el proyecto.

El instalador v0.9.3 incluye Electron, el gateway opencode2api, Tor, las
dependencias nativas y Tesseract (~178 MB). El runtime DSH grande se distribuye
como asset separado: en el primer inicio, FreeCode descarga el archivo Windows
x64 fijado en `0.2.1-alpha.2` (~421,6 MB), verifica su SHA-256 y ABI de
Electron, y lo guarda en `<userData>/harness-runtime`. Los arranques siguientes
reutilizan la caché validada sin conexión. Cualquier primer inicio sin caché
válida requiere Internet; si falla la descarga o validación, ofrece
Reintentar/Cerrar y no inicia el Harness. Los MCP administrados todavía
resuelven `uvx` (incluido, con fallbacks al PATH del usuario y descarga
fijada). Si detecta una instalación incompleta, muestra el log y recomienda
reinstalar desde la release oficial v0.9.3.

El bootstrap de Windows reutiliza silenciosamente un `uvx.exe` ya instalado o
descarga el ZIP oficial fijado de uv en una carpeta de herramientas por usuario,
verificando HTTPS y SHA-256. No modifica `PATH`, no requiere administrador y no
abre una consola. Un bootstrap fallido deja la app principal recuperable y
expone el problema MCP en la tab/log.

## MCP: Engram y free-search

En el primer arranque FreeCode crea atómicamente:

```text
<userData>/dsh-home/mcp/servers.json
<userData>/dsh-home/cordis.patch.yml
```

Las tres entradas administradas quedan activadas cuando su comando puede
ejecutarse. Abrí Configuración → Plugins → MCP para alternarlas o abrir el
JSON exacto. Sólo se regenera el bloque marcado de FreeCode en el patch de
Cordis; las filas propias del usuario se conservan. Un toggle actualiza el
entorno del hijo y reinicia únicamente el Harness, nunca una segunda
instancia de Electron. Los servidores sin binario (hoy free-search) arrancan
deshabilitados automáticamente.

**Engram** es la tercera fila MCP administrada, activa por defecto. Provee
memoria persistente y almacenamiento de conocimiento entre sesiones a través
del servidor MCP de Engram. Gentle AI usa `.atl/skill-registry.md` como
índice de skills y RDD v2 para desarrollo guiado por recibos.

El contrato de readiness objetivo es:

```text
spawn → initialize → tools/list → validación de schemas → registro de tools
```

La tab y la tray deben mostrar el estado resultante. Los popups del renderer
se deniegan y un backstop destruye cualquier ventana nativa fuera de
splash/main/overlay, así que ni las tools ni las páginas pueden flashear
ventanas transitorias sobre tu trabajo. Ningún hijo MCP debe usar `cmd.exe`,
`start`, una terminal ni una ventana visible; los reportes aislados de
flashes siguen bienvenidos (título/contenido de la ventana) y el backstop
loguea cada popup destruido.

free-search usa `free-search-mcp` mediante `uvx` y es la ruta HTTP-first para
investigar. No abre el navegador para buscar. El navegador embebido sólo se
abre si el usuario pide ver un resultado.

Más detalle en [docs/mcp-servers.md](docs/mcp-servers.md).

## Contrato de tool calls y streams

El contrato objetivo de cada tool call MCP registra un evento acotado con
`requestId`, servidor, nombre raw, intento, estado y duración. Los estados son:

```text
success
failed-local
failed-mcp
failed-provider
failed-timeout
failed-permission
failed-invalid-response
```

Resultados vacíos, legacy o malformados deben ser fallos explícitos, no
respuestas vacías exitosas. Los reintentos deben ser acotados y no se deben
repetir a ciegas las herramientas con efectos secundarios. Los logs no deben
contener argumentos, bytes de imágenes ni texto OCR. En la auditoría de 0.6.0
se capturó un stream truncado con cero texto y sin marcador de finalización; por
eso esta garantía es un gate de implementación de 0.7.0, no una afirmación de
que todos los caminos actuales ya están arreglados.

## OCR

Los modelos con visión conservan la imagen. Los modelos text-only reciben texto
OCR en los dos caminos soportados:

1. adjunto directo de imagen en el mensaje;
2. herramienta `read_image`.

Tesseract viene incluido para Windows; `pytesseract` no es requisito runtime.
El helper valida rutas absolutas, limita tamaño de imagen/salida, restringe
idioma/PSM, aplica timeout y cachea por hash. Binario ausente, imagen corrupta,
timeout, resultado vacío o salida excesiva son errores explícitos; nunca se
reemplaza silenciosamente por `[image omitted...]`.

## Shell, Caveman, RTK y sandbox

Configuración → Plugins → configuración de plugins → Shell muestra toggles
independientes para RTK y Caveman. Los defaults del schema están activados. Si
falta el binario, la feature correspondiente no opera y no se presenta como
activa. RTK y Caveman son helpers opcionales por PATH, no binarios
empaquetados. Sólo se envuelven comandos simples y seguros;
pipes, redirecciones, sustituciones y sintaxis compuesta se conservan.

Workspace Write continúa siendo el permiso predeterminado. La política de
sandbox sigue siendo upstream: FreeCode no amplía permisos automáticamente y
distingue un fallo de permisos de uno de herramienta/MCP.

## Updater y versión

About usa `app.getVersion()`, por lo que el binario empaquetado v0.9.3 dice 0.9.3.
La app chequea updates al iniciar y cada seis horas. El control de actualizar
es exactamente el botón circular primario de Enviar, con la flecha apuntando
hacia abajo. Al descargar, tooltip/menú de tray y notificación nativa lo
informan; la instalación/reinicio también es visible. v0.9.3 evita que el
updater ofrezca como actualización un runtime DSH más viejo; la release desktop
y el bootstrap de su runtime fijado son pasos separados.

## Causa de las regresiones anteriores y cierre de 0.7.0

El crash de instalación provenía de un bundle de `directory-picker-native` sin
el bridge Electron del diálogo. Después, eventos `exit` viejos del supervisor
podían programar otro spawn mientras un restart explícito ya creaba el
reemplazo. Además, readiness y registro de tools se confundían, un stream real
terminó truncado y vacío, RTK quedó fuera del payload, y los tests de ventanas
no observaban el evento de creación.

0.7.0 cierra el roadmap correctivo con evidencia (ver el
[ledger de 0.7.0](docs/STATE-0.7.0.md)):

- la ABI de addons nativos se controla antes de empaquetar, y los hashes del
  runtime se verifican contra el manifiesto;
- el stage del runtime dsh elimina ~1,1 GB de peso dev-only (instalador
  559 MB → ~300 MB);
- la suite del shell es hermética y está en verde (165/165), con cobertura de
  seeder, refresher, catálogo MCP, resolvers y updater;
- el lane anónimo prueba cada modelo anunciado y expone solo los que
  responden 200;
- los popups del renderer se deniegan y un backstop controla la superficie
  nativa;
- las entradas MCP con comandos irresolubles arrancan deshabilitadas en vez
  de quemar presupuestos de reconexión.

Las limitaciones honestas restantes están en
[Problemas conocidos](docs/KNOWN-ISSUES.md): la cuota del upstream gobierna
el lane anónimo, los binarios RTK/Caveman/free-search no están empaquetados y
las demás plataformas no están probadas.

## Desarrollo upstream-first

El subtree upstream se mantiene actualizable. El orden correcto es:

```text
congelar evidencia → actualizar/fetchear vendor/deepseek-harness
  → pnpm apply:upstream-patches
  → verificar commit upstream + manifest de patches
  → tests, typecheck, build, cierre de runtime y packaging
```

Cada cambio de producto debe ser un patch pequeño y ordenado en
`patches/upstream/`, o una implementación modular en la shell, con contrato
focalizado y prueba de replay/idempotencia. El aplicador es idempotente,
limitado a vendor y fail-closed. No dejes una feature permanente como edición
directa de `vendor/deepseek-harness`. Ver
[docs/UPSTREAM-PATCHING.md](docs/UPSTREAM-PATCHING.md).

## Gate local de Windows: v0.9.3

Ejecutá desde PowerShell en la workstation mantenedora:

```powershell
pnpm install --frozen-lockfile
pnpm apply:upstream-patches
pnpm test
pnpm typecheck
pnpm build:vendor
pnpm build:shell
pnpm --filter @freecode/shell package:runtime
pnpm --filter @freecode/shell package
pnpm --filter @freecode/shell smoke:nsis
```

Para v0.9.3 pasaron el preflight del shell, el build del shell, los gates de
regresión y el empaquetado setup/portable; el usuario confirmó que el setup
instalado funciona en Windows x64. El portable no se probó con instalación por
separado. El runtime DSH es el asset separado fijado que se describe arriba.
Los conteos del gate de 0.9.0
son históricos y siguen en sus [notas de release](release-notes-v0.9.0.md).

La [release publicada v0.9.3](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.3)
contiene setup, portable, blockmap y `latest.yml`. El tarball fijado del runtime
del Harness y su checksum `.sha256` siguen en la release v0.9.2.

Los artefactos locales de v0.9.3 quedaron en `apps/shell/release-0.9.3-local/`;
los archivos históricos de v0.9.2 en `apps/shell/release/` permanecen intactos.

## Builds manuales de otros sistemas

Linux y macOS no son targets de release de v0.9.3, y Windows ARM64 tampoco
está probado. Un contribuidor puede trabajar en un host nativo con Node,
pnpm, Git, herramientas de build de Electron y dependencias nativas del
sistema:

```bash
pnpm install --frozen-lockfile
pnpm apply:upstream-patches
pnpm build:vendor
pnpm test
pnpm typecheck
```

No uses esos builds como evidencia de release, no los subas y no esperes que el
`package:runtime`/release gate Windows-only acepte un target no Windows. Al
cambiar entre Windows y WSL reinstalá dependencias para no mezclar módulos
nativos ni links de workspace. Cualquier binario Linux existente necesita
testing real en Linux antes de anunciarse como usable.

## Proyecto y licencia

FreeCode es el fork [Akunimal/free-code-deepseek-harness](https://github.com/Akunimal/free-code-deepseek-harness)
de [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).

MIT — ver [LICENSE](LICENSE) y [NOTICE](NOTICE).

Proyectos relacionados: [OpenCode2API](https://github.com/jasonxu114514/opencode2api),
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness),
[RTK](https://github.com/rtk-ai/rtk),
[Caveman](https://github.com/JuliusBrussee/caveman),
[Gentle AI](https://github.com/Gentleman-Programming/gentle-ai) y
[free-search-mcp](https://github.com/sweetcornna/free-search-mcp).

## English

The complete English guide is [README.md](README.md). FreeCode mantiene el
mismo inventario upstream, registro de hardening y procedimiento de release
local en ambos idiomas.

## Índice de documentación

- [Inventario de features upstream](docs/UPSTREAM-FEATURES.md)
- [Notas de la release v0.9.3](release-notes-v0.9.3.md)
- [Notas de la release v0.9.2](release-notes-v0.9.2.md)
- [Notas de la release 0.9.1](release-notes-v0.9.1.md)
- [Notas de la release 0.9.0](release-notes-v0.9.0.md)
- [Notas de la release 0.8.0](release-notes-v0.8.0.md)
- [Notas de la release 0.7.0](release-notes-v0.7.0.md)
- [Estado de 0.7.0](docs/STATE-0.7.0.md)
- [Roadmap agresivo de 0.7.0](docs/ROADMAP-0.7.0.md)
- [Estado de 0.6.0](docs/STATE-0.6.0.md)
- [Roadmap de 0.6.0](docs/ROADMAP-0.6.0.md)
- [Auditoría y plan de tests de 0.6.0](docs/AUDIT-0.6.0-TEST-PLAN.md)
- [Release y packaging de Windows](docs/RELEASE.es.md)
- [Roadmap histórico](docs/ROADMAP.md)
- [Problemas conocidos](docs/KNOWN-ISSUES.md)
