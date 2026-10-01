# FreeCode DeepSeek Harness 0.9.0 — Release Notes / Notas de la release

## English

### What is new

- **Single bundled Tor instance** (replaces the Cloudflare WARP dependency): `resources/freecode/tor/` ships `tor.exe`, `geoip`, `geoip6` with a hardened fast-node `torrc` (`FastFirstHopPK`, `CircuitBuildTimeout 5`, `NumEntryGuards 3`, EU exit preference, `IsolateSOCKSAuth`). One daemon, managed by the shell — no more `torfleet`/`warfleet` sidecars.
- **Tor resilience IPC + overlay UI**: `tor:status` / `tor:rotate` channels, preload `window.freecode.tor`, and a "Resiliencia Tor" block in the status overlay with a `NEWNYM` button to rotate the circuit on demand.
- **TorManager → opencode2api proxies**: the gateway is launched with `proxies: [direct, socks5://127.0.0.1:9050]`, so model traffic can fail over through Tor when direct egress is blocked. Started before the runtime, stopped on `before-quit`.
- **opencode2api integration confirmed**: the correct upstream is `jasonxu114514/opencode2api` (binary flags `-config`, `-listen`, `-web-listen`); `NOTICE` and the contract tests were updated accordingly.
- **Seeder respects your model choice**: boot no longer clobbers a user-selected `agent-default-model`. It only falls back to `deepseek-free` when the default is missing, points at a removed route, or its model vanished. Custom user providers are untouched.
- **Single model lane — duplicates gone**: the `opencode-free` duplicate lane (same gateway as `deepseek-free`) is consolidated into one `deepseek-free` provider labeled **OpenCode Free**; every model now appears exactly once in the selector. Legacy labels (`FreeLLMPool`, `DeepSeek Free (pool)`) migrate automatically, and a default still pointing at `opencode-free` moves to `deepseek-free` keeping the same model id when served.
- **Version 0.9.0**: bump in both `package.json` + aligned version gates.

### Assets

| File | Purpose |
|------|---------|
| `FreeCode-DeepSeek-Harness-0.9.0-win-x64-setup.exe` | NSIS installer (~304 MB) |
| `FreeCode-DeepSeek-Harness-0.9.0-win-x64-portable.exe` | Portable executable (~304 MB) |
| `deepseek-harness-runtime-0.1.3-alpha.1-win32-x64.tar.gz` (+`.sha256`) | Harness runtime for in-app updates |
| `latest.yml` | electron-updater metadata |

### Install notes

Unpacking writes ~69,000 files and takes around 10 minutes on a typical machine — this is normal, not a hang. No administrator rights needed, no `PATH` changes, no console windows. Tor runs as a local child process on `127.0.0.1:9050` (SOCKS) and `127.0.0.1:9051` (control), bound to localhost only.

### Platform support — read this / leer esto

- **Tested: Windows 10/11 x64 ONLY** (maintainer machine: clean install, launch, `harness ready`, Tor listening, single model lane, shutdown).
- **NOT tested and NOT supported in 0.9.0**: Windows ARM64, Linux (any distribution/architecture), macOS (any architecture). No artifacts are published for these platforms; contributor builds for them exist but were not tested by the maintainer and must not be treated as usable releases.

### Known limitations

- The anonymous lane depends on shared upstream quota (opencode.ai): during congestion it offers few models or hides until recovery. External limit, not an app defect.
- Tor adds a hop for failover traffic; the direct route remains preferred, so normal latency is unchanged.
- `free-search` stays disabled until its binary is vendored.
- RTK/Caveman remain optional PATH-resolved helpers, not bundled binaries.
- Gentle AI binary is bundled for Windows x64; other platforms require PATH installation.

---

## Español

### Novedades

