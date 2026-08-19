# Estado de traspaso — FreeCode DeepSeek Harness

Fecha: **2026-08-19**
Workspace: `I:\DeepSeek-Harness\free-code-deepseek-harness`
Rama: `main`

## Release v0.1.4 — listo para publicar

Preflight local verificado: locale, typecheck, contratos, frontend y compatibilidad Go del proxy. El empaquetado Electron final queda a cargo del workflow reproducible; la materialización local del runtime fue detenida por su costo de I/O en Windows.

### Fixes incluidos

1. **Preload sandbox crash** — inlined IpcChannels, `import type` only. Bundle 123KB→1.5KB. Sin Zod.
2. **Screen flickering** — `app.disableHardwareAcceleration()` re-added (crash era del preload, no del GPU switch).
3. **Directory picker crash** — koffi NAPI incompatible con `ELECTRON_RUN_AS_NODE`. Fallback a wscript+BrowseForFolder VBScript.
4. **Default provider** — seeder auto-configura `deepseek-free` (LB pool) como provider default. Corrige `agent-default-model` en cada boot si apunta a ruta inexistente.
5. **Whale icon** — 512px PNG + multi-size ICO + 64px tray icon.
6. **Pool overlay** — live updates via `onStatus` IPC, close button, draggable frameless window.
7. **i18n** — shell detecta idioma del sistema (ES/EN), menús/diálogos/overlay traducidos.
8. **Splash screen** — pantalla de carga durante startup del harness.
9. **Harness supervisor** — logging mejorado, stderr/timeout/exit loggeados.
10. **Build scripts** — `supportedArchitectures` multi-target, native binary assertions, Git Bash pinning.
11. **Workspaces** — New Session crea una sesión distinta desde una sesión vacía; borrar workspace archiva sus sesiones sin perder carpeta, logs ni live sessions.
12. **Update check** — compatibilidad con las dos formas de exportar `electron-updater`; el menú ya no falla con `autoDownload` indefinido.
13. **Reasoning selector** — modelos DeepSeek del pool mantienen las opciones de esfuerzo de razonamiento al refrescar el catálogo.
14. **Español upstream** — el selector existente de Configuración ahora ofrece `Español`; los catálogos de la UI upstream quedaron traducidos y registrados en `zh/en/es`.
15. **Idioma inicial seguro** — si el navegador no informa `zh`, `en` ni `es`, la aplicación inicia en inglés en lugar de chino; una elección explícita se respeta.
16. **Rol `developer` compatible** — el proxy convierte `developer` a `system` antes de enviar Chat Completions a DeepSeek, que no acepta ese rol.
17. **Tool calls headless en Windows** — el subprocess local aplica `windowsHide` a los comandos de herramientas y a `taskkill`, evitando ventanas de PowerShell/sandbox durante la ejecución.

### Modelo default

- Provider: `deepseek-free` (LB → opencode2api pool round-robin)
- Model: `nemotron-3.5-lightning` (fastest responding)
- `deepseek-v4-flash` listado por opencode2api pero no responde (cuota/rate limit)
- `llm-deepseek` (built-in `deepseek-official`) no tocado — funciona si el usuario pone su DEEPSEEK_API_KEY

### Pendiente futuro

- [ ] Probar manualmente en macOS/Linux además de la matriz CI
