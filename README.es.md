# FreeCode DeepSeek Harness

### Fuente actual: candidata v1.0.1 (Windows x64)

La candidata v1.0.1 reemplaza el gateway activo OpenCode2API por Phoenix,
incluido y verificado por hash/procedencia, compilado desde FreeLLMpool 0.13.0
fijado. No requiere `C:\LocalAI`, Python ni FreeLLMpool instalado aparte, ni
un servicio/puerto local preexistente. El selector muestra **Auto Phoenix**
primero y después los modelos gratuitos permitidos. Elegir un modelo concreto
lo fija estrictamente: un error no cambia silenciosamente de modelo. Solo Auto
puede probar otra ruta gratuita elegible antes de iniciar el stream; nunca lo
cambia a mitad de respuesta. Los modelos concretos se ordenan por la puntuación
de capacidad fijada de FreeLLMpool; la latencia no puede adelantar un modelo
inferior. La instantánea Kilo sin clave incluye MiniMax M3.1 Flash, Laguna S 2.1
y Dots3 Note Preview; excluye todos los Nemotron y los alias dinámicos de Kilo.
Los puestos de agente Code de Kilo (#14/#98/#99 en la instantánea del
2026-10-21) son proxies cambiantes basados en uso real, no benchmarks
directamente comparables; el acceso anónimo tiene un límite de 200
solicitudes/hora/IP. Ver el [catálogo gratuito activo](https://kilo.ai/landing/free-models)
y los [límites de acceso anónimo](https://kilo.ai/docs/gateway/authentication).
El catálogo depende de proveedores externos, por lo que requiere Internet y
disponibilidad upstream. Solo los modelos que devuelven una respuesta válida y
no vacía con HTTP 200 siguen en el selector. Los modelos que fallan se quitan
inmediatamente; el éxito anterior queda solo como diagnóstico y el modelo
reaparece después de una sonda válida.

Phoenix no recibe un campo confiable de ventana de contexto para cada ruta.
FreeCode muestra capacidades nativas revisadas para modelos identificables y
un límite conservador de 32.768 tokens en la app para Auto y alias dinámicos;
el proveedor puede imponer un límite menor por ruta. Las notas bilingües
incluyen los valores por modelo y sus fuentes.

**Estado de release:** v1.0.1 es una candidata local, no está publicada. El
setup y el portable actualizados se compilaron y verificaron estáticamente para
que los pruebes; este flujo no ejecutó el instalador. Un build y una
verificación estática no demuestran una instalación limpia. El gate obligatorio de caché vacía sigue
pendiente. La última release desktop publicada es la histórica
[v1.0.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0).
Ver las [notas bilingües de la candidata v1.0.1](release-notes-v1.0.1.md) y
el [historial de v1.0.0](release-notes-v1.0.0.md).

El runtime DSH `0.2.1-alpha.11` sigue descargándose por separado en el primer
inicio; no viene en setup/portable. Una instalación limpia necesita Internet
para descargar y verificar ese runtime público exacto. Phoenix sí va incluido
en el payload desktop y se valida antes de arrancar.

La UI de conversación conserva los fondos CSS/ASCII dinámicos inspirados en
Hermes; son decorativos y no alteran el enrutamiento de modelos ni solicitudes.

Programación primero en Windows: elegí un proyecto, describí el trabajo y dejá
que el Harness local coordine archivos, herramientas, servidores MCP y llamadas
a modelos a través de Phoenix.

[Read this in English](README.md)

## Español

## Estado actual: candidata v1.0.1 (Windows x64)

Versión de la fuente: 1.0.1; runtime DSH fijado: `0.2.1-alpha.11`.

**Estado de release:** solo candidata local. El setup y el portable están
compilados y verificados estáticamente para tu prueba local; este flujo no los
instaló ni ejecutó. Antes de cualquier publicación futura siguen siendo
obligatorios el smoke público de DSH con caché vacía y el gate completo.

La fuente v1.0.1 fija Phoenix a FreeLLMpool 0.13.0 e incluye su gateway
Windows x64, allowlist, licencia MIT y recibo de fuente/build. DSH sigue como
runtime alpha.11 inmutable y separado. Ver las notas históricas de
[v1.0.0](release-notes-v1.0.0.md) para el gateway anterior.

La salida local actual es
`apps/shell/release-1.0.1-local-20261021-context-audit/` e incluye setup NSIS,
ejecutable portable de Windows, blockmap y `latest.yml`. Los hashes estáticos
exactos están en las [notas bilingües de candidata](release-notes-v1.0.1.md). El runtime
alpha.11 (~423 MB) y su SHA-256 se publican en la
[pre-release runtime-0.2.1-alpha.11](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/runtime-0.2.1-alpha.11). Se necesita Internet
sin caché válida. El gate obligatorio usa el bootstrap/updater de producción,
perfil/caché vacíos, SHA-256, manifiesto, ABI de Electron y arranque de CLI
oculto. No se publica si falla. Los runtimes anteriores no satisfacen alpha.11.

Phoenix reenvía los pedidos a los proveedores upstream permitidos. Esos
proveedores reciben el contenido y pueden aplicar sus propias políticas de
disponibilidad, retención y telemetría; revisá sus condiciones antes de usarlo.
FreeCode ya no agrega el pool de rotación de proxies de OpenCode2API.

**Plataforma soportada: solo Windows x64**; Windows ARM64, Linux y macOS no
están probados ni soportados. Los builds son locales sin GitHub Actions; los binarios no están firmados.
Las releases anteriores conservan sus tags y binarios históricos.

## Qué incluye la candidata v1.0.1

- **Gateway Phoenix + FreeLLMpool 0.13.0 incluido** — ejecutable Windows x64
  verificado, licencia MIT, allowlist exacta de modelos y recibo de
  fuente/build. No requiere Python local, `C:\LocalAI`, FreeLLMpool instalado
  aparte ni dependencia del puerto 8095.
- **Selector Phoenix** — Auto Phoenix primero, seguido por rutas gratuitas
  concretas ordenadas por puntuación de capacidad fijada (Kilo usa su ranking
  documentado de uso del agente Code como proxy más débil y cambiante, no
  directamente comparable con benchmarks). La latencia no adelanta modelos de
  menor rango. La instantánea Kilo sin clave contiene MiniMax M3.1 Flash,
  Laguna S 2.1 y Dots3 Note Preview; se excluyen todos los Nemotron y alias
  dinámicos de Kilo. Los modelos concretos permanecen fijados: ante un error se
  devuelve el error, no se elige otro modelo a escondidas. Solo Auto puede
  probar otra ruta elegible antes del primer byte del stream; nunca cambia a
  mitad de la respuesta. Solo una respuesta válida y no vacía con HTTP 200
  mantiene una ruta en el selector: los fallos de la sonda actual la quitan y
  una respuesta válida posterior la vuelve a mostrar.
- **Contexto por modelo** — los modelos identificables usan ventanas nativas
  revisadas en vez del 256K genérico. Auto y alias cambiantes tienen un límite
  conservador de 32K en la app, salvo que el gateway declare uno; el proveedor
  puede limitar más la ruta. Ver valores y referencias en las notas bilingües.
- **Estado del catálogo** — muestra carga y fallos mientras se actualiza el
  catálogo del proveedor; un upstream vacío o caído no se presenta como lista
  exitosa.
- La UI upstream de DeepSeek Harness, sesiones, workspaces, permisos y
  herramientas de archivos.
- Una sola shell Electron y una sola generación del proceso `dsh` como objetivo
  de runtime.
- Los popups del renderer se deniegan. Los procesos de fondo y sus descendientes
  usan `headless-host` con escritorio privado y Job; no dependen solo de
  `windowsHide`. Las acciones GUI del usuario usan un broker autenticado.
  No es un sandbox frente a código malicioso, UAC, servicios o brokers del SO.
- free-search como entrada MCP administrada; arranca deshabilitado hasta
  empaquetar su binario. Las entradas cuyo comando no puede ejecutarse
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
Serena fue eliminada del catálogo MCP administrado en 0.8.0. Engram y el
modo Gentle AI se eliminaron en 1.0.0; los modos Standard cubren su uso.

## Instalación y primer uso

1. Para la versión estable publicada, usá la release histórica
   [v1.0.0 en GitHub](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0).
   v1.0.1 sigue sin publicarse; sus artefactos locales todavía no pasaron el
   gate obligatorio de instalación limpia y no son una release pública.
2. Instalalo o descomprimilo y abrí el acceso directo/ejecutable real.
3. Elegí la carpeta de tu proyecto en el picker.
4. Esperá a que carguen los modelos free (spinner en el selector) y pedile al
   modelo que inspeccione o modifique el proyecto.

El payload desktop compilado de v1.0.1 incluye Electron, el gateway Phoenix,
dependencias nativas y Tesseract. Setup/portable pasaron la verificación
estática, pero no se instalaron ni ejecutaron. El
runtime DSH grande se distribuye
como asset separado: en el primer inicio, FreeCode descarga el archivo Windows
x64 fijado en `0.2.1-alpha.11` (~423 MB), verifica el SHA-256 de GitHub y ABI de
Electron, y lo guarda en `<userData>/harness-runtime`. Los arranques siguientes
reutilizan la caché validada sin conexión. Cualquier primer inicio sin caché
válida requiere Internet; si falla la descarga o validación, ofrece
Reintentar/Cerrar y no inicia el Harness. Los MCP administrados todavía
resuelven `uvx` (incluido, con fallbacks al PATH del usuario y descarga
fijada). Si detecta una instalación incompleta, muestra el log y recomienda
reinstalar desde una release oficial publicada.

El bootstrap de Windows reutiliza silenciosamente un `uvx.exe` ya instalado o
descarga el ZIP oficial fijado de uv en una carpeta de herramientas por usuario,
verificando HTTPS y SHA-256. No modifica `PATH`, no requiere administrador y no
abre una consola. Un bootstrap fallido deja la app principal recuperable y
expone el problema MCP en la tab/log.

## MCP: free-search

En el primer arranque FreeCode crea atómicamente:

```text
<userData>/dsh-home/mcp/servers.json
<userData>/dsh-home/cordis.patch.yml
```

La entrada administrada queda activada cuando su comando puede
ejecutarse. Abrí Configuración → Plugins → MCP para alternarla o abrir el
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

La investigación usa el navegador embebido primero cuando necesita navegar.
`free-search-mcp` mediante `uvx` queda como fallback HTTP si el navegador no
puede resolver la consulta; la búsqueda API no debe reemplazarlo en silencio.
El navegador no debe abrir ventanas nativas ajenas.

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

About usa `app.getVersion()`; la candidata local v1.0.1 usa esa versión. Aún no
se instaló ni validó con el gate de runtime de caché vacía.
La app chequea updates al iniciar y cada seis horas. El control de actualizar
es exactamente el botón circular primario de Enviar, con la flecha apuntando
hacia abajo. Al descargar, tooltip/menú de tray y notificación nativa lo
informan; la instalación/reinicio también es visible. El updater nunca ofrece como actualización un runtime DSH más viejo; la release desktop
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

## Gate local de Windows: candidata v1.0.1

Ejecutá desde PowerShell en Windows x64. El gate no es interactivo en la
interfaz desktop: compila un paquete NSIS en un directorio temporal único,
verifica ese paquete y la descarga pública del runtime desde caché vacía, y no instala ni inicia la
GUI de FreeCode. Sí inicia hijos headless propios de prueba (Electron-as-Node, CLI DSH y fixtures)
aislados bajo rutas scratch; la limpieza apunta al árbol PID registrado y nunca
enumera ni termina procesos ajenos.

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-1.0.1-local-20261021-context-audit'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-1.0.1-local-20261021-context-audit
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

`build:desktop` creó setup y portable en
`apps/shell/release-1.0.1-local-20261021-context-audit/`; rechaza reemplazar una carpeta no vacía.
`verify:desktop-release-assets` valida los PE exactos, el blockmap, los metadatos
del updater y sus hashes sin iniciar ninguno de los ejecutables. El packaging
desktop no reconstruye ni reemplaza el runtime DSH, que tiene su propia versión.
Sólo cuando cambie el runtime DSH
se debe subir su versión en el manifest y ejecutar `pnpm package:runtime:release`;
las versiones existentes del runtime son inmutables.

Las builds anteriores del runtime quedan como historia en sus releases.
El runtime actual es alpha.11: se obtiene desde la
[pre-release runtime-0.2.1-alpha.11](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/runtime-0.2.1-alpha.11);
no se admite una precarga local como prueba pública de primer inicio.

La [release v1.0.0 en GitHub](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0)
es histórica; v1.0.1 todavía no se publicó. Los artefactos locales actuales
están en `apps/shell/release-1.0.1-local-20261021-context-audit/`; las carpetas históricas no se sobrescriben.
El gate no instala ni inicia la GUI de FreeCode. El smoke interactivo instala,
inicia y desinstala, por lo que solo se permite en una VM Windows desechable;
no se ejecuta en la workstation ni junto a tu instancia.
Ver la [política de release](docs/RELEASE-POLICY.es.md).

## Builds manuales de otros sistemas

Linux y macOS no son targets de release de v1.0.1, y Windows ARM64 tampoco
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
gate desktop Windows-only acepte un target no Windows. `package:runtime:release`
sólo corresponde a un cambio intencional de versión del runtime DSH. Al
cambiar entre Windows y WSL reinstalá dependencias para no mezclar módulos
nativos ni links de workspace. Cualquier binario Linux existente necesita
testing real en Linux antes de anunciarse como usable.

## Proyecto y licencia

FreeCode es el fork [Akunimal/free-code-deepseek-harness](https://github.com/Akunimal/free-code-deepseek-harness)
de [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).

MIT — ver [LICENSE](LICENSE) y [NOTICE](NOTICE).

Proyectos relacionados: [FreeLLMpool](https://github.com/0xzr/freellmpool),
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness),
[RTK](https://github.com/rtk-ai/rtk),
[Caveman](https://github.com/JuliusBrussee/caveman) y
[free-search-mcp](https://github.com/sweetcornna/free-search-mcp).

## English

The complete English guide is [README.md](README.md). FreeCode uses its
Phoenix/FreeLLMpool free-model catalog; both guides share upstream inventory,
hardening and the local release policy.

## Índice de documentación

- [Inventario de features upstream](docs/UPSTREAM-FEATURES.md)
- [Notas de candidata v1.0.1](release-notes-v1.0.1.md)
- [Notas históricas de v1.0.0](release-notes-v1.0.0.md)
- [Notas de la release v0.9.6](release-notes-v0.9.6.md)
- [v0.9.5 — history / historial](release-notes-v0.9.5.md)
- [Notas de la release v0.9.4](release-notes-v0.9.4.md)
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
