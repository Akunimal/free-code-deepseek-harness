# FreeCode DeepSeek Harness v0.9.3 — Release notes / Notas de la release

## English

### Reliability and session recovery

- Malformed provider tool-call identities are rejected before they can become
  durable assistant/tool events.
- A raw or Zstandard session log with a semantically invalid suffix now opens
  read-only at its validated history prefix and reports the first invalid
  sequence and discarded-row count. The original log is not rewritten, and
  write-open is refused until recovery is handled explicitly.

### Safer updates and native runtime checks

- An unknown installed DSH runtime version no longer appears as an available
  update; the exact-version first-run bootstrap remains separate.
- The update control's embedded surface is transparent, preserving its round
  shape. Upstream update checks have a deadline, and runtime archive extraction
  runs asynchronously rather than blocking Electron's main thread.
- Native ABI checks fail closed for host-applicable addon load errors and
  explicitly skip foreign-target prebuilds.

### Verification status

Focused regression suites and package-scoped typechecks passed. The full
composite build still reports unrelated existing TypeScript errors in
`packages/llm/llm`. Setup and portable packages have not been built, the app has
not been installed, and no v0.9.3 tag or release has been created. v0.9.2
remains the latest published release.

## Español

### Confiabilidad y recuperación de sesiones

- Las identidades incompletas de llamadas a herramientas del proveedor se
  rechazan antes de convertirse en eventos assistant/tool persistentes.
- Un log de sesión raw o Zstandard con un sufijo semánticamente inválido ahora
  abre en modo de solo lectura y muestra el prefijo de historial validado, la
  primera secuencia inválida y cuántos registros se descartaron. El log
  original no se reescribe y se rechaza abrirlo para escritura hasta gestionar
  explícitamente la recuperación.

### Updates más seguros y validación del runtime nativo

- Una versión desconocida del runtime DSH instalado ya no aparece como un
  update disponible; el bootstrap inicial de versión exacta sigue separado.
- La superficie embebida del indicador es transparente para conservar su
  forma redonda. Las consultas de updates tienen límite y la extracción del
  runtime se ejecuta en segundo plano, sin bloquear el hilo principal de
  Electron.
- La comprobación de ABI falla de forma cerrada ante errores de carga de addons
  aplicables al host y omite explícitamente prebuilds de otros targets.

### Estado de verificación

Pasaron las suites de regresión focalizadas y los typechecks por paquete. El
build compuesto completo sigue mostrando errores TypeScript preexistentes y
ajenos en `packages/llm/llm`. Todavía no se compilaron setup ni portable, no se
instaló la app y no se creó tag ni release v0.9.3. v0.9.2 sigue siendo la
última release publicada.
