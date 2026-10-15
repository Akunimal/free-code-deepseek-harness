# Release y packaging

### Candidata actual 0.9.4 (alpha6)

v0.9.4 no está publicado; v0.9.3 sigue como baseline publicada.

La nueva candidata apunta a `apps/shell/release-0.9.4-alpha6-20261015/`, con
DSH `0.2.1-alpha.6` y opencode2api v1.4.0. Los builds alpha5 anteriores quedan
obsoletos: el usuario reportó un solo modelo y errores de conexión/protocolo.
Ahora el catálogo/puerto se sincroniza con `profiles/web/cordis.patch.yml` y HMR
del Host real, no con settings legado importado una sola vez. La inferencia
pública usa el namespace OpenAI/Anthropic documentado. Los patrones MIT Hermes
Phoenix reales funcionan a 18 pasos/s en reposo y 72 trabajando, con movimiento
reducido, pausa al ocultar, resize y limpieza comprobados. Pasan ambos programas
de tipado estricto, 346/346 pruebas shell y 114 contratos con 12 skips previstos.
La respuesta pública real sigue sin verificarse: Windows bloqueó antes de HTTP
las dos conexiones autorizadas y no se repitieron. Build runtime, evidencia
visual del stage exacto y gate final de empaquetado están en curso. No equivale
a publicación ni aceptación de instalación. La prueba local sin publicar tendrá
el archivo runtime exacto y `Prepare-Local-Runtime.ps1`: por defecto CHECK ONLY;
la precarga exige confirmación explícita de app cerrada y conserva backups.
Nunca ejecuta setup ni FreeCode. No se autorizó tag, subida ni tocar caché o
procesos activos. Se conservan los fixes históricos V094-21.


Este repositorio es el fork público Akunimal/free-code-deepseek-harness de
deepseek-ai/deepseek-harness. El código de producto vive fuera del subtree
vendor/deepseek-harness cuando es posible; los cambios de upstream se
reproducen mediante el stack ordenado de patches.

## Baseline actual

La release publicada v0.9.3 es la baseline actual para Windows x64:

- instalador NSIS v0.9.3 (~178,5 MB), instalado y confirmado funcionando por
  el usuario;
- ejecutable portable v0.9.3 (~178,2 MB / 169,9 MiB), compilado pero no probado
  con una instalación por separado;
- `latest.yml` y blockmap del setup para el updater;
- el tarball del runtime DSH Windows x64 `0.2.1-alpha.2` (~421,6 MB) y su
  `.sha256` siguen en la release v0.9.2, separados de los instaladores desktop.

Artefactos finales Windows x64 exactos, verificados estáticamente y sin ejecutarlos:

- Setup: 178.543.845 bytes; SHA-256 `53dfde329731d19081204a82bbbafc4678f4c81b4588a22884ef49064f400cd5`.
- Portable: 178.169.861 bytes; SHA-256 `830eba7ca48d2ee56d2272dfa1d2d23684f5cc7507db55d7617dbc6ed8cd12d3`.

Para v0.9.3 se verificaron el preflight del shell, los gates de regresión, el
build del shell y el empaquetado setup/portable; el usuario confirmó que el setup
instalado funciona. El build compuesto completo del vendor sigue mostrando
errores preexistentes y ajenos en `packages/llm/llm`; el portable no se instaló
por separado. Windows x64 es el único target probado y soportado.
Windows ARM64, Linux y macOS NO están probados ni soportados; no se publican
artefactos para esas plataformas.

0.4.3 es una referencia histórica de recuperación, no una garantía de
compatibilidad ni la fuente de verdad del código actual. La validación de
release usa la instalación v0.9.3 y su bootstrap del runtime fijado.

El roadmap de 0.7.0 está cerrado; su ledger está en el
[ledger de 0.7.0](STATE-0.7.0.md). Los hallazgos completos de sólo lectura
están en [AUDIT-0.6.0-TEST-PLAN.md](AUDIT-0.6.0-TEST-PLAN.md).

El árbol de código actual es candidato: **v0.9.4 sigue sin publicarse**; v0.9.3
es la última release publicada para Windows x64. Esta candidata incluye
opencode2api v1.4.0, recuperación Tor, fondos empaquetados, Gentle AI y las
correcciones de catálogo/Tor V094-21. Ver
[release-notes-v0.9.4.md](../release-notes-v0.9.4.md).

Los intentos alpha5 anteriores y sus hashes se conservan como historia en
las notas candidatas; no deben instalarse ni publicarse como esta candidata.

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
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.4-alpha6-20261015'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.4-alpha6-20261015
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

El gate ejecuta tests, contratos, typechecks, build/preflight y un smoke MCP
offline con fixtures stdio del repositorio y un proveedor mock de loopback;
verifica in situ el SHA-256 del runtime `0.2.1-alpha.5` y compila un setup NSIS
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

Los artefactos desktop v0.9.3 quedan en el directorio final aislado para
preservar los archivos históricos v0.9.2:

~~~
apps/shell/release-0.9.3-final/FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe
apps/shell/release-0.9.3-final/FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe.blockmap
apps/shell/release-0.9.3-final/FreeCode-DeepSeek-Harness-0.9.3-win-x64-portable.exe
apps/shell/release-0.9.3-final/latest.yml
apps/shell/release-0.9.3-final/win-unpacked/FreeCode DeepSeek Harness.exe
~~~

Los nombres se generan desde la versión del paquete y se verifican después de
empaquetar; no copies un nombre viejo en una release nueva. `build:desktop`
rechaza reemplazar un destino no vacío salvo opt-in explícito. Nunca borres ni
sobrescribas salidas históricas a la fuerza. El smoke interactivo `smoke:nsis`
se excluye del gate regular porque modifica estado por usuario y lanza
procesos; sólo se permite dentro de una VM/cuenta Windows desechable con los
opt-ins explícitos de la [política de release](RELEASE-POLICY.es.md).

## Política de dependencias runtime

Los instaladores desktop v0.9.3 contienen Electron, el gateway opencode2api
(único gateway de modelos — freellmpool eliminado en 0.8.0), los binarios de
Tor incluidos (`tor.exe`, `geoip`, `geoip6`), archivos nativos del picker y
Tesseract. El runtime DSH se excluye intencionalmente de setup/portable y se
distribuye como asset separado. RTK, Caveman y free-search no están empaquetados:
siguen como helpers opcionales por PATH, y las entradas MCP irresolubles
arrancan deshabilitadas. El cierre instalado enumera versión, arquitectura,
origen, licencia, hash y ruta relativa en `runtime-deps.json`, verificado por
`verify-runtime-dependencies.mjs`.

En cualquier inicio sin caché válida por usuario, la app descarga el runtime
DSH Windows x64 exacto fijado en `0.2.1-alpha.2` desde la release v0.9.2,
verifica el SHA-256 publicado y la ABI de Electron, y lo guarda en
`<userData>/harness-runtime`. Los inicios siguientes pueden usar esa caché
validada sin conexión. Esa descarga requiere Internet; si falla la descarga o compatibilidad, el supervisor no
debe iniciarse y se ofrecen Reintentar/Cerrar.

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
instalación y respetar los datos del usuario. v0.9.3 también evita que runtimes
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
[GitHub release v0.9.3](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.3);
las notas bilingües completas están en
[release-notes-v0.9.3.md](../release-notes-v0.9.3.md).

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
