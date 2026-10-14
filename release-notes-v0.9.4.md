# FreeCode DeepSeek Harness v0.9.4 — Candidate

## English

**Status: candidate; not yet published.** The latest published release remains
v0.9.3 for Windows x64. These notes describe the current local source candidate;
they are not a release announcement. The setup ran successfully, but application
startup and feature behavior have not been validated separately.

### What's new

- **OmniRoute removed.** No optional runtime download, automatic fallback,
  server or detector remains. Next-start migration retires only FreeCode-owned
  legacy configuration and verified caches; user providers/history are preserved.

- **Invalid `pash` calls repaired at the bridge.** Exact `pash` becomes `bash`
  only when the original client declares unambiguous, permitted `bash`.
  Stream fragments, tool IDs and arguments are preserved; no fuzzy correction,
  permission bypass or request replay. Packaging rejects stale sidecar builds.

- **opencode2api v1.3.8** replaces the v1.3.5 vendored source. Manual model
  selection survives refreshes, temporary probe failures recover, and
  canonical/stable request and session identities are preserved. FreeCode's
  anonymous lane still tries Direct first and advances to Tor only after a
  non-2xx response in the same request.
- **More reliable Tor failover.** The ControlPort uses SAFECOOKIE
  authentication, readiness waits for authenticated bootstrap progress 100%
  plus a usable SOCKS listener, and adaptive circuit-timeout learning remains
  enabled. Long-lived model streams keep the stable 600-second circuit
  dirtiness interval.
- **Gentle AI is selectable again.** It is an explicit opt-in mode based on the
  Standard composition; Standard remains the default.

### Candidate verification

Focused opencode2api, Tor, Gentle AI contract/locale and selector tests have
passed. The local setup and portable packages were generated and passed static
asset verification. After the user confirmed FreeCode was closed, the authorized
one-click setup exited with code 0. This confirms installer completion only;
application startup and feature behavior have not been smoke-tested separately.
The earlier complete release gate passed, but its latest rerun after the Electron
probe-timeout fix hit load-sensitive test timeouts; both affected suites passed
when rerun individually. The full vendor build also retains unrelated existing
TypeScript/test-runtime failures. v0.9.4 remains an unpublished candidate with no
public tag or release.

## Español

**Estado: candidata; todavía no publicada.** La última release publicada sigue
siendo v0.9.3 para Windows x64. Estas notas describen la candidata del código
local; no anuncian una release. El setup terminó correctamente, pero el inicio de
la aplicación y el comportamiento de sus funciones no se validaron por separado.

### Novedades

- **OmniRoute retirado.** Sin descarga opcional, fallback automático, servidor
  ni detector. La migración del próximo inicio retira solo la configuración
  antigua propia y cachés verificadas; conserva proveedores e historial del usuario.

- **Llamadas inválidas `pash` corregidas en el puente.** Solo se convierte el
  nombre exacto a `bash` si el cliente original declara `bash` permitido y sin
  ambigüedad. Conserva fragmentos, IDs y argumentos; sin corrección aproximada,
  salto de permisos ni repetición del request. El empaquetado rechaza binarios viejos.

- **opencode2api v1.3.8** reemplaza el código vendorizado v1.3.5. La selección
  manual de modelos persiste al actualizar, los fallos temporales de sondeo se
  recuperan y se conservan identidades canónicas/estables de requests y
  sesiones. El lane anónimo de FreeCode sigue intentando Direct primero y pasa
  a Tor solo tras una respuesta no-2xx dentro del mismo request.
- **Failover Tor más confiable.** El ControlPort usa autenticación SAFECOOKIE;
  la disponibilidad espera el progreso de bootstrap autenticado al 100% y un
  listener SOCKS utilizable. Sigue activo el aprendizaje adaptativo del timeout
  de circuito; los streams largos conservan el intervalo estable de 600 segundos
  para la suciedad del circuito.
- **Gentle AI vuelve a ser seleccionable.** Es un modo optativo explícito basado
  en la composición Standard; Standard sigue siendo el modo predeterminado.

### Verificación de la candidata

Pasaron las pruebas focalizadas de opencode2api, Tor, contratos/locales de Gentle
AI y selector. Los paquetes setup y portable se generaron en local y pasaron la
verificación estática de artefactos. Tras confirmar el usuario que FreeCode estaba
cerrado, el setup one-click autorizado terminó con código 0. Esto confirma solo
que terminó el instalador: el inicio de la aplicación y el comportamiento de sus
funciones no se probaron por separado. El gate completo anterior pasó, pero su
última repetición después del arreglo del timeout de Electron tuvo timeouts de
tests sensibles a la carga; ambas suites afectadas pasaron al ejecutarse por
separado. El build completo del vendor también conserva errores preexistentes y
ajenos de TypeScript/runtime de tests. v0.9.4 sigue siendo una candidata sin tag
ni release pública.
