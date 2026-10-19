# Release y packaging

### Release actual: v1.0.0 (Windows x64)

FreeCode DeepSeek Harness v1.0.0 usa los modelos gratuitos de OpenCode a través del gateway opencode2api incluido, sin Tor: primero directo, y un lane de proxies de salida solo cuando OpenCode Zen bloquea la conexión. Los puertos locales ocupados se saltean, ya no aparece el pedido de API key de DeepSeek, `deepseek-v4.1-flash-free` es el predeterminado preferido, el selector muestra un spinner mientras cargan los modelos free (tarda desde unos segundos hasta unos dos minutos) y el esfuerzo de razonamiento arranca en el predeterminado de cada modelo. Se eliminaron Engram y el modo Gentle AI. Los procesos de fondo siguen usando el helper verificado `headless-host`. DSH `0.2.1-alpha.11` es una descarga separada del primer inicio, no viene en setup/portable. Ver las [notas bilingües de v1.0.0](../release-notes-v1.0.0.md).

**Estado de la release:** el setup y el portable finales de v1.0.0 para Windows x64 pasaron el gate completo sobre la fuente final, incluida la descarga pública del runtime con caché vacía; una precarga local no la reemplaza.

Se conservan opencode2api v1.4.0 (gateway v1.4.1 con parches FreeCode), correcciones de catálogo V094-21, composer V094-35, indicador de carga V094-37, 13 fondos CSS/ASCII Hermes V094-38, contexto/esfuerzo V094-39 y el catálogo activo `profiles/web/cordis.patch.yml`.

## Baseline actual

La fuente y los artefactos corresponden a v1.0.0. El runtime separado alpha.11
se publica en la pre-release [runtime-0.2.1-alpha.11](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/runtime-0.2.1-alpha.11) antes del gate
público limpio; no se reemplazan los binarios desktop ni tags anteriores. La
versión desktop anterior (v0.9.6) usaba alpha9 desde v0.9.5. Solo Windows x64 está soportado.
Los hashes nuevos se registran en las notas después de verificar los artefactos.
La salida final nueva es `apps/shell/release-1.0.0-final-20261019/`.

## Build local de Windows

Ejecutá desde PowerShell en Windows x64. El gate no instala ni inicia la GUI de
FreeCode ni ejecuta el setup final; sí inicia hijos ocultos propios de prueba, Electron-as-Node/CLI DSH, Chromium
aislado para el renderer CSS y fixtures MCP dentro de scratch. Además de validar
el runtime fijado local, prueba la descarga real desde la release pública con
perfil/caché nuevos y vacíos mediante el bootstrap/updater de producción.

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-1.0.0-final-20261019'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-1.0.0-final-20261019
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

El gate ejecuta tests, contratos, typechecks, build/preflight y un smoke MCP
offline con fixtures stdio del repositorio y un proveedor mock de loopback;
descarga el runtime público exacto `0.2.1-alpha.11` a un perfil/caché scratch
vacíos mediante el bootstrap/updater de producción, valida SHA-256, extracción,
manifest, ABI Electron e inicio oculto del CLI, y compila un setup NSIS temporal
para validación estática. Los procesos usan rutas scratch; el smoke MCP no
hereda credenciales ni ejecuta servidores de terceros. La limpieza apunta sólo
al árbol PID DSH propio y al scratch; nunca enumera ni termina procesos ajenos.
El gate no ejecuta el setup ni la GUI de FreeCode y no modifica accesos
directos/registro del usuario. El build final crea ambos targets Windows en una carpeta
versionada nueva. `verify:desktop-release-assets` valida los PE exactos de setup
y portable, el blockmap, versión/ruta/tamaño/SHA-512 de `latest.yml`, y reporta
los hashes SHA-256 de los artefactos. Este check no inicia ninguno de los
ejecutables.

Los comandos son locales y no usan GitHub Actions. Si faltan recursos
obligatorios, el gate falla en vez de saltearlos silenciosamente.

Los artefactos desktop v1.0.0 quedan en el directorio final aislado:

~~~
apps/shell/release-1.0.0-final-20261019/FreeCode-DeepSeek-Harness-1.0.0-win-x64-setup.exe
apps/shell/release-1.0.0-final-20261019/FreeCode-DeepSeek-Harness-1.0.0-win-x64-setup.exe.blockmap
apps/shell/release-1.0.0-final-20261019/FreeCode-DeepSeek-Harness-1.0.0-win-x64-portable.exe
apps/shell/release-1.0.0-final-20261019/latest.yml
apps/shell/release-1.0.0-final-20261019/win-unpacked/FreeCode DeepSeek Harness.exe
~~~

Los artefactos v0.9.4 permanecen como historial en su carpeta original:

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

Los instaladores desktop v1.0.0 contienen Electron, el gateway opencode2api
(único gateway de modelos — freellmpool eliminado en 0.8.0; sin Tor), archivos
nativos del picker y Tesseract. El runtime DSH se excluye intencionalmente de setup/portable y se
distribuye como asset separado. RTK, Caveman y free-search no están empaquetados:
siguen como helpers opcionales por PATH, y las entradas MCP irresolubles
arrancan deshabilitadas. El cierre instalado enumera versión, arquitectura,
origen, licencia, hash y ruta relativa en `runtime-deps.json`, verificado por
`verify-runtime-dependencies.mjs`.

En el primer inicio de v1.0.0, si no hay una caché válida por usuario, se descarga el runtime DSH alpha.11
(`0.2.1-alpha.11`) Windows x64 exacto desde la pre-release pública runtime-0.2.1-alpha.11,
verifica el SHA-256 publicado y la ABI de Electron, y lo guarda en
`<userData>/harness-runtime`. Los inicios siguientes pueden usar esa caché
validada sin conexión. Esa descarga requiere Internet; si falla la descarga o compatibilidad, el supervisor no
debe iniciarse y se ofrecen Reintentar/Cerrar.

El runtime se publica como asset separado del instalador. Antes de guardarlo,
se verifica el digest SHA-256 de GitHub y la ABI/manifest; si falla la descarga
o compatibilidad, DSH no se inicia y se ofrecen Reintentar/Cerrar.
Sólo un cambio intencional del runtime permite ejecutar `pnpm
package:runtime:release`; las versiones de runtime ya publicadas son inmutables.

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
instalación y respetar los datos del usuario. Nunca ofrece runtimes
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

La release actual y sus notas: [v1.0.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0),
[notas bilingües](../release-notes-v1.0.0.md). El runtime alpha.11 separado se
sirve desde la pre-release [runtime-0.2.1-alpha.11](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/runtime-0.2.1-alpha.11).
Los tags, notas y binarios desktop v0.9.6 y anteriores son historia inmutable.
Ver la [guía en inglés](RELEASE.md) y [política](RELEASE-POLICY.es.md).
