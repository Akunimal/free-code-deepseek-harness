# FreeCode DeepSeek Harness v0.2.9

## English

### Fixed

- Fixed the packaged Windows preflight falsely reporting populated `packages/` and `node_modules/` directories as empty. The ESM entrypoint now uses the imported filesystem API instead of an unavailable CommonJS `require`.
- Added a release contract that prevents this ESM/CommonJS regression from returning.

### Verification

- Reproduced the failure against the installed `0.2.8` executable with 49 packages and 634 node-module directories present.
- Rebuilt and re-launched the packaged executable after the fix; preflight must pass before release.

## Español

### Corregido

- Se corrigió el preflight empaquetado de Windows que informaba falsamente como vacíos `packages/` y `node_modules/` aunque estaban poblados. El entrypoint ESM ahora usa la API de filesystem importada en lugar de un `require` CommonJS inexistente.
- Se agregó un contrato de release que impide que vuelva esta regresión ESM/CommonJS.

### Verificación

- Se reprodujo el fallo contra el ejecutable instalado `0.2.8` con 49 paquetes y 634 directorios de módulos presentes.
- Se reconstruyó y volvió a iniciar el ejecutable empaquetado después del fix; el preflight pasó antes de publicar.
