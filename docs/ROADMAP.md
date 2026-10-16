# Roadmap / Hoja de ruta

### Current 0.9.4 candidate (alpha7)

The candidate targets `apps/shell/release-0.9.4-alpha7-20261015/`, with DSH 0.2.1-alpha.7 and opencode2api v1.4.0. It includes the model-catalog/profile repair, documented inference routing, Hermes backgrounds and V094-35, which prevents localized composer-block writes from recursing when model availability changes. The full non-interactive release gate passed; fresh setup/portable artifacts were built and statically verified. Exact hashes are in `release-notes-v0.9.4.md`. Alpha6 desktop artifacts predate V094-35 and must not be used to test this candidate. Alpha7 is unpublished; the local bundle includes the exact runtime and a CHECK ONLY preflight. To test, the user closes FreeCode and explicitly runs the preparation option before setup; this task did not install or launch FreeCode. Public-provider acceptance remains unverified. The active catalog is `profiles/web/cordis.patch.yml`. V094-21 remains included; alpha5/alpha6 desktop artifacts are superseded. No tag, upload or release is included.

### Candidata actual 0.9.4 (alpha7)

La candidata apunta a `apps/shell/release-0.9.4-alpha7-20261015/`, con DSH 0.2.1-alpha.7 y opencode2api v1.4.0. Incluye el arreglo del catálogo/perfil, el enrutamiento de inferencia documentado, los fondos Hermes y V094-35, que evita escrituras recursivas del bloqueo localizado del composer cuando cambia la disponibilidad del modelo. El gate completo no interactivo pasó; se compilaron y verificaron estáticamente setup/portable. Los hashes exactos están en `release-notes-v0.9.4.md`. Los artefactos desktop alpha6 son anteriores a V094-35 y no deben usarse para probar esta candidata. Alpha7 no está publicado; el bundle local incluye el runtime exacto y el preflight CHECK ONLY. Para probar, cierra FreeCode tú mismo y ejecuta explícitamente la precarga antes del setup; esta tarea no instaló ni inició FreeCode. La respuesta del proveedor público sigue sin verificarse. No se incluye tag, subida ni publicación.

Baseline: `v0.9.4 candidate`
Published baseline: `v0.9.3`

## Estrategia de ahorro de contexto / Context-efficiency strategy

| Capa / Layer | Estado / Status | Responsabilidad / Responsibility |
| --- | --- | --- |
| RTK (`rtk-ai/rtk`) | Disponible hoy, opcional / Available today, optional | Reduce la salida de comandos CLI elegibles antes de que entre al contexto del modelo. Si no existe el ejecutable, FreeCode vuelve al comando original. / Reduces eligible CLI output before it enters model context. If the executable is absent, FreeCode falls back to the original command. |
| Caveman (`JuliusBrussee/caveman`) | Integrado opcional, desactivado / Integrated optional, disabled | La tarjeta Shell expone un toggle independiente. Sólo envuelve comandos simples cuando el ejecutable ya está instalado; si falta, no cambia nada. / The Shell card exposes an independent toggle. It wraps simple commands only when the executable is already installed; if missing, it changes nothing. |

RTK y Caveman no están habilitados juntos por defecto: pueden ser complementarios, pero una doble compresión puede quitar información útil o dificultar la depuración.

RTK and Caveman are not enabled together by default: they may complement each other, but double compression can remove useful information or make debugging harder.

## En curso / In progress

### `v0.9.4` candidate — Model reliability, Tor and Gentle AI / Modelos, Tor y Gentle AI

**Status / Estado:** local candidate; unpublished / candidata local; sin publicar.

1. **Gateway / Gateway** — vendored opencode2api v1.4.0 with manual model
   persistence, transient probe recovery, stable identities and the fork's
   direct-first Tor policy.
2. **Tor / Tor** — SAFECOOKIE ControlPort, readiness gated on bootstrap 100%
   plus usable SOCKS, adaptive circuit timeouts and stable stream circuits;
   bounded diagnostics and async startup preserve the direct route on failure.
   The Tor-unavailable trace found a disposable-NSIS-profile leak: Chromium's
   `--user-data-dir` did not redirect Electron's APPDATA-based `userData`.
   Smoke now isolates all user profile/temp roots; Tor assets are hash-verified.
