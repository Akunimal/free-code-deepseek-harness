# Política de releases

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


Las releases son manuales y tienen como target Windows x64. Esta política
describe el límite real entre la app desktop y el runtime para v0.9.3; no
autoriza a tocar una instancia de FreeCode que esté en ejecución.

La versión actual de la fuente es candidata v0.9.4. La candidata alpha5 pasó su
gate anterior, pero después se agregaron las correcciones de modelos/Tor V094-21;
ese gate y sus artefactos desktop ya no son actuales. Las pruebas focalizadas
shell, typecheck y Go pasan; la última suite shell completa tuvo dos timeouts,
pero ambas pruebas pasaron luego aisladas (Tor 1/1; supervisor DSH 5/5, readiness
real del CLI en 80,10 s). Hace falta repetir el gate y compilar setup/
portable antes de publicar. El usuario probó la alpha5 instalada e informa que
solo aparece un modelo y hay fallos de upstream/API key, conexión y protocolo.
Los artefactos y hashes v0.9.3 que siguen abajo son
evidencia histórica de la release publicada y no deben sobrescribirse.

## Contenido de la release y runtime fijado

El candidato v0.9.4 cambia los fondos de DSH y prioriza el navegador en el prompt.
Fija `0.2.1-alpha.6` en `apps/shell/harness-runtime.json`. El runtime se regeneró
antes de empaquetar; el gate de stage rechaza stages obsoletos
alpha2/alpha3/alpha4. Los archivos runtime existentes son inmutables. El tarball
alpha5 ya se generó localmente y se verificó:
`apps/shell/release/deepseek-harness-runtime-0.2.1-alpha.5-win32-x64.tar.gz`
(421.377.684 bytes; SHA-256
`26953ba93ab1daab8d837c2980f1f5f9c0a60f65677ac48fc973300f5b2229f2`). No está
publicado. El setup/portable anteriores se generaron y verificaron estáticamente,
pero son previos a V094-21 y quedaron obsoletos. La caché local alpha4 no satisface
el nuevo pin. Nunca
presentes un archivo no subido como asset descargable de release. Se retiró
OmniRoute: sin fallback, descarga, servidor ni detector. El próximo inicio
elimina solo config antigua propia y cachés verificadas; conserva proveedores e
historial ajenos.

La nueva salida pendiente usa el directorio único
`apps/shell/release-0.9.4-alpha6-20261015/`; no reutilices ni
sobrescribas el directorio obsoleto de la candidata alpha5.

Tras cambiar opencode2api o su overlay activo, recompilá con
`bash scripts/build-opencode2api.sh`. También prepara el nuevo sidecar Windows
sin regenerar DSH. El preflight rechaza receipts ausentes, fuentes cambiadas
o bytes de un binario viejo; nunca prepara silenciosamente una build antigua
sin verificar. El empaquetado actualiza los pins de versión/hash solo para
opencode2api y DSH compilados localmente; acepta herramientas opcionales por
PATH ausentes, pero exige assets requeridos presentes y con hashes válidos.

Antes de electron-builder, el gate revisa el CSS DSH real después de materializar
el runtime y copiarlo a resources/freecode/dsh. También renderiza esas reglas
emitidas con Chrome/Edge headless aislado desde una data URL y muestrea ambos
transforms en fotogramas separados: cada capa debe moverse al menos 8 píxeles CSS
en 1,65 segundos. Con movimiento reducido, las animaciones se detienen sin
oscurecer ninguno de los dos lavados. Si Chrome/Edge no está en una ruta habitual
de Windows, configurá FREECODE_CHROME_PATH. La prueba usa un perfil temporal
separado; no inicia FreeCode ni reutiliza el perfil del navegador personal.

El smoke runtime de NSIS debe aislar APPDATA, LOCALAPPDATA, USERPROFILE, HOME y
las rutas temporales: `--user-data-dir` de Chromium no redirige por sí solo
`app.getPath('userData')` de Electron. Sin un perfil privado, el smoke puede
dejar el torrc apuntando a recursos dentro de su instalación temporal eliminada.

La release desktop v0.9.3 contiene el setup NSIS, el ejecutable portable, el
blockmap del setup y `latest.yml`. El runtime DSH separado tiene versión
independiente: v0.9.3 reutiliza exactamente el runtime Windows x64
`0.2.1-alpha.2`, publicado con v0.9.2. El gate verifica el SHA-256 local y el
manifest empaquetado; nunca vuelve a generar, elimina ni reemplaza ese tarball.
El packaging desktop habitual tampoco ejecuta `package:runtime`.

