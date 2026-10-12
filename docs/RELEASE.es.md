# Release y packaging

Este repositorio es el fork público Akunimal/free-code-deepseek-harness de
deepseek-ai/deepseek-harness. El código de producto vive fuera del subtree
vendor/deepseek-harness cuando es posible; los cambios de upstream se
reproducen mediante el stack ordenado de patches.

## Baseline actual

La release publicada v0.9.3 es la baseline actual para Windows x64:

- instalador NSIS v0.9.3 (~178,5 MB), instalado y confirmado funcionando por
  el usuario;
- ejecutable portable v0.9.3 (~651 MB / 620,8 MiB), compilado pero no probado
  con una instalación por separado;
- `latest.yml` y blockmap del setup para el updater;
- el tarball del runtime DSH Windows x64 `0.2.1-alpha.2` (~421,6 MB) y su
  `.sha256` siguen en la release v0.9.2, separados de los instaladores desktop.

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

## Build local de Windows

Ejecutá desde PowerShell en Windows x64:

~~~
pnpm install --frozen-lockfile
pnpm apply:upstream-patches
pnpm test
pnpm typecheck
pnpm build:vendor
pnpm build:shell
pnpm --filter @freecode/shell package:runtime
pnpm --filter @freecode/shell package
pnpm --filter @freecode/shell smoke:nsis
~~~

Estos comandos son locales y no usan GitHub Actions. Los recursos
obligatorios hacen fallar el gate cuando faltan; nunca se saltean
silenciosamente porque la máquina del desarrollador no tenga un fixture.

Los artefactos desktop v0.9.3 se compilaron en el directorio local aislado
para preservar los archivos históricos v0.9.2:

~~~
apps/shell/release-0.9.3-local/FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe
apps/shell/release-0.9.3-local/FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe.blockmap
apps/shell/release-0.9.3-local/FreeCode-DeepSeek-Harness-0.9.3-win-x64-portable.exe
apps/shell/release-0.9.3-local/latest.yml
apps/shell/release-0.9.3-local/win-unpacked/FreeCode DeepSeek Harness.exe
~~~

Los nombres se generan desde la versión del paquete y se verifican después
de empaquetar; no copies un nombre viejo en una release nueva. Si
`release/win-unpacked` está lockeado por una instancia en ejecución (el caso
`Device or resource busy` visto en 0.9.0), empaquetá en un directorio de
salida nuevo y copiá setup/portable/blockmap/`latest.yml` a `release/` en vez
de forzar el borrado del árbol lockeado.

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
publican instaladores. La publicación es manual, después del gate local, la
revisión de checksums, la instalación limpia NSIS/portable y el lock del
ledger.

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
