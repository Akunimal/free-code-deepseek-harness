# FreeCode DeepSeek Harness v0.4.3

## English

### Critical fixes

- **Auto-updater was broken** — `publish.releaseType: draft` told electron-updater to only check draft releases, but all our releases are published (non-draft). Removed the field so the updater defaults to checking stable releases. The update button now correctly finds newer versions.
- **Gemini Web2API "no content" fix** — Added auto-detection of the `gemini_bl` parameter from gemini.google.com, matching the working Hermes setup. When Gemini returns a 405 (stale BL), the bridge now automatically fetches the latest BL and retries. This was the root cause of "completed response with no content".

### Security fix

- **Gemini Web2API** now defaults to `127.0.0.1` (loopback only) instead of `0.0.0.0` (all interfaces). User-set hosts are preserved.

### Upgrade

Download the installer, portable, or AppImage from the assets below. Your settings and data are preserved.

---

## Español

### Fixes críticos

- **El auto-updater estaba roto** — `publish.releaseType: draft` le decía a electron-updater que solo busque releases draft, pero todas nuestras releases son published (non-draft). Se eliminó para que busque releases stable por defecto. El botón de actualización ahora encuentra versiones nuevas correctamente.
- **Fix de Gemini Web2API "sin contenido"** — Se agregó auto-detección del parámetro `gemini_bl` desde gemini.google.com, igual que en Hermes (que funciona). Cuando Gemini devuelve un 405 (BL vencido), el bridge ahora busca el BL más reciente automáticamente y reintenta. Esta era la causa raíz de "completed response with no content".

### Fix de seguridad

- **Gemini Web2API** ahora usa `127.0.0.1` (solo loopback) por defecto en vez de `0.0.0.0` (todas las interfaces). Los hosts configurados por el usuario se conservan.

### Actualización

Descargá el instalador, la versión portable o la AppImage desde los archivos adjuntos. Tus ajustes y datos se conservan.
