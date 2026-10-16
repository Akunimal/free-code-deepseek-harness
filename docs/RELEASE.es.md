# Release y packaging

### Release actual: v0.9.4 (Windows x64)

La release pública v0.9.4 incluye instalador NSIS, portable, metadatos del updater y el runtime DSH exacto `0.2.1-alpha.8` con checksum SHA-256. Incorpora opencode2api v1.4.0, V094-37 (indicador de carga del catálogo), V094-38 (fondos animados originales inspirados en Hermes: patrón estable durante la generación y crossfade al completar/detener), V094-39 (contexto y esfuerzos por modelo), sincronización del perfil activo, rutas de inferencia documentadas y V094-35 (fix de recursión del bloqueo del modelo). El gate completo no interactivo pasó y la verificación estática de assets también. Los tamaños y hashes exactos están en las [notas bilingües de v0.9.4](../release-notes-v0.9.4.md). Los artefactos desktop alpha6/alpha7 están obsoletos. Las builds alpha5–alpha8 previas quedan como historial. El catálogo activo es `profiles/web/cordis.patch.yml`. KI-011, el botón de cerrar de la ventana de estado del pool, se difiere a v0.9.5. El usuario instaló v0.9.4 y confirmó que funciona.

Este repositorio es el fork público Akunimal/free-code-deepseek-harness de
deepseek-ai/deepseek-harness. El código de producto vive fuera del subtree
vendor/deepseek-harness cuando es posible; los cambios de upstream se
reproducen mediante el stack ordenado de patches.

## Baseline actual

La release publicada v0.9.4 es la baseline actual para Windows x64:

- instalador NSIS v0.9.4 (ver tamaño y hash exactos en las notas de release);
- ejecutable portable v0.9.4 (~178,4 MB; ver hash exacto en las notas),
  verificado estáticamente pero no instalado por separado;
- `latest.yml` y blockmap del setup para el updater;
- el tarball del runtime DSH Windows x64 `0.2.1-alpha.8` (~421,5 MB) y su
  checksum `.sha256` están en la release v0.9.4, separados de los instaladores.

Artefactos finales Windows x64 exactos, verificados estáticamente y sin ejecutarlos:

- Setup: 178.543.845 bytes; SHA-256 `53dfde329731d19081204a82bbbafc4678f4c81b4588a22884ef49064f400cd5`.
- Portable: 178.169.861 bytes; SHA-256 `830eba7ca48d2ee56d2272dfa1d2d23684f5cc7507db55d7617dbc6ed8cd12d3`.

Para v0.9.3 (histórica) se verificaron el preflight del shell, los gates de regresión, el
build del shell y el empaquetado setup/portable; el usuario confirmó que el setup
instalado funciona. El build compuesto completo del vendor sigue mostrando
errores preexistentes y ajenos en `packages/llm/llm`; el portable no se instaló
por separado. Windows x64 es el único target probado y soportado.
Windows ARM64, Linux y macOS NO están probados ni soportados; no se publican
artefactos para esas plataformas.

0.4.3 es una referencia histórica de recuperación, no una garantía de
compatibilidad ni la fuente de verdad del código actual. La validación de
release usa v0.9.4 y su bootstrap del runtime fijado.

El roadmap de 0.7.0 está cerrado; su ledger está en el
[ledger de 0.7.0](STATE-0.7.0.md). Los hallazgos completos de sólo lectura
están en [AUDIT-0.6.0-TEST-PLAN.md](AUDIT-0.6.0-TEST-PLAN.md).

La fuente y la release pública están alineadas en **v0.9.4**. Incluye
opencode2api v1.4.0, recuperación Tor, fondos empaquetados, Gentle AI y las
correcciones de catálogo/Tor V094-21. Las notas de v0.9.4 mantienen las builds
alpha anteriores únicamente como historia.

Los intentos alpha5–alpha8 y sus hashes se conservan como historia; usa solo
los assets adjuntos a la release pública v0.9.4.

## Build local de Windows

Ejecutá desde PowerShell en Windows x64. El gate habitual no es interactivo en
la interfaz desktop: no instala ni inicia la GUI de FreeCode. Sí inicia hijos
headless propios de prueba, el CLI DSH/Electron en modo Node y fixtures, dentro
de scratch. Valida el runtime DSH fijado que ya existe; no reconstruye ese
tarball.

