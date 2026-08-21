# Estado de traspaso — FreeCode DeepSeek Harness

Fecha: **2026-08-21**
Workspace: `I:\DeepSeek-Harness\free-code-deepseek-harness`
Rama: `main`

## Release v0.1.7 — NSIS hardening multi-parche (Win11 25H2)

Fix del instalador NSIS en Windows 11 25H2/24H2: 4 parches al hook `beforePack` + fix de `reasoning: 'high'` que provocaba `UNSUPPORTED_REASONING_EFFORT` en modelos no-DeepSeek.

### Fixes incluidos

1. **patchAppRunningCheck** — reemplaza el chequeo de proceso `nsProcess`/`tasklist` por `taskkill /F /IM` silencioso: Win11 25H2 produce falsos positivos en `FIND_PROCESS` que bloquean la instalación.
2. **patchUninstallOldVersion** — el desinstalador viejo (de una instalación previa) falla con exit code ≠ 0 en Win11 25H2 → `handleUninstallResult` aborta ANTES de extraer archivos nuevos. Fix: matar app, correr uninstaller una vez, ignorar exit code (`StrCpy $R0 0`).
3. **patchExtractAppPackage** — cuando `CopyFiles` falla tras 5 reintentos, el template muestra un diálogo `appCannotBeClosed` que bloquea. Patch: eliminar diálogo + label abort, dejar caer al extract no-atómico.
4. **patchMultiUser** — (ya existía) elimina `SHGetKnownFolderPath` crash en Win11 24H2/25H2.
5. **installer.nsh** — `customCheckAppRunning` macro ahora ejecuta `taskkill /F /IM` en vez de estar vacía.
6. **provider-seeder: reasoning** — eliminado `reasoning: 'high'` a nivel de provider (causaba `UNSUPPORTED_REASONING_EFFORT` en modelos que no lo soportan); `model-refresher.ts` setea `reasoningEfforts` per-model solo para `deepseek-*`.

### Modelo default

- Provider: `deepseek-free` (LB → opencode2api pool round-robin → TorFleet)
- Model: `nemotron-3.5-lightning` (fastest responding)
- `deepseek-v4-flash` — con TorFleet activo vuelve a responder (antes moría por cuota/rate limit)

### Pendiente futuro

- [ ] Probar manualmente en macOS/Linux además de la matriz CI
- [ ] TorFleet: si opencode.ai bloquea el ASN de exits Tor, migrar a Oracle Free + SSH

---

## Release v0.1.5 — pool con rotación Tor (TorFleet) (historial)

Fix de los 429 persistentes del tier free anónimo (`opencode.ai/zen`, `Bearer public` → cuota por IP/sesión): el pool (16 workers + LB) ahora rota las IPs de salida con una flota local de 4 instancias Tor configurada solo desde el `config.json` del pool (sin cambios de código; el config es runtime y está en .gitignore).

### Fixes incluidos

1. **TorFleet (Fase 2)** — 4 instancias `tor.exe` (Tor Expert bundle): `SocksPort 127.0.0.1:9150–9153`, `ControlPort 127.0.0.1:9251–9254`, DataDirectory/log propios por instancia; arranque headless con `start-tor.cmd` (`start "" /B`), bajo demanda antes de usar el pool.
2. **Round-robin de salida** — `socks5_proxies` ×4 + `active_socks5: "__round_robin__"`: cada request sale por un exit Tor distinto; `socks5_paid_direct: true` mantiene las claves privadas por la ruta directa (límites de cuenta intactos).
3. **Rotación on-demand** — helper `newnym.py` (ControlPort): `AUTHENTICATE` → `SIGNAL NEWNYM` → `QUIT` fuerza circuito nuevo en ~8 s.
4. **Verificado** — 4/4 exits Tor distintos devuelven 200 contra `opencode.ai/zen` (Cloudflare no bloquea Tor hoy); E2E completo por LB (chat 200, con conexiones worker→Tor establecidas); overhead +0.8–1.8 s/request.
5. **Fix instalador NSIS "no se puede cerrar"** — `build/installer.nsh` con macro `customCheckAppRunning` vacía: el chequeo de proceso de electron-builder 25.x (`nsProcess`/`tasklist | find`) produce falsos positivos en Win11 25H2 y bloquea la instalación incluso sin app corriendo. El override saltea el check. Documentado como known issue.

### Modelo default

- Provider: `deepseek-free` (LB → opencode2api pool round-robin → TorFleet)
- Model: `nemotron-3.5-lightning` (fastest responding)
- `deepseek-v4-flash` — con TorFleet activo **vuelve a responder** (antes moría por cuota/rate limit de la IP hogareña)
- `llm-deepseek` (built-in `deepseek-official`) no tocado — funciona si el usuario pone su DEEPSEEK_API_KEY

### Pendiente futuro

- [ ] Probar manualmente en macOS/Linux además de la matriz CI
- [ ] TorFleet: si opencode.ai bloquea el ASN de exits Tor, migrar la rotación a Oracle Free + SSH (SOCKS vía `ssh -D`)

---

## Release v0.1.4 — listo para publicar (historial)

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
