# FreeCode DeepSeek Harness v0.9.6 — Windows x64

## English

### Verified release candidate

The user confirmed the local containment candidate works. The final 0.9.6
setup and portable were built with publishing disabled, and the full release
gate passed on the final source: exit 0, including the public empty-cache
runtime download (`first-run-runtime-download: PASS`). A local runtime preload
is not proof of a working first installation; that proof is the public
empty-cache run recorded below.

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
downloaded DSH CLI hidden. It passed in the final v0.9.6 release-gate run.

### Desktop artifacts and limits

Output of the final build: `apps/shell/release-0.9.6-final-20261016/`. Built
from source commit `08b9731b0c`; publishing disabled (`--publish never`).

| Asset | Size | SHA-256 |
| --- | ---: | --- |
| `FreeCode-DeepSeek-Harness-0.9.6-win-x64-setup.exe` | 179,612,122 bytes | `443695783a98e1b1e94996de15a3a85fbae0410d761683cf2f9d3f422d7bb6de` |
| `FreeCode-DeepSeek-Harness-0.9.6-win-x64-portable.exe` | 179,236,984 bytes | `3414dc81aa4a900a19c9887614db82390f908cd7df46be6af9d1d301681b8f5a` |
| `FreeCode-DeepSeek-Harness-0.9.6-win-x64-setup.exe.blockmap` | 190,053 bytes | `81e39143252856eb4fc98f86aab4a8aa5fa33dd431cc53bb04ad18b981f3602c` |
| `latest.yml` | 395 bytes | `8a006c735b3df9bfc423d0e716097524334d3a98cb6794a7c709fba8f625dfef` |

`latest.yml` points to the setup with `sha512` `g8vhBkm9pVA29tU0SGkhLr9bGNVFAoMlFOvYZhgtlAzoce7o43ZQupT6skEKkPfYmz2dA0wH1LnYLfXV6MXAWg==`.
The packaged helper `headless-host.exe` has SHA-256
`2906380678daaf025f9f65fbccc0def615f9729eb5e8a1ddb6802c4a3107a69f`, identical to
the staged helper. The packaged native containment and Job-lifetime tests pass
against that exact file.

Windows x64 only. Binaries are **unsigned**; no signing identity is supplied.
Windows ARM64, Linux and macOS are not tested or supported. The private desktop
is accidental-window containment, not a security sandbox against malicious
same-user code, UAC, services or OS brokers. The optional interactive NSIS VM
install/uninstall smoke is not run on the workstation. The user's running app
must not be inspected, stopped, restarted or installed over by these gates.
Portable execution is not separately claimed as a manual usability test.

## Español

### Candidata verificada

El usuario confirmó funcionando el candidato local de contención. Los artefactos
finales 0.9.6 (setup y portable) se construyeron con publicación desactivada, y
el gate completo de release pasó sobre la fuente final: código de salida 0,
incluida la descarga pública con caché vacía (`first-run-runtime-download: PASS`).
Una precarga local no demuestra una primera instalación funcional; esa prueba es
la corrida pública con caché vacía registrada abajo.

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
descargado en modo oculto. Pasó en la corrida final del gate de release v0.9.6.

### Artefactos desktop y límites

Salida del build final: `apps/shell/release-0.9.6-final-20261016/`. Construido
desde el commit de fuente `08b9731b0c`; publicación desactivada (`--publish never`).

| Artefacto | Tamaño | SHA-256 |
| --- | ---: | --- |
| `FreeCode-DeepSeek-Harness-0.9.6-win-x64-setup.exe` | 179.612.122 bytes | `443695783a98e1b1e94996de15a3a85fbae0410d761683cf2f9d3f422d7bb6de` |
| `FreeCode-DeepSeek-Harness-0.9.6-win-x64-portable.exe` | 179.236.984 bytes | `3414dc81aa4a900a19c9887614db82390f908cd7df46be6af9d1d301681b8f5a` |
| `FreeCode-DeepSeek-Harness-0.9.6-win-x64-setup.exe.blockmap` | 190.053 bytes | `81e39143252856eb4fc98f86aab4a8aa5fa33dd431cc53bb04ad18b981f3602c` |
| `latest.yml` | 395 bytes | `8a006c735b3df9bfc423d0e716097524334d3a98cb6794a7c709fba8f625dfef` |

`latest.yml` apunta al setup con `sha512` `g8vhBkm9pVA29tU0SGkhLr9bGNVFAoMlFOvYZhgtlAzoce7o43ZQupT6skEKkPfYmz2dA0wH1LnYLfXV6MXAWg==`.
El helper empaquetado `headless-host.exe` tiene SHA-256
`2906380678daaf025f9f65fbccc0def615f9729eb5e8a1ddb6802c4a3107a69f`, idéntico al
helper preparado. Las pruebas nativas de contención y de vida del Job pasan contra
ese archivo exacto.

Solo Windows x64. Binarios **sin firma**; no se proporcionó identidad de firma.
Windows ARM64, Linux y macOS no están probados ni soportados. El escritorio
privado evita ventanas accidentales: no es un sandbox de seguridad frente a
código malicioso del mismo usuario, UAC, servicios o brokers del SO. El smoke
interactivo opcional de instalación/desinstalación requiere una VM desechable y
no se ejecuta en la workstation. Los gates no inspeccionan, detienen, reinician
ni instalan sobre la app activa del usuario. No se afirma una prueba manual
independiente del ejecutable portable.