3. **Conversation / Conversación** — actual MIT Hermes Phoenix patterns now
   follow live work at 4x idle speed. Isolated Chromium verifies the production
   panel, pixels, resize and cleanup; installed alpha5 is unchanged. A fresh
   runtime version and passing global client typecheck/release gate remain
   prerequisites, not claims about the currently installed app.
4. **Agent selector / Selector de agentes** — Gentle AI restored as an explicit
   opt-in Web mode; Standard remains the default.
5. **Runtime integrity / Integridad runtime** — source pins DSH alpha7; the local alpha7 archive and checksum are verified, while the old alpha4/alpha6 caches cannot satisfy the current immutable pin. opencode2api version/SHA pins match the locally built artifacts, and absent optional PATH fallbacks remain optional.
6. **Model/Tor resilience / Resiliencia de modelos/Tor** — clear stale provider
   settings before DSH starts, use Muse Spark's minimum 16-token probe budget,
   and keep upstream 400/401/403 responses from cooling the anonymous Direct/Tor
   pool. HTTP 429, 5xx and transport failures still use cooldown. A real 401/403
   still requires valid upstream access.
7. **Release state / Estado de release** — v0.9.4 remains unpublished and v0.9.3 remains the latest release. The earlier alpha5/alpha6 desktop artifacts are superseded. The fresh non-interactive release gate passed; setup and portable were built into `apps/shell/release-0.9.4-alpha7-20261015/` and statically verified. Exact hashes are recorded in the bilingual release notes. The local bundle includes the matching alpha7 runtime and CHECK ONLY preflight. No installer was executed and no FreeCode GUI or user cache was touched. Alpha7 remains unpublished; local first launch requires the included explicit runtime preparation after the user closes FreeCode. Public-provider acceptance remains unverified; mocks do not prove it.

## Completado / Completed

### `v0.9.3` - Session recovery and release reliability / Recuperación de sesiones y fiabilidad de release

**Status / Estado:** published and working on Windows x64 / publicada y funcionando en Windows x64.

1. **Session history / Historial de sesiones** - semantically corrupt tails preserve the validated prefix as read-only, show bilingual diagnostics, and reject writes. / Las colas semánticamente corruptas conservan el prefijo validado en solo lectura, muestran diagnósticos bilingües y rechazan escrituras.
2. **Tool-call integrity / Integridad de llamadas** - malformed streamed identities are rejected before durable assistant/tool events. / Las identidades incompletas del stream se rechazan antes de persistir eventos assistant/tool.
3. **Runtime safety / Seguridad del runtime** - headless process launches are enforced, native ABI checks fail closed, unknown installed DSH versions do not appear as updates, the update control stays round, and archive extraction is asynchronous. / Se fuerzan lanzamientos headless, las comprobaciones ABI fallan de forma cerrada, las versiones DSH desconocidas no aparecen como updates, el control conserva su forma circular y la extracción es asíncrona.
4. **Windows x64 assets / Artefactos Windows x64** - the installed NSIS setup (~178.5 MB) was confirmed working; the portable package is ~178.2 MB (~169.9 MiB), built but not separately installation-tested. The pinned DSH `0.2.1-alpha.2` runtime remains a separate asset in v0.9.2. / El setup NSIS (~178,5 MB) se instaló y funciona; el portable pesa ~178,2 MB (~169,9 MiB), compilado pero no probado mediante instalación separada. El runtime DSH `0.2.1-alpha.2` sigue como asset separado en v0.9.2.

### `v0.9.2` — Runtime bootstrap and headless process windows / Bootstrap de runtime y ventanas headless

**Estado / Status:** completado y publicado / completed and released.

1. **Runtime separado** — el setup/portable no incluyen el runtime DSH; la
   primera ejecución sin caché válida valida el asset Windows x64 fijado en
   `0.2.1-alpha.2` y lo conserva por usuario para arranques offline.
2. **Sin ventanas de comandos** — la creación Win32 de procesos `pwsh` hijos
   usa el modo oculto; tests de regresión cubren la ruta ordinaria y la de
   token restringido.
