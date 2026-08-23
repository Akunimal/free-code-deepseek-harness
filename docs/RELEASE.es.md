# Release y packaging

Este repositorio es el fork público `Akunimal/free-code-deepseek-harness` de
`deepseek-ai/deepseek-harness`. La rama de producto en este checkout es `main`;
el subtree `vendor/deepseek-harness` conserva la referencia del upstream.
El tag de release es el límite previsto de versionado para la GUI de escritorio
y el harness web completo. El código conserva configuración de packaging
multiplataforma, pero la release publicada `v0.2.2` contiene sólo artefactos
Windows x64; macOS y Linux no están incluidos ni declarados como probados en
esa release.

Las releases se realizan manualmente. Los pushes a ramas no publican
instaladores y este repositorio no tiene workflow de GitHub Actions para
releases.

## Build local

```bash
pnpm install
pnpm test
pnpm test:contract
pnpm build:desktop
```

`build:desktop` compila el shell, ejecuta `scripts/package-runtime.sh` e invoca
electron-builder. El script de runtime compila las librerías y la web upstream,
copia un stage limpio, elimina sólo el `postinstall` de desarrollo del upstream,
instala el workspace completo, verifica `apps/cli/lib/bin.js` y el link de
Cordis, y copia el stage a los recursos ignorados del packaging.

El target Windows genera `FreeCode-DeepSeek-Harness-<version>-win-x64-setup.exe`
(NSIS) y `FreeCode-DeepSeek-Harness-<version>-win-x64-portable.exe`. El portable
no tiene paso de instalación y guarda su directorio `data/` junto al ejecutable.
El runtime empaquetado es autocontenido: después de descargar un artefacto, el
usuario no necesita Node, pnpm, Git, Go ni Python. Los demás targets de plataforma
quedan como configuración de código fuente hasta que una release futura los
incluya y pruebe explícitamente.

RTK sigue siendo una optimización opcional del entorno del usuario. El shell
expone su configuración para Bash y Windows PowerShell, pero el paquete de
escritorio no incluye, descarga ni instala el [ejecutable de RTK](https://github.com/rtk-ai/rtk).
Cuando el toggle está habilitado y RTK ya está en `PATH`, sólo se envuelven
comandos CLI simples elegibles para reducir la salida que recibe el modelo; la
sintaxis de shell compuesta queda intacta y la ausencia del ejecutable no cambia
el comportamiento original.

FreeCode consulta automáticamente la release de GitHub del fork, el asset
compatible del Harness y el commit upstream registrado en `runtime-manifest.json`.
Cuando hay una actualización compatible, la flecha de descarga junto a
Configuración abre el flujo de confirmación; la descarga valida, detiene y
reinicia sólo `dsh` para una actualización del Harness y reemplaza atómicamente
`resources/freecode/dsh`; el shell, el pool
`opencode2api`, Tor y los datos del usuario no se reemplazan. La actualización de
la aplicación completa sigue siendo una ruta separada de `electron-updater` y no
se usa para publicar releases. Desde un checkout se puede ejecutar además
`node scripts/update-upstream-local.mjs`, que actualiza el subtree upstream y
reconstruye sólo `package:runtime`; la app portable nunca intenta compilar sin
toolchain.

El package local también genera un asset exclusivo del Harness junto a los
instaladores:

```text
apps/shell/release/deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz
apps/shell/release/deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz.sha256
```

Los tarballs por plataforma y sus digests SHA-256 se adjuntan manualmente a la
release del fork cuando corresponde. Este camino no usa GitHub Actions ni consume
cuota de workflows.

En el checkout Windows actual, las rutas de prueba son:

```text
I:\DeepSeek-Harness\free-code-deepseek-harness\apps\shell\release\FreeCode-DeepSeek-Harness-0.2.2-win-x64-portable.exe
I:\DeepSeek-Harness\free-code-deepseek-harness\apps\shell\release\FreeCode-DeepSeek-Harness-0.2.2-win-x64-setup.exe
I:\DeepSeek-Harness\free-code-deepseek-harness\apps\shell\release\win-unpacked\FreeCode DeepSeek Harness.exe
```

## Publicación manual

Seguí [RELEASE-POLICY.md](RELEASE-POLICY.md) para ejecutar el preflight local,
revisar los artefactos y subirlos manualmente. No se agrega un workflow de
release para no consumir cuota de GitHub Actions.

El owner/repo de GitHub es `Akunimal/free-code-deepseek-harness`.

## Versionado y estado de v0.2.2

La release actual es `v0.2.2`. Sus artefactos Windows setup/portable, blockmap,
`latest.yml`, tarball del runtime del Harness y digest SHA-256 se compilaron y
subieron manualmente después del preflight local. La captura actual del README
forma parte de los assets del repositorio. La release se seguirá en
[GitHub v0.2.2](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.2.2).

Antes de una release futura hay que verificar el preflight local completo:
arranque zero-config, descubrimiento de modelos, registro del provider, streaming
de mensajes, reinicio de workers, tray/overlay, importación/continuación,
ciclo de vida del workspace, actualización del runtime, ejecución headless de
tools y la capa de movimiento de conversación.
