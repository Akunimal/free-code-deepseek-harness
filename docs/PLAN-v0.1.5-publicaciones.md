# HISTÓRICO v0.1.5 — publicaciones en grupos + known issue + instalador

Fecha: 2026-08-20 · Repo: `Akunimal/free-code-deepseek-harness` · Estado: HISTÓRICO / CERRADO

> Este documento conserva el plan de la publicación v0.1.5. No representa tareas pendientes de la release vigente; el plan actual está en [PLAN-v0.1.7-publicaciones.md](PLAN-v0.1.7-publicaciones.md).

---

## 1. Publicaciones en grupos de Facebook (OpenCode)

### Objetivo
Anunciar la **v0.1.5** en los 5 grupos donde el usuario es miembro y cuyo título contiene "opencode",
con la captura `capeng.jpg` adjunta. Idioma: **español si el grupo es hispanohablante, inglés si es en inglés**.

### Grupos objetivo
| Grupo | Título | Idioma |
|---|---|---|
| Opencode en Español (24.8k) — grupo principal | hispano | ES |
| Devs: Antigravity, Codex, Claude Code y OpenCode en Español (31k) | hispano | ES |
| OPENCODE \| AVANZADO (13k) | hispano | ES |
| OpenCode en Español (6k) | hispano | ES |
| opencode-crew (3.4k) | probablemente EN → verificar | EN |

### Contenido obligatorio del texto (tono del post v0.1.0 ya publicado)
- Es la **nueva versión v0.1.5** con **Tor agregado** para no pegar límite de los modelos gratis
  (los 429 de rate-limit por IP). Aclarar: "no sabemos si esto va a cambiar, pero por el momento
  encontré una solución para codificar prácticamente gratis".
- Decir que **empezó como algo personal y luego quise compartirlo**.
- **Known issue** (una línea, sin dramatizar): los fondos animados no se ven en la v0.1.5
  (pendiente de corregir en una próxima versión).
- **Advertencia de tiempos en TODOS los posts**: la instalación es lenta y la primera carga del
  portable es más lenta aún (se extrae ~1.6 GB, 30–90 s). Tengan paciencia: una vez instalado,
  carga mucho más rápido.
- Mantener del post v0.1.0: qué es, modelos gratuitos, puente OpenCode (opencode2api), pool 1–16
  workers round-robin, interfaz completa del harness, español/inglés auto-detectado, portable + instalador,
  link a releases, open source / fork de deepseek-ai/deepseek-harness.
- Adjuntar **`capeng.jpg`** (I:\Users\inti_\OneDrive\Escritorio\capeng.jpg → `docs/assets/capeng.jpg`).

### Método (skill `facebook-group-publishing` — respetar SÍ o SÍ)
1. Tipear el texto SIEMPRE con `computer_use` `delivery_mode="foreground"` (el background NO entra en el webview).
2. **Verificar el campo con visión/píxeles ANTES de tocar "Publicar"** — si el click cae mal se crea un post vacío.
3. Adjuntar imagen vía botón foto/video + diálogo nativo.
4. Después de publicar, verificar con visión que el post tenga texto + imagen.
5. Si se crea un post vacío: menú ⋯ → teclado Down×2 → Enter ("Eliminar publicación"), snapshot fresco tras cada paso.
6. Los refs del snapshot quedan stale tras Escape/navegación → snapshot fresco antes de cada click.
7. Toggle "Publicar de forma anónima" OFF (verificar gris por píxeles) — publicar con el nombre.

### Estado
- [ ] Opencode en Español — publicado (ver sección 4)
- [ ] Devs: Antigravity, Codex, Claude Code y OpenCode en Español
- [ ] OPENCODE | AVANZADO
- [ ] OpenCode en Español (6k)
- [ ] opencode-crew (EN si corresponde)
- [ ] Borrar los 3 posts vacíos que quedaron del intento del 19/08 en "Opencode en Español"

---

## 2. capeng.jpg en el README
- [x] `docs/assets/capeng.jpg` copiada al repo (94,022 bytes)
- [x] `README.md`: `![App screenshot](docs/assets/capeng.jpg)` tras el intro
- [x] `README.es.md`: `![Captura de la aplicación](docs/assets/capeng.jpg)` tras el intro
- [ ] Commit + push

---

## 3. Instalador v0.1.5 "no responde" — DIAGNÓSTICO COMPLETADO (2026-08-20)

### Síntoma
El usuario ejecutó `FreeCode-DeepSeek-Harness-0.1.5-win-x64-setup.exe` (446 MB) 2 veces (09:15 y 09:19)
y "no respondía": ningún diálogo, instalación nunca arrancaba.