3. **Updater y UI** — no se ofrecen runtimes DSH más viejos como actualización
   y el indicador de actualización mantiene forma circular.
4. **Tamaño** — setup ~178,5 MB y portable ~178,2 MB; el runtime descargable
   separado es ~421,6 MB.

### `v0.9.0` — Tor resilience + single model lane / Resiliencia Tor + lane único

**Estado / Status:** completado y publicado / completed and released.

1. **Tor único empaquetado** — `tor.exe` + `geoip`/`geoip6` en
   `resources/freecode/tor/`, `torrc` de nodos rápidos, SOCKS 9050 / control
   9051 en loopback, rotación `NEWNYM` desde el overlay. Reemplaza a
   Cloudflare WARP; `warfleet` y `torfleet` eliminados.
2. **Failover para opencode2api** — el gateway se lanza con
   `[direct, socks5://127.0.0.1:9050]`, iniciado antes del runtime y detenido
   en `before-quit`.
3. **Lane único** — el duplicado `opencode-free` se consolidó en
   `deepseek-free` (*OpenCode Free*); sin modelos repetidos en el selector.
4. **Seeder respeta al usuario** — no sobreescribe más el
   `agent-default-model` válido en cada arranque.
5. **Upstream correcto** — integración confirmada con
   `jasonxu114514/opencode2api` (`NOTICE` + tests de contrato).
6. **Limpieza** — claves i18n WARP, campos runtime muertos y comentarios
   obsoletos de freellmpool fuera del árbol.

### `v0.4.0` — Updater Fix + Caveman evaluation

**Estado / Status:** completado / completed.

1. **Caveman integration** — Se integró como feature modular opt-in en la tarjeta Shell; queda desactivado por defecto y el ejecutable sigue siendo externo.
2. **Updater fix** — Botón alineado con "Enviar", notificaciones en tray, instalación explícita.
3. **Spanish locale** — Verificado y documentado como funcional.
4. **Documentation** — CHANGELOG y ROADMAP actualizados.

### `v0.3.3` — Update UX follow-up / Seguimiento de experiencia de actualización

**Estado / Status:** completado dentro de v0.4.0 / completed in v0.4.0.

1. **Botón de actualizar alineado con Enviar** — Implementado en v0.4.0.
2. **Aviso visible durante la instalación** — Notification nativa en tray.
3. **Completar la instalación desde la app** — Download explícito + quitAndInstall(true).

## Próximas versiones / Upcoming versions

### `v0.3.3` — Update UX follow-up / Seguimiento de experiencia de actualización

Estado / Status: propuesta histórica, superseded by the implementation recorded
in `v0.4.0` and hardened again in `v0.6.0`; it is not an outstanding release
task.

Esta versión debe cerrar dos pendientes visibles del flujo de actualización:

1. **Botón de actualizar alineado con Enviar / Update button matching Send**
   - Historical proposal: the v0.6.0 implementation now uses the same 34px
     circular primary geometry, colors, hover state, and SVG path as the Send
     button, with the path rotated downward.
   - The accessible `Actualización disponible` / `Update available` label is
     retained as tooltip and screen-reader text.
   - El botón debe seguir apareciendo junto a Configuración, respetar el
     layout del sidebar y conservar el comportamiento actual de abrir el flujo
     de actualización al hacer clic.
   - No duplicar estilos divergentes: reutilizar los tokens o clases del botón
     de enviar cuando el frontend los exponga; si el shell debe mantener un
     documento aislado, reflejar esos mismos valores en una única constante o
     contrato visual probado.

2. **Aviso visible durante la instalación / Visible installation notice**
   - v0.6.0 now emits a native notification before downloading and keeps the
     tray tooltip/menu at `Descargando actualización…` / `Downloading update…`
     until the download promise settles; it changes to installing before the
     application restart.
   - Cubrir tanto la actualización completa de la aplicación
     (`downloadAndInstall`) como la actualización exclusiva del runtime del
     Harness (`installHarness`), para que ninguna ruta quede silenciosa cuando
     la ventana está oculta o minimizada en la tray.
   - Mantener el aviso visible durante la operación y emitir un resultado final
     inequívoco de éxito o error; los mensajes deben pasar por
     `apps/shell/src/main/i18n.ts` y conservar español, inglés y chino.
   - No iniciar una instalación automática nueva ni agregar workflows de
     GitHub: el aviso debe acompañar únicamente una actualización que el
     usuario ya confirmó.

