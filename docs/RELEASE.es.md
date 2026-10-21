# Release y packaging

### Candidata de fuente actual: v1.0.1 (Windows x64)

v1.0.1 reemplaza el gateway activo OpenCode2API por Phoenix FreeLLMpool 0.13.0,
fijado y empaquetado como ejecutable Windows x64. Phoenix incluye licencia MIT,
allowlist de modelos y receipt de fuente/build; antes del inicio se verifican
hash, procedencia y arquitectura. No requiere `C:\LocalAI`, Python local, otra
instalación de FreeLLMpool ni un servicio/puerto preexistente. Auto Phoenix
aparece primero. Un modelo concreto queda fijado estrictamente; solo Auto puede
probar otra ruta gratuita elegible antes del primer byte del stream.

**Estado de release:** v1.0.1 es una candidata local de fuente, todavía no
publicada. Setup y portable no se compilaron ni instalaron, y falta correr el
gate completo. La última release desktop publicada es la histórica
[v1.0.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0).
No presentes la candidata como instalable ni como instalación limpia probada.
Notas candidatas: [v1.0.1 bilingües](../release-notes-v1.0.1.md).

## Baseline actual

La fuente está en versión 1.0.1. El runtime DSH continúa como asset inmutable
separado `0.2.1-alpha.11` para Windows x64 (ABI 149), que se descarga en el
primer inicio cuando no hay caché por usuario válida. Su smoke público con
caché vacía sigue siendo obligatorio. Phoenix sí viene en el payload desktop
y se verifica localmente por hash/receipt; no se descarga aparte en el primer
inicio. Cuando se compile, la salida aislada será
`apps/shell/release-1.0.1-candidate/`. Todavía no existen tamaños ni hashes de
setup/portable v1.0.1. Los artefactos, tags y carpetas anteriores son historia
inmutable y no deben sobrescribirse.

## Build local de Windows

Ejecutá solo en Windows x64. El gate obligatorio `pnpm release:gate` **no instala ni inicia la GUI de FreeCode**.
Sí crea hijos headless/ocultos propios del test
(CLI DSH, Electron-as-Node, fixtures), Chromium aislado y el helper exacto
`freecode-launcher` + `headless-host` preparado/empaquetado, todos en scratch.
Comprueba el payload Phoenix fijado,
compila y verifica el paquete desktop, y prueba una descarga real de DSH desde
un perfil/caché vacíos mediante el bootstrap/updater de producción. Ese smoke
valida el SHA-256 público de GitHub, extracción, manifest, ABI de Electron
empaquetada e inicio oculto del CLI. No reconstruye el archivo DSH inmutable.
Si falla red/asset público, checksum, layout, ABI o arranque, se bloquea la
publicación.

Cuando pase el gate, compilá en una carpeta nueva y verificá esos artefactos
exactos:

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-1.0.1-candidate'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-1.0.1-candidate
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

`verify:desktop-release-assets` comprueba los PE de setup/portable, blockmap,
versión/ruta/tamaño/SHA-512 de `latest.yml` y hashes SHA-256. No ejecuta
ninguno. `build:desktop` no reemplaza una carpeta de salida no vacía salvo que
se habilite explícitamente. Conservá todos los artefactos anteriores e
históricos.

La carpeta candidata todavía no existe. No inventes nombres ni hashes:
registralos en las notas bilingües solo tras compilar y verificar los artefactos
exactos.

## Política de dependencias runtime

El payload desktop v1.0.1 incluye Phoenix, Electron, archivos nativos del picker
y Tesseract. `apps/shell/resources/runtime-deps.json` registra versiones,
arquitectura, origen, licencia, SHA-256, argumentos de inicio y rutas relativas.
`freellmpool-staging.mjs` verifica el pin inmutable de fuente/toolchain, receipt
de build y bytes stageados exactos antes de empaquetar. No queda activo ni se
empaqueta binario, adaptador, source o pipeline de OpenCode2API.

El runtime DSH se excluye de setup/portable y solo se obtiene por separado al
primer inicio. Usa el asset público `runtime-0.2.1-alpha.11` y su SHA-256; los
inicios posteriores reutilizan la caché por usuario validada. Si falta el
runtime, no es válido o falla la descarga inicial, DSH debe permanecer detenido
y ofrecer Reintentar/Cerrar. El packaging desktop habitual no reconstruye el
runtime. Ejecutá `pnpm package:runtime:release` solo si cambia intencionalmente
su versión; las versiones publicadas son inmutables.

RTK, Caveman y free-search siguen como herramientas opcionales por PATH, no
forman parte del runtime de proveedores Phoenix. Si falta una herramienta MCP
opcional, arranca deshabilitada y no bloquea FreeCode.

## Publicación solo Windows

Windows x64 es el único target de release soportado. Linux, macOS y Windows
ARM64 no son artefactos oficiales ni deben declararse utilizables sin pruebas
nativas. No mezcles `node_modules` de Windows y WSL.

No hay workflow de release en GitHub. Los pushes no compilan ni publican
instaladores. Publicar es una acción manual separada que requiere pasar el gate,
verificar los artefactos exactos, revisar las notas bilingües y tener
autorización explícita. El smoke interactivo de instalación no forma parte del
gate normal: instalar/iniciar/desinstalar solo se valida en una VM/cuenta
Windows expresamente desechable.

## Updater y cambios de upstream

El updater no reemplaza el gate. Conserva el botón circular de Enviar con flecha
hacia abajo, revisa al inicio y en su intervalo, muestra progreso en tray y
notificación, y preserva los datos del usuario. Nunca ofrece un runtime DSH más
viejo como actualización.

El flujo de upstream, solo para el checkout fuente, es:

```text
congelar evidencia
  -> actualizar/fetchear vendor/deepseek-harness
  -> pnpm apply:upstream-patches
  -> verificar manifest y replay
  -> test/typecheck/build/package
```

Ver [política de release](RELEASE-POLICY.es.md),
[contención headless](HEADLESS-DESKTOP.md) y
[parches de upstream](UPSTREAM-PATCHING.md).

## Historial de versiones

La [release publicada v1.0.0](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v1.0.0)
y sus [notas](../release-notes-v1.0.0.md) son historia. v1.0.1 sigue sin
publicarse hasta que pasen todos los gates obligatorios y el usuario autorice
la publicación. Ver la [guía en inglés](RELEASE.md) y la [política](RELEASE-POLICY.es.md).
