# FreeCode DeepSeek Harness v0.4.3

## English

### Critical fix

- **Auto-updater was broken** — `publish.releaseType: draft` told electron-updater to only check draft releases, but all our releases are published (non-draft). Removed the field so the updater defaults to checking stable releases. The update button now correctly finds newer versions.

### Security fix

- **Gemini Web2API** now defaults to `127.0.0.1` (loopback only) instead of `0.0.0.0` (all interfaces). Removed aggressive host patching from config — user-set hosts are preserved.

### Upgrade

Download the installer, portable, or AppImage from the assets below. Your settings and data are preserved.

---

## Español

### Fix crítico

- **El auto-updater estaba roto** — `publish.releaseType: draft` le decía a electron-updater que solo busque releases draft, pero todas nuestras releases son published (non-draft). Se eliminó el campo para que el updater busque releases stable por defecto. El botón de actualización ahora encuentra versiones nuevas correctamente.

### Fix de seguridad

- **Gemini Web2API** ahora usa `127.0.0.1` (solo loopback) por defecto en vez de `0.0.0.0` (todas las interfaces). Se eliminó el patching agresivo del host — los hosts configurados por el usuario se conservan.

### Actualización

Descargá el instalador, la versión portable o la AppImage desde los archivos adjuntos. Tus ajustes y datos se conservan.