3. **Completar la instalación desde la app / Complete in-app installation**
   - Corregir la etapa posterior a la descarga: en la prueba real de `v0.3.2`
     la app detectó la release y descargó correctamente el instalador, pero la
     versión instalada siguió siendo `0.3.1` y el instalador quedó en
     `@freecodeshell-updater/pending`.
   - Trazar y validar la cadena completa
     `downloadUpdate()` → cierre de Electron → lanzamiento del instalador NSIS
     → reinicio → versión nueva. No considerar la actualización exitosa sólo
     porque existe el archivo descargado.
   - Confirmar explícitamente el resultado de `quitAndInstall()` y registrar un
     error accionable si el instalador no se inicia, no obtiene permisos o no
     logra reemplazar la aplicación.
   - Después del reinicio, verificar que `install-version.txt` y la aplicación
     instalada indiquen la nueva versión, que el archivo pendiente se consuma y
     que se conserven la configuración, sesiones y datos del usuario.

   **Evidencia reproducida / Reproduced evidence:** el instalador de
   `0.3.2` quedó completo en `pending` y su SHA-512 coincidió con `latest.yml`,
   pero `install-version.txt` siguió indicando `0.3.1`; por lo tanto la
   descarga funciona y la instalación/reinicio no está demostrado ni
   funcionando de punta a punta.

**Criterios de aceptación / Acceptance criteria:**

- El botón de actualización se percibe como el mismo botón circular primario
  que Enviar y muestra una flecha descendente.
- Al iniciar cualquiera de las dos rutas de instalación aparece el aviso de
  actualización aun cuando la ventana principal esté en la tray.
- Una actualización completa iniciada desde la app termina con la nueva
  versión instalada y la app reiniciada; no queda el instalador atrapado en
  `pending` mientras la versión anterior sigue activa.
- Existen pruebas para la geometría/markup accesible del botón, las claves de
  traducción y las notificaciones de inicio, finalización y error.
- Se verifica manualmente Windows empaquetado: actualización desde la tray,
  ventana abierta, ventana oculta, descarga fallida y reinicio posterior.
- La documentación de release explica qué aviso verá el usuario y la
  publicación sigue siendo manual, sin workflows.

**Acceptance criteria (English):**

- The update control is the same circular primary button as Send and shows a
  downward arrow.
- Starting either installation route shows the updating notice even when the
  main window is hidden in the tray.
- A full update started from the app finishes with the new version installed
  and the app restarted; the installer is not left in `pending` while the old
  version remains active.
- Tests cover accessible button markup/geometry, translation keys, and start,
  success, and failure notifications.
- Packaged Windows is manually checked from the tray, with the window open,
  with the window hidden, on a failed download, and after restart.
- Release documentation explains the user-visible notice and publication
  remains manual, with no workflows.

### `v0.2.2` — Released reliability and maintenance / Confiabilidad y mantenimiento publicado

- Se consolidaron retries acotados, resiliencia de streams y estados de error accionables.
- Se reforzó la frontera headless de tool-calling; ConPTY evita ventanas de consola visibles y sólo el selector de proyecto conserva GUI intencional.
- El diagnóstico del Free Pool conserva la última selección válida durante el calentamiento y no convierte límites externos en errores de API key.
- RTK sigue siendo opcional, sin descarga ni instalación desde FreeCode.
- El navegador Chromium persistente ahora despacha Enter/Ir, normaliza hosts HTTPS y deja que el texto del Harness se reacomode al abrir el panel.
- Los contratos, tests y documentación bilingüe quedaron alineados con `v0.2.2`.

