# Release y packaging

Este repositorio es el fork público Akunimal/free-code-deepseek-harness de
deepseek-ai/deepseek-harness. El código de producto vive fuera del subtree
vendor/deepseek-harness cuando es posible; los cambios de upstream se
reproducen mediante el stack ordenado de patches.

## Baseline actual

La release publicada v0.9.2 es la baseline actual para Windows x64:

Candidato de código: v0.9.3 (sin publicar). No se generaron setup/portable,
instalación, tag ni release; los artefactos y la evidencia de instalación de
abajo siguen describiendo la v0.9.2 publicada.

- instalador NSIS de Windows v0.9.2 (~178,5 MB);
- ejecutable portable de Windows v0.9.2 (~178,2 MB);
- `latest.yml` más blockmap para el updater;
- tarball del runtime DSH Windows x64 `0.2.1-alpha.2` (~421,6 MB) y su
  archivo `.sha256`, distribuidos separados de los instaladores desktop.

Para v0.9.2 se verificaron la suite Vitest del shell, el typecheck del shell y
el empaquetado desktop; después se confirmó que la release instalada funciona
en Windows x64. Windows x64 es el único target probado y soportado.
Windows ARM64, Linux y macOS NO están probados ni soportados; no se publican
artefactos para esas plataformas.

0.4.3 es una referencia histórica de recuperación, no una garantía de
compatibilidad ni la fuente de verdad del código actual. La validación de
release usa la instalación v0.9.2 y su bootstrap del runtime fijado.

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

Los artefactos Windows esperados de v0.9.2 son:

~~~
apps/shell/release/FreeCode-DeepSeek-Harness-0.9.2-win-x64-setup.exe
apps/shell/release/FreeCode-DeepSeek-Harness-0.9.2-win-x64-portable.exe
apps/shell/release/FreeCode-DeepSeek-Harness-0.9.2-win-x64-setup.exe.blockmap
apps/shell/release/latest.yml
apps/shell/release/deepseek-harness-runtime-0.2.1-alpha.2-win32-x64.tar.gz
apps/shell/release/deepseek-harness-runtime-0.2.1-alpha.2-win32-x64.tar.gz.sha256
apps/shell/release/win-unpacked/FreeCode DeepSeek Harness.exe
~~~

Los nombres se generan desde la versión del paquete y se verifican después
de empaquetar; no copies un nombre viejo en una release nueva. Si
`release/win-unpacked` está lockeado por una instancia en ejecución (el caso
`Device or resource busy` visto en 0.9.0), empaquetá en un directorio de
salida nuevo y copiá setup/portable/blockmap/`latest.yml` a `release/` en vez
de forzar el borrado del árbol lockeado.

## Política de dependencias runtime

Los instaladores desktop v0.9.2 contienen Electron, el gateway opencode2api
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
instalación y respetar los datos del usuario. v0.9.2 también evita que runtimes
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
[GitHub release v0.9.2](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.9.2);
las notas bilingües completas están en
[release-notes-v0.9.2.md](../release-notes-v0.9.2.md).

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
