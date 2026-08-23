# Known issues / Problemas conocidos

Última revisión / Last reviewed: 2026-08-23  
Baseline revisada / Reviewed baseline: `v0.2.2`

## Estado actual / Current status

No hay un bug funcional bloqueante confirmado en el checkout actual. La alerta degradada del primer arranque quedó corregida en `v0.2.2`. Los problemas de selector de idioma, ventanas de tool-calling, fondos animados, avisos de apagado del pool y documentación bilingüe que aparecen en planes históricos no describen el estado actual; se conservan allí como registro de versiones anteriores.

There is no confirmed release-blocking functional bug in the current checkout. The first-start degraded-catalog alert was fixed in `v0.2.2`. The language-selector, tool-calling window, animated-background, pool-shutdown notice, and bilingual-documentation issues mentioned in historical plans do not describe the current state; they remain there as historical release records.

## Limitaciones operativas / Operational limitations

### KI-001 — Free Pool availability is external / La disponibilidad del Free Pool es externa

The OpenCode Free route depends on the local bridge, available workers, provider/session limits, and network conditions. A pool can temporarily report zero workers, retry, or lose a stream even when the API key is valid. FreeCode retries bounded failures and reports the pool state, but it cannot remove upstream, IP, quota, or network limits.

La ruta OpenCode Free depende del puente local, los workers disponibles, los límites de proveedor/sesión y la red. El pool puede informar temporalmente cero workers, reintentar o perder un stream aunque la API key sea válida. FreeCode reintenta fallos acotados e informa el estado del pool, pero no puede eliminar límites upstream, de IP, cuota o red.

### KI-002 — Windows artifacts are large / Los artefactos Windows son grandes

The portable and setup artifacts include a local runtime and can require several minutes and substantial disk space on first installation or extraction. This is an operational cost of the current packaging, not evidence that the application is hung. The release notes should continue to state the expected size and first-run behavior.

Los artefactos portable y setup incluyen un runtime local y pueden requerir varios minutos y bastante espacio en disco durante la primera instalación o extracción. Es un costo operativo del empaquetado actual, no una evidencia de que la aplicación se haya colgado. Las notas de release deben seguir informando el tamaño esperado y el comportamiento del primer arranque.

### KI-003 — RTK remains an external optional tool / RTK sigue siendo una herramienta externa opcional

RTK is not bundled, downloaded, or installed by FreeCode. The toggle only takes effect when an `rtk` executable is already available; otherwise the original eligible command runs. This is intentional. A future Caveman integration must preserve the same explicit opt-in rule.

FreeCode no incluye, descarga ni instala RTK. El toggle sólo tiene efecto cuando ya existe un ejecutable `rtk`; de lo contrario se ejecuta el comando elegible original. Es intencional. Una futura integración de Caveman debe conservar la misma regla de activación explícita.

### KI-004 — Caveman is not implemented yet / Caveman todavía no está implementado

Caveman is a roadmap candidate, not a current FreeCode feature. Do not assume that installing its CLI changes FreeCode behavior. Any future integration must first pass the recovery, fidelity, Windows packaging, storage, protocol, and license gates in [`ROADMAP.md`](ROADMAP.md).

Caveman es un candidato del roadmap, no una función actual de FreeCode. Instalar su CLI no cambia el comportamiento de FreeCode. Una futura integración debe superar primero los gates de recuperación, fidelidad, empaquetado Windows, almacenamiento, protocolo y licencia de [`ROADMAP.md`](ROADMAP.md).

## Issues resueltos / Resolved historical issues

These entries are kept here so an old report is easy to classify:

- The Spanish language option and the native app locale alignment were restored.
- Tool calls are headless except for the project selector.
- The FreeCode animated working background is present.
- Pool shutdown errors are handled as state/diagnostic information rather than an API-key failure.
- The primary README, Spanish README, and release descriptions have bilingual coverage.
- The embedded Chromium address bar and panel layout were corrected in `v0.2.2`; Enter/Go, bare-host HTTPS navigation, and text reflow are covered by the release implementation.

Estas entradas quedan para clasificar rápidamente reportes antiguos:

- Se restauró la opción de español y la alineación del idioma nativo de la app.
- Los tool calls son headless salvo el selector de proyecto.
- Está presente el fondo animado de trabajo de FreeCode.
- Los errores de apagado del pool se tratan como estado/diagnóstico y no como fallo de API key.
- El README principal, el README en español y las descripciones de release tienen cobertura bilingüe.
- La barra de direcciones y el layout del Chromium embebido se corrigieron en `v0.2.2`; Enter/Ir, navegación HTTPS de hosts simples y reflow del texto quedan cubiertos por la implementación del release.

## Cómo reportar un problema nuevo / How to report a new issue

Include the FreeCode version, Windows architecture, selected language, model/pool, whether RTK is enabled, the approximate time, and the relevant session-log excerpt with secrets removed. For stream failures, include whether the failure recovered automatically and whether the same request works after switching model or pool.

Incluí la versión de FreeCode, arquitectura de Windows, idioma elegido, modelo/pool, si RTK está habilitado, hora aproximada y el fragmento relevante del log de sesión sin secretos. Para fallos de stream, indicá si se recuperó automáticamente y si la misma solicitud funciona después de cambiar de modelo o pool.
