# FreeCode DeepSeek Harness

Programación en Windows con modelos OpenCode Free: elegí un proyecto,
describí el trabajo y dejá que el Harness coordine archivos, herramientas,
servidores MCP y llamadas al modelo.

[Read this in English](README.md)

## Español

## Estado actual: 0.7.0 publicado (Windows x64)

0.7.0 está publicado para Windows x64 con:

- un instalador NSIS (~300 MB);
- un ejecutable portable de Windows (~300 MB).

**Soporte de plataformas: probado solo en Windows 10/11 x64**
(instalación limpia, arranque, `harness ready`, los dos lanes con modelos,
apagado limpio). **NO probado y NO soportado**: Windows ARM64, Linux
(cualquier distribución/arquitectura), macOS (cualquier arquitectura). No se
publican artefactos para estas plataformas; los builds de contribuidores
existen pero no fueron probados por el mantenedor y no deben tratarse como
releases utilizables. Las compilaciones son locales y no usan workflows de
GitHub Actions.

`0.4.3` es la última referencia operativa conocida porque abre bien. No es la
fuente de verdad y puede no contener los fixes de este worktree.

## Qué incluye

- Ruteo de modelos OpenCode Free mediante el pool local compatible con OpenCode,
  más un segundo **lane OpenCode No-Auth** (`opencode-free`) servido por el
  gateway opencode2api v1.3.2 incluido — modelos gratuitos anónimos, sin keys.
  Solo los modelos que responden un 200 real llegan al selector; los muertos
  se ocultan y el lane se recupera solo cuando vuelve la cuota.
- La UI upstream de DeepSeek Harness, sesiones, workspaces, permisos y
  herramientas de archivos.
- Una sola shell Electron y una sola generación del proceso `dsh` como objetivo
  de runtime.
- Los popups del renderer se deniegan y un backstop destruye cualquier ventana
  nativa fuera de splash/main/overlay: ninguna tool ni página puede flashear
  ventanas transitorias sobre tu trabajo.
- Serena y free-search como entradas MCP administradas. Serena corre con el
  launcher headless incluido; las entradas cuyo comando no puede ejecutarse
  arrancan deshabilitadas en vez de quemar el presupuesto de reconexión
  (free-search queda apagado hasta empaquetar su binario).
- Una tab Configuración → Plugins → MCP con toggles, estado de conexión,
  cantidad de herramientas registradas, errores y ruta de configuración.
- Configuración de Caveman en la tarjeta Shell, activada por defecto en el
  schema del shell; si falta el ejecutable queda como no-op explícito.
- Toggles separados para RTK y Caveman. Ambos siguen como helpers opcionales
  por PATH en 0.7.0, no son binarios empaquetados.
- Tesseract incluido en Windows para los flujos de imágenes de modelos
  text-only.
- Navegador embebido solamente cuando el usuario lo abre explícitamente.
- Versión real en About, botón de actualizar igual a Enviar con flecha hacia
  abajo y avisos de tray durante descarga/instalación.

Gemini2API fue eliminado del runtime de 0.6.0. No queda proceso, provider,
modelo del selector, recurso empaquetado ni fallback Gemini para configurar.
También se eliminaron las entradas LSP independientes: Serena es la superficie
semántica MCP.

## Instalación y primer uso

1. Descargá el setup o portable de Windows de la release 0.7.0 en GitHub.
2. Instalalo o descomprimilo y abrí el acceso directo/ejecutable real.
3. Elegí la carpeta de tu proyecto en el picker.
4. Pedile al modelo que inspeccione o modifique el proyecto.

El instalador de 0.7.0 incluye Electron, el runtime upstream del Harness, el
binario del gateway opencode2api, dependencias nativas y Tesseract (~300 MB
de descarga, ~69.000 archivos, unos 10 minutos para desempaquetar — es
normal, no es un cuelgue). Los MCP administrados todavía resuelven `uvx`
(incluido, con fallbacks a PATH del usuario y descarga fijada). Si detecta
una instalación incompleta, muestra el log y recomienda reinstalar desde la
release oficial 0.7.0.

