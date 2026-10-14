# FreeCode DeepSeek Harness v0.9.4 — Candidate

## English

**Status: candidate; not yet published.** v0.9.3 remains the latest published
Windows x64 release. These notes describe the local source candidate, not a
release announcement. Fresh setup and portable artifacts are built and statically
verified in `apps/shell/release-0.9.4-candidate-refresh-20261014/`; the older
candidate build is superseded. The setup (178,620,019 bytes; SHA-256
`c112637c95de1564a401ac9852300081983bf15d92f82330df16ff7279d1304b`) and
portable (178,246,021 bytes; SHA-256
`c3b1e9a65e8b5e420c48059aac14b6ded3790c5b8b7804bfef58acec454d01ea`) are ready.
The refreshed one-click setup was executed after confirmation that FreeCode was
closed; NSIS returned exit code 0. The normal post-install launch reported
`No harness runtime asset for packaged version 0.2.1-alpha.4 (win32-x64)` because
the installer excludes DSH and the matching alpha4 release asset is unpublished.
With separate user authorization, the verified local alpha4 runtime was seeded
into this machine's per-user cache and its previous alpha3 cache was preserved
as a backup. This is a local-only workaround; other installations still need
the exact-version published runtime asset. The app has not been retried, so
startup, Tor and backgrounds await user verification.

### What's new

- **Browser-first system prompt.** For tasks needing web information, use the
  embedded `computer_use` browser before DeepSeek API `web_search`. API fallback
  is reserved for browser unavailability, blocked access or failed attempts,
  with the limitation disclosed. Tool scopes and user permissions remain
  respected. DSH `0.2.1-alpha.4` is locally rebuilt and its archive, SHA-256,
  Electron ABI and Node engine are verified; it is not published remotely yet.
- **OmniRoute removed.** No optional runtime download, automatic fallback,
  server or detector remains. Next-start migration retires only FreeCode-owned
  legacy configuration and verified caches; user providers/history are preserved.
- **Invalid `pash` calls repaired at the bridge.** Exact `pash` becomes `bash`
  only when the original client declares unambiguous, permitted `bash`.
  Stream fragments, tool IDs and arguments are preserved; no fuzzy correction,
  permission bypass or request replay. Packaging rejects stale sidecar builds.
- **opencode2api v1.3.8** replaces v1.3.5. Manual model selection survives
  refreshes, temporary probe failures recover, and canonical/stable request and
  session identities are preserved. FreeCode's anonymous lane still tries
  Direct first and advances to Tor only after a non-2xx response in the same request.
- **Tor availability and failover hardened.** The ControlPort uses SAFECOOKIE;
  readiness waits for authenticated bootstrap progress 100% and a usable SOCKS
  listener. Circuit-timeout learning stays adaptive, with the stable 600-second
  circuit dirtiness interval. Startup is monitored asynchronously so direct
  traffic stays available; the overlay shows bounded, redacted process and
  `tor.log` diagnostics, and a slow start can be cancelled. Retry preserves the
  same SOCKS endpoint, while a local SOCKS probe restores an unhealthy route
  every 10 seconds without extra public health checks. Tor executable and both
  GeoIP databases are SHA-256-checked before packaging and after copying.
- **Tor-unavailable root cause corrected in the smoke harness.** The NSIS smoke
  passed Chromium's `--user-data-dir`, but Electron's `app.getPath('userData')`
  followed `APPDATA`. It therefore wrote Tor config into the maintainer profile
  with GeoIP paths under a disposable install directory. The smoke now redirects
  APPDATA, LOCALAPPDATA, USERPROFILE, HOME, TEMP and TMP into its own test tree.
- **Conversation backgrounds reach the package.** Runtime packaging checks
  materialized and copied DSH bundles, and electron-builder rejects a stale
  embedded bundle. Reduced motion stops animation without dimming the visible
  background; a rendered-pixel regression checks normal and reduced-motion paint.
