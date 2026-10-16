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
v0.9.5 downloads and checksums are listed below; the release gate and artifact
verifier passed without installing or launching the product.

The release also carries forward the v0.9.4 model/Tor resilience, catalog
loading feedback, per-model context/effort metadata and Hermes-inspired animated
backgrounds. The v0.9.4 release and tag remain immutable historical releases.

#### Verified Windows x64 assets

| Asset | Size | SHA-256 |
| --- | ---: | --- |
| NSIS setup | 178,759,216 bytes | `a3a20d775b72499b994d9f89458f710a12ee44fc9118738a90ee9d5f8ba13406` |
| Portable executable | 178,384,078 bytes | `77b279db79d1560dfdbc97bfb8360832a93ce97de06f9570829350333e826bec` |
| Setup blockmap | 189,048 bytes | `902ca62b0a2a191765b38432fc07b4d49f9f2a62b0d3db37dd375401ee537362` |
| Updater metadata (`latest.yml`) | 395 bytes | `dbcd0c74d383a90c80702b940e21c26dd8980764dbb1210dd831002b1408d2d3` |

The separate DSH `0.2.1-alpha.8` runtime is not duplicated in this desktop
release. Its immutable archive remains attached to v0.9.4 (421,507,898 bytes;
SHA-256 `bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6`).

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
setup ni en portable. Los nombres, tamaños y checksums exactos de v0.9.5 se
indican abajo; el gate y el verificador de artefactos pasaron sin instalar ni
iniciar el producto.

La release también conserva la resiliencia de modelos/Tor, el indicador de
carga del catálogo, el contexto/esfuerzo por modelo y los fondos animados
inspirados en Hermes de v0.9.4. La release y el tag v0.9.4 quedan inmutables.

#### Artefactos verificados de Windows x64

| Artefacto | Tamaño | SHA-256 |
| --- | ---: | --- |
| Instalador NSIS | 178.759.216 bytes | `a3a20d775b72499b994d9f89458f710a12ee44fc9118738a90ee9d5f8ba13406` |
| Ejecutable portable | 178.384.078 bytes | `77b279db79d1560dfdbc97bfb8360832a93ce97de06f9570829350333e826bec` |
| Blockmap del setup | 189.048 bytes | `902ca62b0a2a191765b38432fc07b4d49f9f2a62b0d3db37dd375401ee537362` |
| Metadatos del updater (`latest.yml`) | 395 bytes | `dbcd0c74d383a90c80702b940e21c26dd8980764dbb1210dd831002b1408d2d3` |

El runtime DSH `0.2.1-alpha.8` no se duplica en esta release desktop. Su
archivo inmutable sigue adjunto a v0.9.4 (421.507.898 bytes; SHA-256
`bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6`).