- **Instancia Tor única empaquetada** (reemplaza la dependencia de Cloudflare WARP): `resources/freecode/tor/` incluye `tor.exe`, `geoip`, `geoip6` con un `torrc` endurecido de nodos rápidos (`FastFirstHopPK`, `CircuitBuildTimeout 5`, `NumEntryGuards 3`, salida preferida en la UE, `IsolateSOCKSAuth`). Un solo daemon, gestionado por el shell — sin más sidecars `torfleet`/`warfleet`.
- **IPC de resiliencia Tor + UI en el overlay**: canales `tor:status` / `tor:rotate`, preload `window.freecode.tor` y un bloque "Resiliencia Tor" en el overlay de estado con botón `NEWNYM` para rotar el circuito bajo demanda.
- **TorManager → proxies de opencode2api**: el gateway se lanza con `proxies: [direct, socks5://127.0.0.1:9050]`, de modo que el tráfico de modelos puede fallar vía Tor cuando el egress directo está bloqueado. Se inicia antes del runtime y se detiene en `before-quit`.
- **Integración opencode2api confirmada**: el upstream correcto es `jasonxu114514/opencode2api` (flags del binario `-config`, `-listen`, `-web-listen`); `NOTICE` y los tests de contrato se actualizaron en consecuencia.
- **El seeder respeta tu modelo elegido**: el arranque ya no sobreescribe un `agent-default-model` seleccionado por el usuario. Solo vuelve a `deepseek-free` cuando el default falta, apunta a una ruta eliminada o su modelo desapareció. Los providers propios del usuario no se tocan.
- **Lane único de modelos — duplicados eliminados**: el lane duplicado `opencode-free` (mismo gateway que `deepseek-free`) se consolidó en un único provider `deepseek-free` etiquetado **OpenCode Free**; ahora cada modelo aparece una sola vez en el selector. Las etiquetas legacy (`FreeLLMPool`, `DeepSeek Free (pool)`) migran automáticamente, y un default que aún apunte a `opencode-free` pasa a `deepseek-free` conservando el mismo id de modelo si lo sirve.
- **Versión 0.9.0**: bump en ambos `package.json` + gates de versión alineados.

### Activos

| Archivo | Propósito |
|---------|-----------|
| `FreeCode-DeepSeek-Harness-0.9.0-win-x64-setup.exe` | Instalador NSIS (~304 MB) |
| `FreeCode-DeepSeek-Harness-0.9.0-win-x64-portable.exe` | Ejecutable portable (~304 MB) |
| `deepseek-harness-runtime-0.1.3-alpha.1-win32-x64.tar.gz` (+`.sha256`) | Runtime del Harness para actualizaciones in-app |
| `latest.yml` | Metadata de electron-updater |

### Notas de instalación

Desempaquetar escribe ~69.000 archivos y tarda unos 10 minutos en una máquina típica — es normal, no es un cuelgue. Sin derechos de administrador, sin cambios a `PATH`, sin consolas. Tor corre como proceso hijo local en `127.0.0.1:9050` (SOCKS) y `127.0.0.1:9051` (control), ligado solo a localhost.

### Soporte de plataformas — leer esto / read this

- **Probado: solo Windows 10/11 x64** (máquina del mantenedor: instalación limpia, arranque, `harness ready`, Tor escuchando, lane único de modelos, apagado).
- **NO probado y NO soportado en 0.9.0**: Windows ARM64, Linux (cualquier distribución/arquitectura), macOS (cualquier arquitectura). No se publican artefactos para estas plataformas; existen builds de contribuidores pero no fueron probados por el mantenedor y no deben tratarse como releases utilizables.

### Limitaciones conocidas

- El lane anónimo depende de cuota compartida del upstream (opencode.ai): con congestión ofrece pocos modelos o se oculta hasta recuperarse. Límite externo, no defecto de la app.
- Tor agrega un salto para el tráfico de failover; la ruta directa sigue siendo la preferida, así que la latencia normal no cambia.
- `free-search` queda deshabilitado hasta que se empaquete su binario.
- RTK/Caveman siguen como helpers opcionales por PATH, no empaquetados.
- El binario de Gentle AI está empaquetado para Windows x64; otras plataformas requieren instalación por PATH.
