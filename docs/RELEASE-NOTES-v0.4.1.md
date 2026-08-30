# FreeCode DeepSeek Harness v0.4.1

## English

### What's new

- **Caveman context compression** toggle added to Shell settings, below RTK.
  Disabled by default; enables compression of eligible command output when the
  Caveman binary is installed separately.

### Fixes

- **Gemini Web2API models now work.** The default config was missing the
  `Bearer freecode-local` auth header match and had no retry/timeout settings.
  Config now matches the working Hermes setup.
- **Application updater** fixed: explicit download control, tray notification
  during update, and the update button now aligns visually with the Send button.
- **Caveman toggle visible in UI.** The client bundle was not rebuilt after
  adding the Caveman field; now ships with the updated bundle.

### Changed

- Spanish locale support verified and documented.
- Added `docs/GEMINI-WEB2API-IMPROVEMENTS.md` with streaming and tool calling
  enhancement proposals.

### Upgrade

Download the installer, portable, or AppImage from the assets below.
Your settings and data are preserved.

---

## Español

### Novedades

- **Compresión de contexto Caveman** como toggle opcional debajo de RTK en
  la configuración del Shell. Deshabilitado por defecto; activa la compresión
  de salida de comandos compatibles cuando el binario de Caveman está
  instalado por separado.

### Correcciones

- **Los modelos Gemini Web2API ahora funcionan.** La configuración por defecto
  no matcheaba el header de autenticación `Bearer freecode-local` y no tenía
  configuración de reintentos/tiempo de espera. Ahora coincide con la
  configuración funcional de Hermes.
- **Actualizador de la aplicación** corregido: control explícito de descarga,
  notificación en la bandeja durante la actualización, y el botón de
  actualización ahora está alineado visualmente con el botón Enviar.
- **Toggle de Caveman visible en la UI.** El bundle del cliente no fue
  reconstruido después de agregar el campo Caveman; ahora incluye el bundle
  actualizado.

### Cambios

- Soporte del locale español verificado y documentado.
- Agregado `docs/GEMINI-WEB2API-IMPROVEMENTS.md` con propuestas de mejora
  de streaming y tool calling.

### Actualización

Descargá el instalador, la versión portable o la AppImage desde los
archivos adjuntos. Tus ajustes y datos se conservan.
