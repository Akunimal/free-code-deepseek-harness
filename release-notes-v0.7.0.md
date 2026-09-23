# FreeCode DeepSeek Harness 0.7.0 — Release notes / Notas de la release

## English

0.7.0 is a corrective Windows release: slimmer installer, a second no-auth
model lane with strict health-gating, no renderer popups, and a fully green
test suite (165/165).

### What is new

- **OpenCode No-Auth lane** (`opencode-free`): the bundled opencode2api v1.3.2
  gateway exposes OpenCode's anonymous free models next to the FreeLLMPool
  pool in the model selector — no keys, no login.
- **Strict 200-only exposure**: every advertised anonymous model is probed
  with a real chat completion and only responders reach the selector. Dead
  models (429/502 upstream) are hidden instead of offered; the lane
  self-heals within minutes of quota recovery.
- **Slimmer installer**: the dsh runtime stage drops dev-only weight
  (provider SDKs, docs/test/bundler tooling, non-Windows prebuilds):
  setup **559 MB → ~300 MB**, payload 2.2 GB → ~1 GB.
- **No popup windows**: the harness view denies `window.open`, and a
  window-registry backstop destroys any native window outside
  splash/main/overlay. Native dialogs and notifications are unaffected.
- **MCP hardening**: servers whose command cannot spawn start disabled
  instead of burning the reconnect budget (free-search stays off until its
  binary is vendored); the Serena launcher override applies only when the
  launcher file and a uvx command both exist.
- **Reliability fixes**: System32-pinned `tar` (msys GNU tar misparses
  native paths), native-addon ABI gate before packaging, full runtime
  dependency hash verification.
- Verified on a clean install: `harness ready`, both model lanes populated,
  graceful shutdown.

### Assets

| File | Purpose |
|---|---|
| `FreeCode-DeepSeek-Harness-0.7.0-win-x64-setup.exe` | NSIS installer (~300 MB) |
| `FreeCode-DeepSeek-Harness-0.7.0-win-x64-setup.exe.blockmap` | Differential-update blockmap |
| `FreeCode-DeepSeek-Harness-0.7.0-win-x64-portable.exe` | Portable executable (~300 MB) |
| `latest.yml` | electron-updater metadata |
| `deepseek-harness-runtime-0.1.3-alpha.1-win32-x64.tar.gz` (+`.sha256`) | Harness runtime for in-app updates |

### Install notes

Unpacking writes ~69,000 files and takes around 10 minutes on a typical
machine — this is normal, not a hang. No administrator rights needed, no
`PATH` changes, no console windows.

### Platform support — read this / leer esto

- **Tested: Windows 10/11 x64 ONLY** (maintainer machine: clean install,
  launch, `harness ready`, both model lanes, shutdown).
- **NOT tested and NOT supported in 0.7.0**: Windows ARM64, Linux (any
  distribution/architecture), macOS (any architecture). No artifacts are
  published for these platforms; contributor builds for them exist but were
  not tested by the maintainer and must not be treated as usable releases.

### Known limitations

- The anonymous lane depends on shared upstream quota (opencode.ai): during
  congestion it offers few models or hides until recovery. External limit,
  not an app defect.
- `free-search` stays disabled until its binary is vendored; Serena runs
  through the packaged launcher.
- RTK/Caveman remain optional PATH-resolved helpers, not bundled binaries.
- Isolated transient-window reports are still welcome (title/content of the
  flashing window); the backstop now logs every destroyed popup.

## Español

0.7.0 es una release correctiva de Windows: instalador más liviano, segundo
lane de modelos no-auth con gating estricto de salud, cero popups y suite
de tests totalmente en verde (165/165).

### Novedades

- **Lane OpenCode No-Auth** (`opencode-free`): el gateway opencode2api v1.3.2
  incluido expone los modelos gratuitos anónimos de OpenCode junto al pool
  FreeLLMPool en el selector — sin keys, sin login.
- **Exposición estricta solo-200**: cada modelo anunciado se prueba con un
  chat real y solo los que responden llegan al selector. Los muertos
  (429/502 del upstream) se ocultan; el lane se recupera solo minutos
  después de que vuelve la cuota.
- **Instalador más liviano**: el stage del runtime dsh elimina peso
  dev-only (SDKs de providers, tooling de docs/tests/build, prebuilds de
  otros SO): setup **559 MB → ~300 MB**, payload 2,2 GB → ~1 GB.
- **Cero ventanas popup**: la vista del harness deniega `window.open`, y un
  backstop destruye cualquier ventana nativa fuera de
  splash/main/overlay. Diálogos nativos y notificaciones no se afectan.
- **Endurecimiento MCP**: los servidores cuyo comando no puede ejecutarse
  arrancan deshabilitados en vez de quemar el presupuesto de reconexión
  (free-search queda apagado hasta que se empaquete su binario); el override
  del launcher de Serena aplica solo si existen el archivo y un comando uvx.
- **Fixes de confiabilidad**: `tar` pineado a System32 (el GNU de
  Git-for-Windows malinterpreta rutas nativas), gate de ABI de addons
  nativos antes de empaquetar, verificación completa de hashes del runtime.
- Verificado en instalación limpia: `harness ready`, los dos lanes con
  modelos, apagado limpio.

### Assets

| Archivo | Propósito |
|---|---|
| `FreeCode-DeepSeek-Harness-0.7.0-win-x64-setup.exe` | Instalador NSIS (~300 MB) |
| `FreeCode-DeepSeek-Harness-0.7.0-win-x64-setup.exe.blockmap` | Blockmap para updates diferenciales |
| `FreeCode-DeepSeek-Harness-0.7.0-win-x64-portable.exe` | Ejecutable portable (~300 MB) |
| `latest.yml` | Metadata de electron-updater |
| `deepseek-harness-runtime-0.1.3-alpha.1-win32-x64.tar.gz` (+`.sha256`) | Runtime del Harness para updates in-app |

### Notas de instalación

Desempaquetar escribe ~69.000 archivos y tarda unos 10 minutos en una
máquina típica — es normal, no es un cuelgue. Sin derechos de administrador,
sin cambios a `PATH`, sin consolas.

### Soporte de plataformas — leer esto / read this

- **Probado: solo Windows 10/11 x64** (máquina del mantenedor:
  instalación limpia, arranque, `harness ready`, los dos lanes, apagado).
- **NO probado y NO soportado en 0.7.0**: Windows ARM64, Linux (cualquier
  distribución/arquitectura), macOS (cualquier arquitectura). No se
  publican artefactos para estas plataformas; los builds de contribuidores
  existen pero no fueron probados por el mantenedor y no deben tratarse
  como releases utilizables.

### Limitaciones conocidas

- El lane anónimo depende de cuota compartida del upstream (opencode.ai):
  con congestión ofrece pocos modelos o se oculta hasta recuperarse.
  Límite externo, no defecto de la app.
- `free-search` queda deshabilitado hasta empaquetar su binario; Serena
  corre con el launcher incluido.
- RTK/Caveman siguen como helpers opcionales por PATH, no empaquetados.
- Reportes aislados de ventanas transitorias siguen bienvenidos
  (título/contenido de la ventana); el backstop ya loguea cada popup
  destruido.
