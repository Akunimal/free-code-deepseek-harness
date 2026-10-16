# Política de releases

### Release actual: v0.9.6 (Windows x64)

Las releases son manuales y tienen como target Windows x64. Esta política
nunca autoriza tocar la instancia activa de FreeCode.

**Estado candidato:** v0.9.6 aún no está publicada. Faltan la prueba pública de caché vacía y la verificación final de setup/portable; una precarga local no las reemplaza.

## Prueba obligatoria de instalación limpia

Antes de declarar lista o publicar cualquier release que descargue runtime,
`pnpm release:gate` debe pasar `first-run-runtime-download`. No es una descarga
simulada ni un cache-hit: crea un perfil aislado nuevo y una caché runtime vacía,
usa el bootstrap/updater de producción y la ABI de Electron empaquetada, obtiene
el asset runtime público exacto de GitHub, verifica SHA-256, estructura extraída,
manifest y ABI, y luego inicia el CLI DSH descargado en modo oculto con `--help`.
Si falta Internet, asset público, digest o cualquier validación/inicio, la release
queda bloqueada. Checks estáticos, mocks, una caché precargada o el código de
salida del setup no lo reemplazan. El smoke solo usa su perfil/caché temporal y
su hijo CLI oculto; no instala ni inicia FreeCode ni inspecciona, detiene o reinicia
procesos ajenos.

## Contención Windows y runtime

v0.9.6 exige `headless-host` GUI, escritorio privado y Job asignado con el
destino suspendido, sin fallback directo. Las acciones GUI explícitas usan el
broker autenticado. Las pruebas nativas adversarias de ventanas/descendientes
y cierre del Job corren contra el helper exacto preparado y empaquetado;
los strings de fuente no bastan. Ver [contención y límites](HEADLESS-DESKTOP.md).

El pin actual es `0.2.1-alpha.9` (ABI 149), 421.541.194 bytes, SHA-256
`7c1d8cb1b53e2a88a7549941afacf423a1345353b9c3aa6fd53d95d3f49c4ca5`.
Se agrega como dependencia a la release v0.9.5 antes del gate; no se reemplaza
ningún asset anterior. v0.9.4 publicó alpha8 y v0.9.2 alpha2: quedan como historia.
OmniRoute sigue retirado. Se conservan sesiones y proveedores del usuario.
La salida nueva es `apps/shell/release-0.9.6-final-20261016/` y los tamaños/
hashes finales se registran en [notas bilingües](../release-notes-v0.9.6.md).

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

La release desktop v0.9.6 contiene setup NSIS, portable, blockmap del setup y
`latest.yml`. El runtime DSH separado tiene versión independiente: v0.9.6
descarga el runtime Windows x64 exacto `0.2.1-alpha.9` desde la release runtime pública v0.9.5,
que también incluye el checksum SHA-256. El gate verifica el archivo fijado
local y el manifest empaquetado; nunca vuelve a generar, elimina ni reemplaza
ese tarball inmutable. El packaging desktop habitual tampoco ejecuta
`package:runtime`.

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
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.6-final-20261016'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.6-final-20261016
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

El usuario confirmó que la instalación NSIS v0.9.4 funciona en Windows x64. El
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
$env:FREECODE_NSIS_SETUP_PATH = 'C:\path\to\exact\FreeCode-DeepSeek-Harness-0.9.6-win-x64-setup.exe'
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