```powershell
pnpm install --frozen-lockfile
pnpm package:runtime:release
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.4-final-20261016'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.4-final-20261016
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

El gate ejecuta tests, contratos, typechecks, build/preflight y un smoke MCP
offline con fixtures stdio del repositorio y un proveedor mock de loopback;
verifica in situ el SHA-256 del runtime `0.2.1-alpha.8` y compila un setup NSIS
exacto en una carpeta temporal para su validación estática. Los procesos usan
rutas scratch para perfil/caché/temporales; el smoke MCP no hereda credenciales
de la persona mantenedora ni ejecuta servidores de terceros. La limpieza apunta
sólo al árbol PID DSH propio del test y al scratch; nunca enumera ni termina
procesos ajenos. El gate nunca ejecuta `package:runtime:release`, el setup ni la
GUI de FreeCode, y no modifica accesos directos/registro del usuario activo. El
build final crea ambos targets Windows en una carpeta
versionada nueva. `verify:desktop-release-assets` valida los PE exactos de setup
y portable, el blockmap, versión/ruta/tamaño/SHA-512 de `latest.yml`, y reporta
los hashes SHA-256 de los artefactos. Este check no inicia ninguno de los
ejecutables.

Los comandos son locales y no usan GitHub Actions. Si faltan recursos
obligatorios, el gate falla en vez de saltearlos silenciosamente.

Los artefactos desktop v0.9.4 quedan en el directorio final aislado para
preservar las builds históricas:

~~~
apps/shell/release-0.9.4-final-20261016/FreeCode-DeepSeek-Harness-0.9.4-win-x64-setup.exe
apps/shell/release-0.9.4-final-20261016/FreeCode-DeepSeek-Harness-0.9.4-win-x64-setup.exe.blockmap
apps/shell/release-0.9.4-final-20261016/FreeCode-DeepSeek-Harness-0.9.4-win-x64-portable.exe
apps/shell/release-0.9.4-final-20261016/latest.yml
apps/shell/release-0.9.4-final-20261016/win-unpacked/FreeCode DeepSeek Harness.exe
~~~

Los nombres se generan desde la versión del paquete y se verifican después de
empaquetar; no copies un nombre viejo en una release nueva. `build:desktop`
rechaza reemplazar un destino no vacío salvo opt-in explícito. Nunca borres ni
sobrescribas salidas históricas a la fuerza. El smoke interactivo `smoke:nsis`
se excluye del gate regular porque modifica estado por usuario y lanza
procesos; sólo se permite dentro de una VM/cuenta Windows desechable con los
opt-ins explícitos de la [política de release](RELEASE-POLICY.es.md).

## Política de dependencias runtime

Los instaladores desktop v0.9.4 contienen Electron, el gateway opencode2api
(único gateway de modelos — freellmpool eliminado en 0.8.0), los binarios de
Tor incluidos (`tor.exe`, `geoip`, `geoip6`), archivos nativos del picker y
Tesseract. El runtime DSH se excluye intencionalmente de setup/portable y se
distribuye como asset separado. RTK, Caveman y free-search no están empaquetados:
siguen como helpers opcionales por PATH, y las entradas MCP irresolubles
arrancan deshabilitadas. El cierre instalado enumera versión, arquitectura,
origen, licencia, hash y ruta relativa en `runtime-deps.json`, verificado por
`verify-runtime-dependencies.mjs`.

En el primer inicio de v0.9.4, si no hay una caché válida por usuario, se descarga el runtime DSH alpha8
(`0.2.1-alpha.8`) Windows x64 exacto desde la release v0.9.4,
verifica el SHA-256 publicado y la ABI de Electron, y lo guarda en
`<userData>/harness-runtime`. Los inicios siguientes pueden usar esa caché
validada sin conexión. Esa descarga requiere Internet; si falla la descarga o compatibilidad, el supervisor no
debe iniciarse y se ofrecen Reintentar/Cerrar.

El runtime se publica como asset separado del instalador. Antes de guardarlo,
se verifica el digest SHA-256 de GitHub y la ABI/manifest; si falla la descarga
o compatibilidad, DSH no se inicia y se ofrecen Reintentar/Cerrar.

## Publicación sólo Windows

Ningún artefacto Linux, macOS o Windows-ARM64 es asset oficial, y ninguna
de esas plataformas fue probada por el mantenedor. Los contribuidores pueden
compilar en un host nativo, pero un binario generado fuera de su plataforma
no es evidencia de usabilidad y no debe anunciarse sin testing real en ella.
No mezcles node_modules de Windows y WSL; reinstalá dependencias para el
sistema operativo activo.

El repositorio no tiene workflow de release. Los pushes no compilan ni
publican instaladores. La publicación es manual, después del gate local no
interactivo, la verificación estática de hashes exactos, la revisión de notas
bilingües y el lock del ledger. Una prueba de instalación no es un gate
obligatorio en la workstation; si hace falta, usá sólo una VM desechable.

## Updater y actualizaciones del runtime

El updater de la aplicación no reemplaza al gate de release. Debe conservar el
control con forma de Enviar y flecha hacia abajo, chequear al iniciar y en su
intervalo programado, mostrar progreso en tray/notificación durante descarga e
instalación y respetar los datos del usuario. v0.9.4 también evita que runtimes
DSH más viejos aparezcan como actualizaciones disponibles.

El camino de actualización de upstream, sólo para el checkout fuente, es:

~~~
congelar evidencia
  -> actualizar/fetchear vendor/deepseek-harness
  -> pnpm apply:upstream-patches
  -> verificar manifest y replay
  -> test/typecheck/build/package
~~~

Ver [docs/UPSTREAM-PATCHING.md](UPSTREAM-PATCHING.md) y
[docs/RELEASE-POLICY.md](RELEASE-POLICY.md).

## Historial y enlaces de release

Los documentos viejos bajo docs/RELEASE-NOTES-v*.md describen releases
históricas y deliberadamente no se reescriben como instrucciones actuales. La
baseline publicada se sigue en
[GitHub release v0.9.4](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.4);
las notas bilingües completas están en
[release-notes-v0.9.4.md](../release-notes-v0.9.4.md).

Releases anteriores:
[GitHub release v0.9.1](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.1) —
[release-notes-v0.9.1.md](../release-notes-v0.9.1.md);
[GitHub release v0.9.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.0) —
[release-notes-v0.9.0.md](../release-notes-v0.9.0.md);
[GitHub release v0.8.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.8.0) —
[release-notes-v0.8.0.md](../release-notes-v0.8.0.md);
[GitHub release v0.7.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.7.0) —
[release-notes-v0.7.0.md](../release-notes-v0.7.0.md).

Para la guía en inglés, consultá [RELEASE.md](RELEASE.md).
