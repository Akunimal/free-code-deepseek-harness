# FreeCode DeepSeek Harness v0.9.5 — Published

## English

### v0.9.5 published release — Windows x64

FreeCode DeepSeek Harness v0.9.5 is published for Windows x64. It closes the
Pool Status window through a sender-checked preload IPC, without closing the
main application, and adds a regression test for overlay ownership. The release
gate now proves the separately downloaded DSH runtime on a genuinely empty
profile/cache: it fetches the exact public GitHub asset through the production
bootstrap/updater, verifies the SHA-256, archive layout, runtime manifest and
Electron ABI, then starts the downloaded DSH CLI hidden. The runtime remains a
separate download, not bundled into setup or portable. The exact current
v0.9.5 downloads and checksums are listed below after packaging.

The release also carries forward the v0.9.4 model/Tor resilience, catalog
loading feedback, per-model context/effort metadata and Hermes-inspired animated
backgrounds. The v0.9.4 release and tag remain immutable historical releases.

## Español

### Release v0.9.5 publicada — Windows x64

FreeCode DeepSeek Harness v0.9.5 está publicada para Windows x64. Corrige el
cierre del botón de la ventana Estado del pool mediante un IPC del preload que verifica
el WebContents dueño, sin cerrar la aplicación principal, y agrega una prueba
de regresión. El gate de release ahora demuestra la descarga del runtime DSH
con una caché y un perfil realmente vacíos: obtiene el asset público exacto de
GitHub mediante el bootstrap/updater de producción, verifica SHA-256, estructura
del archivo, manifest y ABI de Electron, y luego inicia el CLI DSH descargado en
modo oculto. El runtime sigue siendo una descarga separada; no se incluye en el
setup ni en portable. Los nombres, tamaños y checksums de las descargas v0.9.5
se completan abajo después del empaquetado.

La release también conserva la resiliencia de modelos/Tor, el indicador de
carga del catálogo, el contexto/esfuerzo por modelo y los fondos animados
inspirados en Hermes de v0.9.4. La release y el tag v0.9.4 quedan inmutables.
