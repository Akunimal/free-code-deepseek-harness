# PLAN v0.1.5 — publicaciones en grupos + known issue + instalador

Fecha: 2026-08-20 · Repo: `Akunimal/free-code-deepseek-harness` · Estado: EN CURSO

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

## 3. Instalador v0.1.5 "no responde" — diagnóstico y pasos

### Síntoma
El usuario intentó instalar la v0.1.5 (`FreeCode-DeepSeek-Harness-0.1.5-win-x64-setup.exe`, 446 MB)
y el instalador **no responde** (no aparece ventana / se queda colgado).

### Causas posibles (por descartar, en orden)
1. **SmartScreen / Defender**: exe sin firma descargado de internet → "Windows protegió su PC" o
   ejecución bloqueada silenciosa. Verificar con `Get-AuthenticodeSignature` (debe decir NotSigned).
2. **Instalador NSIS extrayendo ~1.6 GB**: la primera ventana tarda 30–90 s (o más en disco lento),
   parece "no responder" pero está trabajando. Esperar >2 min antes de declararlo colgado.
3. **Versión anterior corriendo**: si la v0.1.4 está abierta, el instalador puede esperar a que cierre
   la app. Cerrar el harness antes de instalar.
4. **Antivirus de terceros** (simplewall/Defender real-time) sandboxeando el setup. Probar con Defender
   temporalmente off o añadir exclusión.
5. **Corrupción de descarga**: verificar hash del exe contra el SHA-256 del asset de GitHub.

### Pasos a ejecutar (cuando se retome)
- [ ] `Get-AuthenticodeSignature` sobre el setup.exe descargado → confirmar "NotSigned" (causa 1)
- [ ] Ejecutar con `--version` o `/S /D=` en cmd para ver si responde headless; revisar `%TEMP%\ns*.log` / electron-builder logs
- [ ] Esperar ≥2 min midiendo la ventana (causa 2) — medir RAM/CPU del proceso setup.exe con tasklist
- [ ] Cerrar cualquier instancia del harness v0.1.4 antes de instalar (causa 3)
- [ ] Verificar SHA-256 del exe local vs GitHub API (causa 5)
- [ ] Si el setup de CI no responde nunca: alternativa = usar el **portable.exe** (no requiere instalación)

### Estado
- [ ] Diagnóstico en curso / pendiente

---

## 4. Registro de ejecución

(rellenar a medida que se avanza)