- **Runtime pins stay aligned.** The package step refreshes version/SHA-256 only
  for locally built opencode2api and DSH artifacts, leaves external Tor pins
  explicit, and treats absent optional PATH-fallback tools as optional.
- **Gentle AI is selectable again.** It is an explicit opt-in Web mode based on
  the Standard composition; Standard remains the default.

### Candidate verification

Focused Tor/background/runtime tests passed 51/51; NSIS smoke-safety passed 5/5;
release-doc contract passed 8/8. Full shell suite: 45 files / 315 tests passed;
workspace contracts: 113 passed / 12 intentional skips; opencode2api adapter:
21/21; Go: 36 tests across 13 packages and `go vet` clean. `pnpm release:gate`
passed completely, verifying DSH alpha4, runtime/Tor hashes, backgrounds in the
packaged runtime, and an isolated NSIS setup without installing or launching the
FreeCode GUI. The real packaged Tor config also passed `tor.exe --verify-config`
(exit 0); this validates syntax/assets only, not network bootstrap. The fresh
setup and portable passed static PE, updater, blockmap and SHA-256 verification.
The new setup was executed after confirmation that FreeCode was closed (NSIS exit
code 0), but that did not prove application startup: the post-install launch
reported the missing unpublished DSH alpha4 release asset. The verified local
alpha4 runtime has since been seeded into the per-user cache, preserving the
previous alpha3 cache as a backup. The app has not been retried; startup, Tor and
backgrounds still await user verification. Other installations require the
matching published runtime asset. Unrelated pre-existing failures in the full
vendor composite build remain outside this candidate. No tag or public release
exists for v0.9.4.

## Español

**Estado: candidata; todavía no publicada.** v0.9.3 sigue siendo la última release
publicada para Windows x64. Estas notas describen el código local, no anuncian
una release. El setup y portable nuevos se compilaron y verificaron
estáticamente en `apps/shell/release-0.9.4-candidate-refresh-20261014/`; la build
candidata anterior quedó obsoleta. El setup (178.620.019 bytes; SHA-256
`c112637c95de1564a401ac9852300081983bf15d92f82330df16ff7279d1304b`) y el
portable (178.246.021 bytes; SHA-256
`c3b1e9a65e8b5e420c48059aac14b6ded3790c5b8b7804bfef58acec454d01ea`) están
listos. El setup one-click actualizado se ejecutó tras confirmar que FreeCode
estaba cerrada; NSIS devolvió código 0. El inicio normal posterior informó
`No harness runtime asset for packaged version 0.2.1-alpha.4 (win32-x64)` porque
el instalador excluye DSH y el asset alpha4 correspondiente aún no se publicó.
Con autorización separada del usuario, se precargó el runtime alpha4 local
verificado en la caché por usuario de esta máquina y se preservó como respaldo
la caché alpha3 anterior. Es una solución sólo local: otras instalaciones
necesitan el asset publicado de versión exacta. La app no se volvió a probar;
el usuario todavía debe verificar el arranque, Tor y los fondos.

### Novedades

- **Navegador embebido primero en el prompt del sistema.** Si la tarea necesita
  información web, usar `computer_use` antes de DeepSeek API `web_search`.
  El fallback queda para navegador ausente, acceso bloqueado o intentos fallidos,
  informando la limitación. Se respetan scopes y permisos del usuario. DSH
  `0.2.1-alpha.4` se recompiló localmente y se verificaron el archivo, SHA-256,
  ABI de Electron y versión de Node; todavía no está publicado.
- **OmniRoute retirado.** Sin descarga opcional, fallback automático, servidor
  ni detector. La migración del próximo inicio retira solo la configuración
  antigua propia y cachés verificadas; conserva proveedores e historial del usuario.
- **Llamadas inválidas `pash` corregidas en el puente.** Solo se convierte el
  nombre exacto a `bash` si el cliente original declara `bash` permitido y sin
  ambigüedad. Conserva fragmentos, IDs y argumentos; sin corrección aproximada,
  salto de permisos ni repetición del request. El empaquetado rechaza binarios viejos.
