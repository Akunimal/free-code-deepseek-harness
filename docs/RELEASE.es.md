# Release y packaging

Este repositorio es el fork público Akunimal/free-code-deepseek-harness de
deepseek-ai/deepseek-harness. El código de producto vive fuera del subtree
vendor/deepseek-harness cuando es posible; los cambios de upstream se
reproducen mediante el stack ordenado de patches.

## Baseline actual

La release publicada 0.7.0 es la baseline actual para Windows x64:

- instalador NSIS de Windows 0.7.0 (~300 MB);
- ejecutable portable de Windows 0.7.0 (~300 MB);
- `latest.yml` más blockmap para el updater;
- tarball del runtime del Harness (+`.sha256`) para updates in-app.

El gate de 0.7.0 pasó: typecheck limpio, suite del shell 165/165, todos los
verificadores prepackage en verde, instalación limpia, `harness ready`, los
dos lanes con modelos, apagado limpio. Probado en Windows 10/11 x64
ÚNICAMENTE. Windows ARM64, Linux y macOS NO están probados ni soportados;
no se publican artefactos para esas plataformas.

0.4.3 es la última referencia operativa porque abre bien. No es una garantía
de compatibilidad ni la fuente de verdad del código actual. El gate de 0.7.0
no exige actualizar desde 0.4.3; exige instalar limpio, abrir, seleccionar un
proyecto y relanzar.

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

Los artefactos Windows esperados de 0.7.0 son:

~~~
apps/shell/release/FreeCode-DeepSeek-Harness-0.7.0-win-x64-setup.exe
apps/shell/release/FreeCode-DeepSeek-Harness-0.7.0-win-x64-portable.exe
apps/shell/release/FreeCode-DeepSeek-Harness-0.7.0-win-x64-setup.exe.blockmap
apps/shell/release/latest.yml
apps/shell/release/deepseek-harness-runtime-0.1.3-alpha.1-win32-x64.tar.gz
apps/shell/release/win-unpacked/FreeCode DeepSeek Harness.exe
~~~

Los nombres se generan desde la versión del paquete y se verifican después
de empaquetar; no copies un nombre viejo en una release nueva.

## Política de dependencias runtime

El instalador 0.7.0 contiene Electron, el runtime del Harness, el gateway
opencode2api, archivos nativos del picker/runtime y Tesseract. RTK, Caveman
y free-search no están empaquetados: siguen como helpers opcionales por
PATH, y las entradas MCP irresolubles arrancan deshabilitadas. El cierre
instalado enumera versión, arquitectura, origen, licencia, hash y ruta
relativa en `runtime-deps.json`, verificado por
`verify-runtime-dependencies.mjs`.

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
instalación y respetar los datos del usuario. 0.7.0 no exige actualizar desde
0.4.3.

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
[GitHub release 0.7.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/0.7.0);
las notas bilingües completas están en
[release-notes-v0.7.0.md](../release-notes-v0.7.0.md).

For the English guide, see [RELEASE.md](RELEASE.md).
