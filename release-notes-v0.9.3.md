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

### Distribution

v0.9.3 is published for Windows x64 with NSIS setup (~178.5 MB) and a portable
package (~178.2 MB / 169.9 MiB).
The pinned DSH `0.2.1-alpha.2` runtime remains a separate download from the
v0.9.2 release and is fetched only when required.

Final asset verification: setup 178,543,845 bytes, SHA-256
`53dfde329731d19081204a82bbbafc4678f4c81b4588a22884ef49064f400cd5`; portable
178,169,861 bytes, SHA-256
`830eba7ca48d2ee56d2272dfa1d2d23684f5cc7507db55d7617dbc6ed8cd12d3`.

### Verification status

Focused regression suites, shell preflight, shell build and Windows packaging
passed. The full vendor composite build still reports unrelated existing
TypeScript errors in `packages/llm/llm`. The user confirmed the installed NSIS
setup works on Windows x64; the portable executable was built but not separately
installation-tested. Windows x64 is the only supported release target.

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

### Distribución

v0.9.3 está publicada para Windows x64 con setup NSIS (~178,5 MB) y portable
(~178,2 MB / 169,9 MiB). El runtime
DSH fijado en `0.2.1-alpha.2` sigue siendo una descarga separada desde la
release v0.9.2 y se baja solo cuando hace falta.

Verificación de artefactos finales: setup 178.543.845 bytes, SHA-256
`53dfde329731d19081204a82bbbafc4678f4c81b4588a22884ef49064f400cd5`; portable
178.169.861 bytes, SHA-256
`830eba7ca48d2ee56d2272dfa1d2d23684f5cc7507db55d7617dbc6ed8cd12d3`.

### Estado de verificación

Pasaron las suites de regresión focalizadas, el preflight del shell, el build
del shell y el empaquetado Windows. El build compuesto completo del vendor sigue
mostrando errores TypeScript preexistentes y ajenos en `packages/llm/llm`. El
usuario confirmó que el setup instalado funciona en Windows x64; el ejecutable
portable se compiló pero no se probó mediante una instalación por separado.
Windows x64 es el único target soportado.