- **opencode2api v1.3.8** reemplaza v1.3.5. La selección manual persiste al
  actualizar; se recupera de sondeos temporalmente fallidos y conserva
  identidades canónicas/estables de requests y sesiones. El lane anónimo de
  FreeCode sigue intentando Direct primero y pasa a Tor solo tras no-2xx en el
  mismo request.
- **Disponibilidad y failover Tor reforzados.** El ControlPort usa SAFECOOKIE;
  la disponibilidad espera bootstrap autenticado al 100% y un listener SOCKS
  utilizable. El timeout de circuito sigue siendo adaptativo y se conserva el
  intervalo de 600 segundos para circuitos estables. El inicio se monitorea en
  segundo plano para mantener disponible la ruta directa; el overlay muestra
  diagnósticos acotados y saneados del proceso y de `tor.log`, y permite cancelar
  un inicio lento. Los reintentos mantienen el mismo endpoint SOCKS; una prueba
  local restaura la ruta cada 10 segundos sin sondeos públicos adicionales. El
  ejecutable Tor y ambas bases GeoIP se verifican por SHA-256 antes y después
  del empaquetado.
- **Corregida la causa de Tor no disponible en el smoke.** El NSIS smoke pasaba
  `--user-data-dir` de Chromium, pero Electron obtenía `app.getPath('userData')`
  desde `APPDATA`. Por eso escribió el torrc en el perfil real del mantenedor,
  con GeoIP apuntando a una instalación temporal ya eliminada. Ahora el smoke
  redirige APPDATA, LOCALAPPDATA, USERPROFILE, HOME, TEMP y TMP a su propio
  directorio temporal.
- **Los fondos de conversación llegan al paquete.** El empaquetado verifica
  bundles DSH materializados y copiados; electron-builder rechaza uno obsoleto.
  El movimiento reducido detiene la animación sin atenuar el fondo visible y
  una prueba de píxeles protege el render normal y con movimiento reducido.
- **Los pins runtime quedan alineados.** El empaquetado actualiza versión y
  SHA-256 solo para opencode2api/DSH generados localmente, mantiene explícito el
  pin externo de Tor y acepta herramientas opcionales ausentes si tienen
  fallback por PATH.
- **Gentle AI vuelve a ser seleccionable.** Es un modo Web optativo explícito
  basado en Standard; Standard sigue siendo el modo predeterminado.

### Verificación de la candidata

Las pruebas focalizadas de Tor/fondos/runtime pasaron 51/51; NSIS smoke-safety,
5/5; contrato documental, 8/8. Suite shell completa: 45 archivos / 315 tests;
contratos: 113 aprobados / 12 saltos intencionales; adapter opencode2api: 21/21;
Go: 36 tests en 13 paquetes y `go vet` sin hallazgos. `pnpm release:gate` pasó
completo: verificó DSH alpha4, hashes runtime/Tor, fondos en el runtime
empaquetado y un setup NSIS aislado sin instalar ni iniciar la GUI FreeCode. La
configuración Tor empaquetada también pasó `tor.exe --verify-config` (código 0);
eso valida sintaxis/assets, no el bootstrap de red. Setup y portable nuevos
pasaron la verificación estática de PE, updater, blockmap y SHA-256. El setup
nuevo se ejecutó tras confirmar que FreeCode estaba cerrada (NSIS devolvió código
0), pero eso no probó el arranque: el intento normal informó que no existe el
asset DSH alpha4 correspondiente, aún sin publicar. Con autorización separada
del usuario, se precargó el runtime alpha4 local verificado en la caché por
usuario de esta máquina y se preservó como respaldo la caché alpha3 anterior.
La app no se volvió a probar; el usuario todavía debe verificar arranque, Tor y
fondos. Otras instalaciones necesitan el asset publicado de versión exacta.
Persisten fallos preexistentes y ajenos en el build compuesto completo del
vendor. v0.9.4 no tiene tag ni release pública.