- Bounded retries, stream resilience, and actionable error states were consolidated.
- The headless tool-calling boundary was reinforced; ConPTY prevents visible console windows and only the project selector retains intentional GUI.
- Free Pool diagnostics preserve the last known-good selection during warm-up and do not turn external limits into API-key errors.
- RTK remains optional; FreeCode does not download or install it.
- The persistent Chromium browser now dispatches Enter/Go, normalizes HTTPS hosts, and lets Harness text reflow when the panel opens.
- Contracts, tests, and bilingual documentation are aligned with `v0.2.2`.

### `v0.3.0` — Caveman spike / Evaluación de Caveman

Esta versión debe empezar como una prueba aislada y opt-in, no como una dependencia obligatoria ni una instalación automática.

1. Definir un adaptador local entre el harness y Caveman sin alterar el protocolo de herramientas ni el contenido original.
2. Medir cuatro escenarios: baseline, RTK solo, Caveman solo y RTK+Caveman.
3. Medir tokens estimados, latencia, fidelidad de decisiones, tamaño de almacenamiento y recuperación del dato original.
4. Probar Windows empaquetado, sesiones largas, reconexión de stream, cambio a modelos de menor contexto y ausencia del ejecutable.
5. Exponer el modo elegido de forma visible en configuración; el valor inicial debe ser desactivado hasta completar la evaluación.

**Gate para avanzar / Advancement gate:** no se integra si no puede fallar de forma segura, recuperar el original, conservar secretos fuera de los logs, funcionar sin red adicional y demostrar una mejora medible sin degradar las herramientas.

La evaluación toma como referencia el [repositorio de Caveman](https://github.com/JuliusBrussee/caveman) y su [documentación del engine](https://github.com/JuliusBrussee/caveman/blob/main/engine/README.md). Esa documentación describe recuperación local del contenido original y aclara que sus estimaciones locales no equivalen por sí mismas a ahorro verificado del proveedor. También se debe revisar la licencia del engine antes de distribuirlo dentro de un instalador.

The evaluation uses the [Caveman repository](https://github.com/JuliusBrussee/caveman) and its [engine documentation](https://github.com/JuliusBrussee/caveman/blob/main/engine/README.md) as references. That documentation describes local recovery of original content and makes clear that its local estimates are not, by themselves, verified provider savings. The engine license must also be reviewed before distributing it inside an installer.

### `v0.4.0` — Recoverable context compression / Compresión recuperable de contexto

Sólo si `v0.3.0` supera el gate:

- Integrar una interfaz local versionada, con límites de tamaño, almacenamiento recuperable y comportamiento fail-closed.
- Añadir toggle independiente para RTK y Caveman, con explicación de qué datos se transforman y cómo recuperar el original.
- Conectar la compresión con el compactado automático al 75% del contexto activo, sin compactar dos veces el mismo bloque.
- Agregar pruebas de contratos para tool calls, streams, sesiones persistentes, cambio de modelo y apagado de la aplicación.
- Documentar claramente qué se incluye en los binarios y qué sigue siendo una herramienta externa opcional.

Only if `v0.3.0` passes its gate:

- Integrate a versioned local interface with size limits, recoverable storage, and fail-closed behavior.
- Add independent RTK and Caveman toggles explaining what data is transformed and how to recover the original.
- Connect compression to automatic compaction at 75% of the active context, without compacting the same block twice.
- Add contract tests for tool calls, streams, persistent sessions, model changes, and application shutdown.
- Document exactly what is included in the binaries and what remains an optional external tool.

### Después / Later

- Revaluar perfiles específicos para el Free Pool sólo con datos reales de latencia y límites de sesión.
- Mantener sincronización selectiva con upstream, evitando incorporar cambios que reabran regresiones ya corregidas.
- Considerar soporte multiplataforma únicamente cuando el empaquetado y la recuperación local tengan contratos equivalentes.

## Criterio de release / Release criterion

Una versión no se considera lista por tener una integración funcional en una máquina de desarrollo. Debe pasar pruebas locales relevantes, revisión de documentación bilingüe, `git diff --check`, escaneo de secretos, verificación de artefactos y una prueba manual del instalador; la publicación sigue siendo manual.

A version is not considered ready merely because an integration works on one development machine. It must pass relevant local tests, bilingual documentation review, `git diff --check`, secret scanning, artifact verification, and a manual installer check; publishing remains manual.
