# FreeCode DeepSeek Harness v0.4.0

**Caveman + Updater Fix**

## Added

- **Caveman context compression** as an optional toggle alongside RTK in Shell settings. Disabled by default; compresses eligible command output when the Caveman binary is installed separately. / Compresión de contexto Caveman como toggle opcional junto a RTK. Deshabilitado por defecto.

## Fixed

- **Application updater**: explicit download control prevents double-download race, and a tray notification appears during the update process. / Actualizador de la aplicación: control explícito de descarga y notificación en la bandeja durante la actualización.
- **Update indicator button** aligned with the Send button visual system, replacing the standalone circular control. / Botón de indicador de actualización alineado con el sistema visual del botón Enviar.
- **Gemini Web2API models** now work correctly: config defaults match the `Bearer freecode-local` auth header and include full retry/timeout settings. / Los modelos Gemini Web2API ahora funcionan correctamente: los valores por defecto coinciden con el header de autenticación y incluyen configuración completa de reintentos.

## Changed

- Spanish locale support verified and documented. / Soporte del locale español verificado y documentado.
- Added `docs/GEMINI-WEB2API-IMPROVEMENTS.md` with streaming and tool calling enhancement proposals for the Gemini Web2API bridge.

## Upgrade

Download the installer or portable from the assets below. The application will preserve your settings and data.