### Evidencia (causa raíz encontrada)
- **El instalador NO "no respondía": CRASHEABA.** Windows dejó 2 minidumps:
  `%LOCALAPPDATA%\CrashDumps\FreeCode-DeepSeek-Harness-0.1.5-win-x64-setup.exe.{47048,50216}.dmp`
- Ambos dumps: **0xC0000005 (Access Violation) con ExceptionAddress = 0x0** → el proceso salta a un
  **puntero nulo** durante el arranque del asistente NSIS.
- El dir de instalación `%LOCALAPPDATA%\Programs\@freecodeshell` quedó creado y **vacío** (se crasheó antes de escribir).
- Es el **bug conocido de electron-builder NSIS en Windows 11** (issue #8536, cerrado sin fix oficial):
  el plugin `System.dll`/`multiUser.nsh` crashea con 0xC0000005 en el instalador per-user asistido,
  especialmente en builds 24H2/25H2 (este equipo: **Windows 11 25H2 build 26200**).
- NO es descarga corrupta: el exe descargado por `gh release download` coincide byte a byte con el asset
  (468,106,588 bytes) y su firma es `NotSigned` (esperado → SmartScreen, otro aviso aparte).

### Verificaciones hechas
- [x] `Get-AuthenticodeSignature` → **NotSigned** (sin firma → SmartScreen pedirá "Más info → Ejecutar de todos modos")
- [x] SHA/tamaño local == asset GitHub (468,106,588 bytes) → descarga íntegra
- [x] **Instalación silenciosa `/S` "completa" pero NO instala**: exit 0 sin escribir nada
  (`$INSTDIR` intacto, `7z-out` del NSIS vacío → aborta silencioso en el stub)
- [x] **Portable.exe TAMBIÉN roto en esta máquina**: el wrapper 7zSFX queda colgado 5+ min
  sin extraer (37 MB, 0 archivos escritos, sin procesos hijo) → matado con taskkill
- [x] Reproducción local del crash vía dumps (2/2 idénticos, mismo offset)
- [ ] Instalación real en `%LOCALAPPDATA%\Programs\@freecodeshell` (NO HAY vía NSIS/7zSFX usable hoy)
- [x] Portable `...-win-x64-portable.exe` descargado (467,936,006 bytes) — mismo stub roto

### CONCLUSIÓN CAUSA RAÍZ (2026-08-20)
**Los stubs NSIS/7zSFX generados por electron-builder 25.1.8 son incompatibles con este
Windows 11 25H2 (build 26200):** el asistente GUI crashea con 0xC0000005 (call a puntero nulo,
bug público electron-builder #8536, cerrado sin fix oficial), el modo `/S` aborta silencioso
(exit 0 sin instalar) y el portable 7zSFX se cuelga sin extraer. NO es descarga corrupta
(bytes idénticos al asset), NO es falta de espacio, NO es antivirus.

### Fix (APLICADO — 2026-08-20)
Dos bugs distintos, dos fixes:
1. **0xC0000005 crash (página asistida):** `electron-builder.yml` → `nsis: oneClick: true` evita
   la página asistida que crashea en Win11 24H2/25H2 (issue #8536).
2. **"No se puede cerrar" falso positivo:** `build/installer.nsh` define macro
   `customCheckAppRunning` vacía → electron-builder la incluye ANTES del template, bypaseando
   el check `nsProcess`/`tasklist | find` que da falsos positivos en Win11 25H2.

Ambos fixes commiteados. Instalador verificado en Win11 25H2 build 26200: instala sin crash ni
diálogo falso.

### Pitfall MSYS
`bash` de git-MSYS convierte argumentos `/S` y `/D=...` en rutas (path mangling) → el setup los
recibe corruptos y sale exit 0 sin hacer nada. Usar SIEMPRE `MSYS_NO_PATHCONV=1 ./setup.exe /S`.

### Estado
- [x] Causa raíz identificada (0xC0000005 → puntero nulo → bug NSIS/electron-builder en Win11 25H2)
- [x] Fix `oneClick: true` en electron-builder.yml (commit `8048097035`)
- [x] Fix `customCheckAppRunning` en build/installer.nsh (commit `6ac6eceb8a`)
- [x] Instalador verificado — instala sin crash ni "no se puede cerrar" en Win11 25H2
- [x] Release v0.1.5 en GitHub actualizada con setup.exe corregido (asset reemplazado 2026-08-20)

---

## 4. Registro de ejecución

(rellenar a medida que se avanza)
