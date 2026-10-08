# FreeCode DeepSeek Harness 0.9.1 — Release Notes / Notas de la release

## English

### What is new

- **opencode2api v1.3.2 → v1.3.5** — vendored source refreshed (phantom `tool_use` demotion, agent-shaped free-tier bodies, prompt-cache affinity, configurable reasoning effort, SystemOne endpoint); all four platform binaries rebuilt from source.
- **Direct-first Tor failover** — the anonymous lane always starts on `direct`; any non-2xx advances to Tor inside the same gateway request, and 401/403/429/5xx cools the sick proxy until recovery. Stable circuits (`MaxCircuitDirtiness` 600s, was 30s).
- **Strict 200-only selector** — `deepseek-free` syncs only probed responders; with zero responders the list is erased instead of keeping stale models, and bounded refresh retries repopulate it on recovery.
- **Reasoning selector for every advertised thinking model** — the refresher reads the gateway `reasoning` metadata and offers off/low/high where advertised (verified live); unknown models stay conservative.
- **Tor overlay rebuilt** — fleet-era pool controls removed; persistent DIRECT/TOR route pill plus an always-visible green-glow Tor on/off button, rotate with cooldown, live details. New `tor:start`/`tor:stop` IPC.
- **Tor pill in the composer bar** — bare `TOR` token as the first composer seat: electric-blue breathing glow while Tor is on, flat gray on direct. Click toggles the daemon.
- **No more console flashes** — node-pty's ConPTY cleanup agent runs hidden, and model-issued `Start-Process` defaults to a hidden window.
- **Standard preset is always the default** (explicit Gentle AI opt-in); harness view bounds re-sync on display changes.

### Assets

| File | Purpose |
|------|---------|
| `FreeCode-DeepSeek-Harness-0.9.1-win-x64-setup.exe` | NSIS installer (~304 MB) |
| `FreeCode-DeepSeek-Harness-0.9.1-win-x64-portable.exe` | Portable executable (~304 MB) |
| `deepseek-harness-runtime-0.1.3-alpha.1-win32-x64.tar.gz` (+`.sha256`) | Harness runtime for in-app updates |
| `latest.yml` | electron-updater metadata |

### Install notes

Unpacking writes ~69,000 files and takes around 10 minutes on a typical machine — this is normal, not a hang. No administrator rights needed, no `PATH` changes. Tor runs as a local child process on `127.0.0.1:9050` (SOCKS) and `127.0.0.1:9051` (control), bound to localhost only. Upgrading keeps your data; a stale drive-relative install path is reset to the default automatically.

### Platform support — read this / leer esto

- **Tested: Windows 10/11 x64 ONLY** (maintainer machine: clean install, launch, `harness ready`, Tor listening, single model lane, shutdown).
- **NOT tested and NOT supported in 0.9.1**: Windows ARM64, Linux (any distribution/architecture), macOS (any architecture). No artifacts are published for these platforms; contributor builds for them exist but were not tested by the maintainer and must not be treated as usable releases.

### Known limitations

- The anonymous lane depends on shared upstream quota (opencode.ai): during congestion it offers few models or hides until recovery. External limit, not an app defect.
- Tor adds a hop for failover traffic; the direct route remains preferred, so normal latency is unchanged.
- `free-search` stays disabled until its binary is vendored.
- RTK/Caveman remain optional PATH-resolved helpers, not bundled binaries.
- Upstream `jasonxu114514/opencode2api` declares no license; `NOTICE` records its provenance honestly instead of claiming MIT.

---

## Español

### Novedades

- **opencode2api v1.3.2 → v1.3.5** — fuente actualizada y los cuatro binarios reconstruidos desde el vendor.
- **Directo primero, Tor de failover** — el lane anónimo siempre arranca por directo; cualquier no-2xx pasa a Tor en el mismo request. Circuitos estables (600s).
- **Selector estrictamente 200** — `deepseek-free` solo muestra modelos que responden; con cero respuestas la lista se vacía y se repuebla al recuperarse.
- **Selector de esfuerzo para todos los modelos con thinking** — el refresher lee la metadata del gateway y ofrece off/low/high donde corresponde.
- **Overlay de Tor reconstruido** — sin controles de fleet; pill DIRECTA/TOR persistente, botón encender/apagar siempre visible con glow verde, rotación con cooldown. Nuevos canales `tor:start`/`tor:stop`.
- **Pill TOR en la barra del composer** — token `TOR` sin contenedor: azul eléctrico respirando con Tor activo, gris en directo. Click para alternar.
- **Sin más flashes de consola** — el agente de limpieza ConPTY va oculto y `Start-Process` del modelo hereda ventana oculta.
- **Estándar siempre por defecto** (Gentle AI solo opt-in); re-sincronía de bounds ante cambios de display.

### Activos

| Archivo | Propósito |
|---------|-----------|
| `FreeCode-DeepSeek-Harness-0.9.1-win-x64-setup.exe` | Instalador NSIS (~304 MB) |
| `FreeCode-DeepSeek-Harness-0.9.1-win-x64-portable.exe` | Ejecutable portable (~304 MB) |
| `deepseek-harness-runtime-0.1.3-alpha.1-win32-x64.tar.gz` (+`.sha256`) | Runtime del Harness para actualizaciones in-app |
| `latest.yml` | Metadata de electron-updater |

### Notas de instalación

Desempaquetar escribe ~69.000 archivos y tarda unos 10 minutos en una máquina típica — es normal, no es un cuelgue. Sin derechos de administrador, sin cambios a `PATH`. Tor corre como proceso hijo local en `127.0.0.1:9050` (SOCKS) y `127.0.0.1:9051` (control), ligado solo a localhost. Actualizar conserva tus datos; una ruta de instalación relativa obsoleta se corrige al default automáticamente.

### Soporte de plataformas — leer esto / read this

- **Probado: solo Windows 10/11 x64** (máquina del mantenedor: instalación limpia, arranque, `harness ready`, Tor escuchando, lane único de modelos, apagado).
- **NO probado y NO soportado en 0.9.1**: Windows ARM64, Linux (cualquier distribución/arquitectura), macOS (cualquier arquitectura). No se publican artefactos para estas plataformas; existen builds de contribuidores pero no fueron probados por el mantenedor y no deben tratarse como releases utilizables.

### Limitaciones conocidas

- El lane anónimo depende de cuota compartida del upstream (opencode.ai): con congestión ofrece pocos modelos o se oculta hasta recuperarse. Límite externo, no defecto de la app.
- Tor agrega un salto para el tráfico de failover; la ruta directa sigue siendo la preferida, así que la latencia normal no cambia.
- `free-search` queda deshabilitado hasta que se empaquete su binario.
- RTK/Caveman siguen como helpers opcionales por PATH, no empaquetados.
- El upstream `jasonxu114514/opencode2api` no declara licencia; `NOTICE` registra su procedencia honestamente en vez de afirmar MIT.
