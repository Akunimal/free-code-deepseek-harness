# Roadmap / Hoja de ruta

Última revisión / Last reviewed: 2026-08-29
Baseline: `v0.4.0`
Estado / Status: objetivos sujetos a validación; no son fechas ni promesas de release.

FreeCode mantiene los workflows de publicación manuales para no consumir cuota gratuita de GitHub. Cada versión se publica sólo después de pasar sus contratos, pruebas relevantes y una revisión del instalador.

FreeCode keeps release workflows manual so they do not consume GitHub free quota. A version ships only after its contracts, relevant tests, and installer review pass.

## Estrategia de ahorro de contexto / Context-efficiency strategy

| Capa / Layer | Estado / Status | Responsabilidad / Responsibility |
| --- | --- | --- |
| RTK (`rtk-ai/rtk`) | Disponible hoy, opcional / Available today, optional | Reduce la salida de comandos CLI elegibles antes de que entre al contexto del modelo. Si no existe el ejecutable, FreeCode vuelve al comando original. / Reduces eligible CLI output before it enters model context. If the executable is absent, FreeCode falls back to the original command. |
| Caveman (`JuliusBrussee/caveman`) | Integrado, deshabilitado por defecto / Integrated, disabled by default | Compresión de contexto de comandos para ahorro de tokens. Requiere Caveman instalado por separado. / Command output context compression for token savings. Requires Caveman installed separately. |

RTK y Caveman no están habilitados juntos por defecto: pueden ser complementarios, pero una doble compresión puede quitar información útil o dificultar la depuración.

RTK and Caveman are not enabled together by default: they may complement each other, but double compression can remove useful information or make debugging harder.

## Completado / Completed

### `v0.4.0` — Caveman + Updater Fix

**Estado / Status:** completado / completed.

1. **Caveman integration** — Toggle opcional en Shell settings junto a RTK. Default OFF.
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

Estado / Status: planificado; no implementado en `v0.3.2`.

Esta versión debe cerrar dos pendientes visibles del flujo de actualización:

1. **Botón de actualizar alineado con Enviar / Update button matching Send**
   - Reemplazar el indicador circular independiente de
     `apps/shell/src/main/index.ts` (`renderUpdateIndicatorHtml`) por un botón
     con la misma geometría, fondo, borde, estados hover/active y jerarquía
     visual que el botón de enviar mensaje del Harness.
   - Mantener la flecha hacia abajo como único icono y conservar el texto
     accesible `Actualización disponible` / `Update available` para tooltip y
     lectores de pantalla.
   - El botón debe seguir apareciendo junto a Configuración, respetar el
     layout del sidebar y conservar el comportamiento actual de abrir el flujo
     de actualización al hacer clic.
   - No duplicar estilos divergentes: reutilizar los tokens o clases del botón
     de enviar cuando el frontend los exponga; si el shell debe mantener un
     documento aislado, reflejar esos mismos valores en una única constante o
     contrato visual probado.

2. **Aviso visible durante la instalación / Visible installation notice**
   - Antes de comenzar la descarga o instalación, emitir desde el proceso
     principal una notificación nativa asociada a la tray con un mensaje claro:
     `FreeCode se está actualizando` / `FreeCode is updating`.
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

- El botón de actualización se percibe como parte del mismo sistema visual que
  Enviar y muestra una flecha descendente, sin el círculo usado en `v0.3.2`.
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

- The update control uses the same visual system as Send and shows a downward
  arrow, without the circular control shipped in `v0.3.2`.
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