El bootstrap de Windows reutiliza silenciosamente un `uvx.exe` ya instalado o
descarga el ZIP oficial fijado de uv en una carpeta de herramientas por usuario,
verificando HTTPS y SHA-256. No modifica `PATH`, no requiere administrador y no
abre una consola. Ese comportamiento es una deuda de cierre de 0.7.0: la
release corregida debe funcionar con red bloqueada y sin dependencias externas.

## MCP: Serena y free-search

En el primer arranque FreeCode crea atómicamente:

```text
<userData>/dsh-home/mcp/servers.json
<userData>/dsh-home/cordis.patch.yml
```

Las dos entradas administradas quedan activadas cuando su comando puede
ejecutarse. Abrí Configuración → Plugins → MCP para alternarlas o abrir el
JSON exacto. Sólo se regenera el bloque marcado de FreeCode en el patch de
Cordis; las filas propias del usuario se conservan. Un toggle actualiza el
entorno del hijo y reinicia únicamente el Harness, nunca una segunda
instancia de Electron. Los servidores sin binario (hoy free-search) arrancan
deshabilitados automáticamente.

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

Serena arranca deliberadamente sin `--project-from-cwd`: el cwd del hijo es el
`dsh-home` privado, no el proyecto elegido, para evitar escanear todo el disco.
Antes de la primera herramienta Serena de un proyecto, el bridge canoniza la
ruta y llama `activate_project`; la activación y la llamada pedida se
serializan. Al cambiar de proyecto se hace una activación nueva cuando termina
la operación anterior. Los errores de activación vuelven al modelo y aparecen
como estado MCP degradado/fallido.

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
activa. RTK y Caveman son helpers opcionales por PATH en 0.7.0, no binarios
empaquetados. Sólo se envuelven comandos simples y seguros;
pipes, redirecciones, sustituciones y sintaxis compuesta se conservan.

Workspace Write continúa siendo el permiso predeterminado. La política de
sandbox sigue siendo upstream: FreeCode no amplía permisos automáticamente y
distingue un fallo de permisos de uno de herramienta/MCP.

## Updater y versión

About usa `app.getVersion()`, por lo que el binario empaquetado dice 0.7.0.
La app chequea updates al iniciar y cada seis horas. El control de actualizar
es exactamente el botón circular primario de Enviar, con la flecha apuntando
hacia abajo. Al descargar, tooltip/menú de tray y notificación nativa lo
informan; la instalación/reinicio también es visible. El gate no exige
actualización desde 0.4.3: sólo debe conservar el arranque limpio y no ocultar
un fallo.

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

## Gate local de Windows: 0.7.0 publicado

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

Este gate pasó para 0.7.0 con typecheck limpio, suite del shell en 165/165,
todos los verificadores prepackage en verde (hooks NSIS, frescura de vendor,
manifiesto de runtime, ABI nativa), instalación limpia, `harness ready`, los
dos lanes con modelos y apagado limpio. Sigue sin exigir upgrade desde 0.4.3:
sólo instalación limpia y apertura correcta.

El tag `0.7.0` y la release de GitHub (setup, portable, blockmap,
`latest.yml`, tarball del runtime) se publicaron desde estos artefactos.

Los artefactos quedan en `apps/shell/release/`.

## Builds manuales de otros sistemas

Linux y macOS no son targets de release de 0.7.0, y Windows ARM64 tampoco
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
[Serena](https://github.com/oraios/serena) y
[free-search-mcp](https://github.com/sweetcornna/free-search-mcp).

## English

The complete English guide is [README.md](README.md). FreeCode mantiene el
mismo inventario upstream, registro de hardening y procedimiento de release
local en ambos idiomas.

## Índice de documentación

- [Inventario de features upstream](docs/UPSTREAM-FEATURES.md)
- [Notas de la release 0.7.0](release-notes-v0.7.0.md)
- [Estado de 0.6.0](docs/STATE-0.6.0.md)
- [Roadmap de 0.6.0](docs/ROADMAP-0.6.0.md)
- [Auditoría y plan de tests de 0.6.0](docs/AUDIT-0.6.0-TEST-PLAN.md)
- [Estado de 0.7.0](docs/STATE-0.7.0.md)
- [Roadmap agresivo de 0.7.0](docs/ROADMAP-0.7.0.md)
- [Release y packaging de Windows](docs/RELEASE.es.md)
- [Roadmap histórico](docs/ROADMAP.md)
- [Problemas conocidos](docs/KNOWN-ISSUES.md)
