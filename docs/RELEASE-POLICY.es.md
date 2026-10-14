# Política de releases

Las releases son manuales y tienen como target Windows x64. Esta política
describe el límite real entre la app desktop y el runtime para v0.9.3; no
autoriza a tocar una instancia de FreeCode que esté en ejecución.

La versión actual de la fuente es candidata v0.9.4 y sigue sin publicar hasta
completar su validaciÃ³n. Los artefactos y hashes v0.9.3 que siguen abajo son
evidencia histÃ³rica de la release publicada y no deben sobrescribirse.

## Contenido de la release y runtime fijado

El candidato v0.9.4 cambia los fondos de DSH y prioriza el navegador en el prompt.
Fija el runtime `0.2.1-alpha.4` en `apps/shell/harness-runtime.json`, versionado en Git.
Hay que regenerarlo antes de empaquetar; el gate rechaza stages alpha2/alpha3 viejos.
Los archivos anteriores son inmutables. Se retiró la integración
OmniRoute: no se incluye fallback, descarga, servidor ni detector. Solo se
retiran la configuración antigua propia y las cachés verificadas en el próximo
inicio; se conservan los proveedores ajenos y las sesiones.
Los runtimes aún no publicados no pueden descargarse: una prueba local debe
disponer explícitamente de runtimes locales verificados antes de arrancar.
No se debe presentar un asset remoto ausente como disponible.

Tras cambiar opencode2api o su overlay activo, recompilá con
`bash scripts/build-opencode2api.sh`. También prepara el nuevo sidecar Windows
sin regenerar DSH. El preflight rechaza receipts ausentes, fuentes cambiadas
o bytes de un binario viejo; nunca prepara silenciosamente una build antigua
sin verificar.

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
$env:FREECODE_RELEASE_OUTPUT = 'release-0.9.4-candidate'
pnpm build:desktop
pnpm verify:desktop-release-assets apps/shell/release-0.9.4-candidate
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
de prueba, el CLI DSH/Electron en modo Node y los fixtures MCP. El smoke usa sólo
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
