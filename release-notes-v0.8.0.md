# FreeCode DeepSeek Harness 0.8.0 — Release Notes / Notas de la release

## English

### What is new

- **Gentle AI integrated mode**: a selectable `gentle-ai` agent preset that reuses IPC, MCP, ModelCatalog, permissions, sandbox, and plan-mode. It provides orchestrator value without replacing the worker pool. Default to `gentle-ai` when binary detected, else `standard`.
- **Bounded CLI wrapper**: `gentle-ai:*` IPC (`status`, `doctor`, `run`) with Zod contract + preload `window.freecode.gentleAi`. Binary resolution bundled `resources/gentle-ai/gentle-ai.exe` → PATH fallback, cached, null-safe.
- **Engram as third managed MCP row** (on by default); **Serena removed** entirely from the managed catalog.
- **RDD v2 enforced**: `status` → `START` → `next_transition` verbatim transitions in harness; gentle-ai owns `.atl/skill-registry.md`.
- **Spanish locale**: real Spanish `es` dicts via `141-*` patch (30 files, ~1000 keys). The selector now renders Spanish correctly.
- **freellmpool removed**: the harness now relies solely on `opencode2api` (OpenCode No-Auth) as the free model gateway. No Python dependency, no `freellmpool` process.
- **Version 0.8.0**: bump in both `package.json` + aligned version gates.

### Assets

| File | Purpose |
|------|---------|
| `FreeCode-DeepSeek-Harness-0.8.0-win-x64-setup.exe` | NSIS installer (~286 MB) |
| `FreeCode-DeepSeek-Harness-0.8.0-win-x64-portable.exe` | Portable executable (~286 MB) |
| `deepseek-harness-runtime-0.1.3-alpha.1-win32-x64.tar.gz` (+`.sha256`) | Harness runtime for in-app updates |
| `latest.yml` | electron-updater metadata |

### Install notes

Unpacking writes ~69,000 files and takes around 10 minutes on a typical machine — this is normal, not a hang. No administrator rights needed, no `PATH` changes, no console windows.

### Platform support — read this / leer esto

- **Tested: Windows 10/11 x64 ONLY** (maintainer machine: clean install, launch, `harness ready`, both model lanes, shutdown).
- **NOT tested and NOT supported in 0.8.0**: Windows ARM64, Linux (any distribution/architecture), macOS (any architecture). No artifacts are published for these platforms; contributor builds for them exist but were not tested by the maintainer and must not be treated as usable releases.

### Known limitations

- The anonymous lane depends on shared upstream quota (opencode.ai): during congestion it offers few models or hides until recovery. External limit, not an app defect.
- `free-search` stays disabled until its binary is vendored.
- RTK/Caveman remain optional PATH-resolved helpers, not bundled binaries.
- Gentle AI binary is bundled for Windows x64; other platforms require PATH installation.

---

## Español

### Novedades

- **Modo integrado Gentle AI**: un preset de agente `gentle-ai` seleccionable que reutiliza IPC, MCP, ModelCatalog, permisos, sandbox y plan-mode. Proporciona valor de orquestador sin reemplazar el pool de workers. Usa `gentle-ai` por defecto cuando se detecta el binario, si no `standard`.
- **Wrapper CLI acotado**: IPC `gentle-ai:*` (`status`, `doctor`, `run`) con contrato Zod + preload `window.freecode.gentleAi`. Resolución de binario bundleado `resources/gentle-ai/gentle-ai.exe` → fallback PATH, cacheado, null-safe.
- **Engram como tercera fila MCP gestionada** (activada por defecto); **Serena eliminada** completamente del catálogo gestionado.
- **RDD v2 impuesto**: transiciones literales `status` → `START` → `next_transition` en el harness; gentle-ai es dueño de `.atl/skill-registry.md`.
- **Locale español**: diccionarios `es` reales vía parche `141-*` (30 archivos, ~1000 claves). El selector ahora renderiza español correctamente.
- **freellmpool eliminado**: el harness ahora depende únicamente de `opencode2api` (OpenCode No-Auth) como gateway de modelos gratuitos. Sin dependencia de Python, sin proceso `freellmpool`.
- **Versión 0.8.0**: bump en ambos `package.json` + gates de versión alineados.

### Activos

| Archivo | Propósito |
|---------|-----------|
| `FreeCode-DeepSeek-Harness-0.8.0-win-x64-setup.exe` | Instalador NSIS (~286 MB) |
| `FreeCode-DeepSeek-Harness-0.8.0-win-x64-portable.exe` | Ejecutable portable (~286 MB) |
| `deepseek-harness-runtime-0.1.3-alpha.1-win32-x64.tar.gz` (+`.sha256`) | Runtime del Harness para actualizaciones in-app |
| `latest.yml` | Metadata de electron-updater |

### Notas de instalación

Desempaquetar escribe ~69.000 archivos y tarda unos 10 minutos en una máquina típica — es normal, no es un cuelgue. Sin derechos de administrador, sin cambios a `PATH`, sin consolas.

### Soporte de plataformas — leer esto / read this

- **Probado: solo Windows 10/11 x64** (máquina del mantenedor: instalación limpia, arranque, `harness ready`, ambos lanes, apagado).
- **NO probado y NO soportado en 0.8.0**: Windows ARM64, Linux (cualquier distribución/arquitectura), macOS (cualquier arquitectura). No se publican artefactos para estas plataformas; existen builds de contribuidores pero no fueron probados por el mantenedor y no deben tratarse como releases utilizables.

### Limitaciones conocidas

- El lane anónimo depende de cuota compartida del upstream (opencode.ai): con congestión ofrece pocos modelos o se oculta hasta recuperarse. Límite externo, no defecto de la app.
- `free-search` queda deshabilitado hasta que se empaquete su binario.
- RTK/Caveman siguen como helpers opcionales por PATH, no empaquetados.
- El binario de Gentle AI está empaquetado para Windows x64; otras plataformas requieren instalación por PATH.
