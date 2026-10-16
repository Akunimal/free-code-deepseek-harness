# FreeCode DeepSeek Harness v0.9.6 — Windows x64

## English

### Candidate — not published yet

The user confirmed the local containment candidate works. The final 0.9.6
setup/portable and public clean-cache runtime gate are pending. A local runtime
preload is not proof of a working first installation; publication stays blocked
until the real public first-run test passes.

### What changed

- **Windows background-window containment.** The verified GUI-subsystem
  `headless-host` creates a private noninteractive desktop, creates the child
  suspended, assigns its kill-on-close Job before resuming, and preserves
  pipes, environment, working directory, Unicode arguments and exit status.
  Descendants inherit containment. The bounded watchdog acts only on its own
  Job members; it does not hide windows by process name or capture content.
- **Intentional GUI remains visible.** Explicit file, folder, editor and reveal
  actions use an authenticated Electron broker on the interactive desktop.
  Missing containment or an incompatible runtime fails closed; there is no
  direct-spawn fallback or environment opt-out.
- **Native tests, not only contracts.** Prepackage and afterPack execute actual
  adversarial window/focus, new-console descendant and Job-lifetime tests
  against the exact staged/packaged helper. A foreign Job must remain untouched.
  Runtime admission requires both GUI broker bundles.
- **Harness audit fixes.** Restrict privileged renderer navigation and IPC to
  trusted top-level origins and scoped overlay channels; coalesce boot/manual/
  timer catalog refreshes; broadcast Tor state to Pool Status. The legacy
  adapter preserves requests over 10 MiB and strips stale representation
  headers from synthesized exhausted-retry responses. These legacy adapter
  fixes do not claim an additional active model gateway.
- **Preserved features.** opencode2api v1.4.0, direct-first Tor failover,
  verified-200 model discovery, catalog-loading indicator, per-model context/
  effort, Gentle AI and 13 Hermes-inspired CSS/ASCII backgrounds remain.

### Runtime and first launch

The exact DSH `0.2.1-alpha.9` Windows x64 runtime is downloaded separately on
first launch when no valid cache exists. **Internet is required** then; later
starts can reuse a validated cache. Setup and portable do not contain DSH.
Alpha9 requires Electron ABI 149 and includes the private-desktop GUI bridges;
alpha8 and older caches are not accepted as alpha9.

The immutable alpha9 archive/checksum are appended as dependency assets to
the existing v0.9.5 release, without replacing any previous asset or tag:

| Asset | Size | SHA-256 |
| --- | ---: | --- |
| `deepseek-harness-runtime-0.2.1-alpha.9-win32-x64.tar.gz` | 421,541,194 bytes | `7c1d8cb1b53e2a88a7549941afacf423a1345353b9c3aa6fd53d95d3f49c4ca5` |

The required clean-cache gate creates an empty isolated profile/cache, uses the
production bootstrap/updater and public GitHub asset, verifies SHA-256,
extraction layout, manifest and packaged Electron ABI, then starts the
downloaded DSH CLI hidden. This gate is currently pending for v0.9.6.

### Desktop artifacts and limits

Final setup, portable, blockmap and `latest.yml` hashes will be recorded here
after verification. Output: `apps/shell/release-0.9.6-final-20261016/`.

Windows x64 only. Binaries are **unsigned**; no signing identity is supplied.
Windows ARM64, Linux and macOS are not tested or supported. The private desktop
is accidental-window containment, not a security sandbox against malicious
same-user code, UAC, services or OS brokers. The optional interactive NSIS VM
install/uninstall smoke is not run on the workstation. The user's running app
must not be inspected, stopped, restarted or installed over by these gates.
Portable execution is not separately claimed as a manual usability test.

## Español

### Candidata — todavía no publicada

El usuario confirmó funcionando el candidato local de contención. Faltan los
artefactos finales 0.9.6 y el gate público de caché vacía. Una precarga local
no demuestra una primera instalación funcional; la publicación queda bloqueada
hasta pasar la prueba pública real.

