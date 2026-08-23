# Roadmap / Hoja de ruta

Última revisión / Last reviewed: 2026-08-23  
Baseline: `v0.2.1`  
Estado / Status: objetivos sujetos a validación; no son fechas ni promesas de release.

FreeCode mantiene los workflows de publicación manuales para no consumir cuota gratuita de GitHub. Cada versión se publica sólo después de pasar sus contratos, pruebas relevantes y una revisión del instalador.

FreeCode keeps release workflows manual so they do not consume GitHub free quota. A version ships only after its contracts, relevant tests, and installer review pass.

## Estrategia de ahorro de contexto / Context-efficiency strategy

| Capa / Layer | Estado / Status | Responsabilidad / Responsibility |
| --- | --- | --- |
| RTK (`rtk-ai/rtk`) | Disponible hoy, opcional / Available today, optional | Reduce la salida de comandos CLI elegibles antes de que entre al contexto del modelo. Si no existe el ejecutable, FreeCode vuelve al comando original. / Reduces eligible CLI output before it enters model context. If the executable is absent, FreeCode falls back to the original command. |
| Caveman (`JuliusBrussee/caveman`) | En evaluación, no integrado / Under evaluation, not integrated | Posible compresión de respuestas y/o contexto local con recuperación del original, detrás de un adaptador explícito. / Possible response and/or local-context compression with original-data recovery, behind an explicit adapter. |

RTK y Caveman no deben activarse juntos por defecto: pueden ser complementarios, pero una doble compresión puede quitar información útil o dificultar la depuración. La decisión se tomará con mediciones locales de fidelidad, latencia, almacenamiento y tokens; no se tomarán como garantía de ahorro en la factura las cifras publicadas por terceros.

RTK and Caveman must not be enabled together by default: they may complement each other, but double compression can remove useful information or make debugging harder. The decision will use local measurements of fidelity, latency, storage, and tokens; third-party savings figures will not be treated as billing guarantees.

## Próximas versiones / Upcoming versions

### `v0.2.2` — Reliability and maintenance / Confiabilidad y mantenimiento

- Consolidar la resiliencia de streams, retries acotados y estados de error accionables.
- Mantener todas las ventanas de herramientas headless salvo el selector de proyecto y agregar una prueba de regresión para esa frontera.
- Mejorar el diagnóstico del Free Pool sin convertir una caída del proveedor o un límite de IP en un error de API key.
- Mantener RTK opcional, sin descargarlo ni instalarlo desde FreeCode.
- Revisar documentación y contratos sin cambiar el comportamiento estable de `v0.2.1`.

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