Sólo un cambio intencional del runtime DSH puede subir su versión en el manifest
y ejecutar `pnpm package:runtime:release`. Una versión publicada es inmutable:
publicá una versión nueva y su checksum en lugar de sobrescribir un asset
existente.

## Checks no interactivos en la workstation

En Windows x64, ejecutá el gate requerido, compilá los artefactos en una carpeta
nueva y aislada, y verificá exactamente esa carpeta:

```powershell
pnpm install --frozen-lockfile
pnpm release:gate
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.4-alpha6-20261015'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.4-alpha6-20261015
Remove-Item Env:FREECODE_RELEASE_OUTPUT
```

Los workspaces de tests se ejecutan en serie para que los arranques en frío
del CLI DSH no compitan por la inicialización del sistema de archivos. No se
amplían los timeouts ni se debilitan las aserciones; la creación del archivo
runtime y las copias grandes deben terminar antes del gate.

`release:gate` ejecuta los tests/contratos/typechecks del workspace, build y
preflight, un smoke de integración MCP offline basado únicamente en fixtures
stdio del repositorio y un proveedor mock de loopback, verifica el asset runtime
fijado y compila un setup NSIS en una carpeta temporal del sistema operativo.
El gate no es literalmente libre de procesos: sí inicia hijos headless propios
de prueba, el CLI DSH/Electron en modo Node, Chromium aislado para renderizar el
CSS y los fixtures MCP. El smoke usa sólo
fixtures del repo, un endpoint loopback y HOME/perfil/caché/temporales dentro de
scratch; no descarga ni ejecuta paquetes MCP de terceros ni hereda credenciales
de la persona mantenedora. La limpieza apunta únicamente al árbol PID DSH
registrado por el smoke y a sus rutas scratch únicas; no enumera ni termina
procesos ajenos. El gate valida estáticamente el PE, `latest.yml`, SHA-512,
blockmap y manifest runtime de ese paquete exacto. **No reconstruye el runtime
DSH. Aun con esos hijos de prueba, no instala ni inicia la GUI de FreeCode** ni
toca la app activa, sus accesos directos o el registro del usuario.

`verify:desktop-release-assets` es un check estático: valida los PE exactos del
setup y portable, el blockmap y los metadatos del updater, y reporta hashes
SHA-256. No inicia ninguno de los ejecutables. `build:desktop` rechaza una
carpeta de salida no vacía, salvo que se habilite explícitamente el reemplazo;
conservá intactas las carpetas anteriores e históricas.

El usuario confirmó que la instalación NSIS v0.9.3 funciona en Windows x64. El
portable se compiló y validó estáticamente, pero no se probó instalándolo por
separado. No presentes un check estático como si fuera una prueba de instalación.

## Smoke interactivo opcional del instalador

`pnpm --filter @freecode/shell smoke:nsis` instala, inicia y desinstala una copia
de la app. NSIS puede modificar accesos directos y registro por usuario; el
inicio crea procesos y ventanas. Por eso este smoke **no** forma parte de
`release:gate` y nunca debe ejecutarse en una workstation mantenedora ni junto a
una instancia activa. Usá solamente una VM/cuenta Windows desechable e indicá el
setup exacto:

```powershell
$env:FREECODE_ALLOW_INTERACTIVE_NSIS_SMOKE = '1'
$env:FREECODE_NSIS_SMOKE_ENV = 'disposable-vm'
$env:FREECODE_NSIS_SETUP_PATH = 'C:\path\to\exact\FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe'
pnpm --filter @freecode/shell smoke:nsis
```

El smoke se niega a continuar sin las dos confirmaciones de entorno desechable
y una ruta exacta cuyo setup coincida con la versión. No configures esas
variables en una workstation común. Preservá los datos del usuario y nunca
termines procesos ajenos.

## Publicación manual

Después de que pasen el gate local y la verificación de artefactos, revisá las
notas bilingües y los hashes registrados; luego publicá sólo en el fork
autorizado. El repositorio no tiene workflow de release: no agregues uno ni
consumas la cuota de GitHub Actions. Mantené alineadas las notas en inglés y
español. Linux, macOS y Windows ARM64 no son targets de release probados.

La integración opcional RTK sigue siendo instalada por el usuario y no es una
dependencia incluida; la app debe funcionar aunque `rtk` no esté instalado.

La interoperabilidad con servidores MCP externos no forma parte del gate de la
workstation: los paquetes de terceros pueden ejecutar código arbitrario y
requieren red. Probá esos servidores sólo en un entorno expresamente desechable,
con credenciales de prueba y datos temporales; no les pases el perfil, las cachés,
los tokens ni el entorno de la persona mantenedora.

Ver [la política en inglés](RELEASE-POLICY.md) para el procedimiento equivalente.
