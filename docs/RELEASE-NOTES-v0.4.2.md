# FreeCode DeepSeek Harness v0.4.2

## English

### Fixes

- **Update button** is now a round 36px circle with a down-arrow (↓), matching the Send button style. Fixed the update flow to force-quit for reliable install-after-download.
- **Gemini Web2API config** is now auto-patched on every app start: `api_keys` always includes `freecode-local`, host defaults to `0.0.0.0`, and `default_model` is set. Existing user config fields (like `proxy`) are preserved.
- **Gemini models** now return content correctly because the auth header and config defaults match.

### Upgrade

Download the installer, portable, or AppImage from the assets below. Your settings and data are preserved.

---

## Español

### Correcciones

- **Botón de actualización** ahora es un círculo redondo de 36px con flecha hacia abajo (↓), alineado con el estilo del botón Enviar. Se corrigió el flujo de actualización con force-quit para una instalación confiable después de la descarga.
- **Config de Gemini Web2API** ahora se actualiza automáticamente en cada inicio: `api_keys` siempre incluye `freecode-local`, host usa `0.0.0.0`, y `default_model` está configurado. Los campos de config del usuario (como `proxy`) se conservan.
- **Modelos Gemini** ahora devuelven contenido correctamente porque el header de autenticación y los defaults de config coinciden.

### Actualización

Descargá el instalador, la versión portable o la AppImage desde los archivos adjuntos. Tus ajustes y datos se conservan.