### Cambios

- **Contención de ventanas de fondo en Windows.** `headless-host` verificado,
  con subsistema GUI, crea un escritorio privado no interactivo, inicia el hijo
  suspendido y asigna su Job de cierre en cascada antes de reanudar. Conserva
  pipes, entorno, directorio, argumentos Unicode y código de salida. Los
  descendientes heredan la contención. El watchdog acotado actúa solo sobre
  miembros de su Job, sin ocultar por nombre ni capturar contenido de ventanas.
- **Las acciones GUI explícitas siguen visibles.** Archivos, carpetas,
  editores y revelar usan un broker Electron autenticado en el escritorio
  interactivo. Si falla la contención o falta un runtime compatible, se rechaza
  el inicio; no hay fallback directo ni variable para desactivar la protección.
- **Pruebas nativas, no solo strings.** Prepackage y afterPack fuerzan ventanas,
  foco, descendientes con consola nueva y cierre del Job sobre el helper exacto
  preparado/empaquetado. Un Job ajeno queda intacto. Se exige la compatibilidad
  de ambos bundles del broker GUI en el runtime.
- **Correcciones de auditoría.** Navegación e IPC privilegiados restringidos al
  origen/frame autorizado y canales acotados del overlay; refrescos de catálogo
  concurrentes unificados; estado Tor enviado a Estado del pool. El adaptador
  antiguo conserva requests de más de 10 MiB y elimina headers incompatibles
  con las respuestas sintetizadas al agotar reintentos. Esto no agrega otro
  gateway activo de modelos.
- **Funciones conservadas.** opencode2api v1.4.0, Direct primero/Tor como
  failover, modelos verificados con HTTP 200, indicador del catálogo, contexto/
  esfuerzo por modelo, Gentle AI y 13 fondos CSS/ASCII inspirados en Hermes.

### Runtime y primer inicio

El runtime DSH Windows x64 exacto `0.2.1-alpha.9` se descarga por separado en
el primer inicio sin caché válida. **Hace falta Internet**; los siguientes
inicios reutilizan la caché validada. Setup y portable no incluyen DSH. Alpha9
requiere ABI 149 de Electron e incorpora los bridges GUI del escritorio privado;
las cachés alpha8 o anteriores no sirven como alpha9.

El archivo alpha9 inmutable y su checksum se agregan como dependencia a la
release v0.9.5 existente, sin reemplazar ningún asset ni tag anterior:

| Artefacto | Tamaño | SHA-256 |
| --- | ---: | --- |
| `deepseek-harness-runtime-0.2.1-alpha.9-win32-x64.tar.gz` | 421.541.194 bytes | `7c1d8cb1b53e2a88a7549941afacf423a1345353b9c3aa6fd53d95d3f49c4ca5` |

El gate obligatorio de caché vacía crea un perfil/caché aislados, usa el
bootstrap/updater de producción y el asset público de GitHub, verifica SHA-256,
extracción, manifest y ABI Electron empaquetada, y luego inicia el CLI DSH
descargado en modo oculto. Ese gate sigue pendiente para v0.9.6.

### Artefactos desktop y límites

Se registrarán aquí los hashes finales de setup, portable, blockmap y
`latest.yml` después de verificarlos. Salida:
`apps/shell/release-0.9.6-final-20261016/`.

Solo Windows x64. Binarios **sin firma**; no se proporcionó identidad de firma.
Windows ARM64, Linux y macOS no están probados ni soportados. El escritorio
privado evita ventanas accidentales: no es un sandbox de seguridad frente a
código malicioso del mismo usuario, UAC, servicios o brokers del SO. El smoke
interactivo opcional de instalación/desinstalación requiere una VM desechable y
no se ejecuta en la workstation. Los gates no inspeccionan, detienen, reinician
ni instalan sobre la app activa del usuario. No se afirma una prueba manual
independiente del ejecutable portable.
