# FreeCode DeepSeek Harness v0.9.4 — Candidate

## English

**Status: candidate; not yet published.** The latest published release remains
v0.9.3 for Windows x64. These notes describe the current local source candidate;
they are not a release announcement or a claim that final assets have passed
installation validation.

### What's new

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
passed. The full vendor build still has unrelated existing TypeScript/test
runtime failures; candidate packaging and local installation validation are
still in progress. No v0.9.4 public tag or release exists.

## Español

**Estado: candidata; todavía no publicada.** La última release publicada sigue
siendo v0.9.3 para Windows x64. Estas notas describen la candidata del código
local; no anuncian una release ni afirman que los artefactos finales hayan
superado la validación de instalación.

### Novedades

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
AI y selector. El build completo del vendor todavía presenta errores de
TypeScript/runtime de tests preexistentes y ajenos; el empaquetado de la
candidata y la validación de instalación local siguen en curso. No existe tag ni
release pública v0.9.4.
