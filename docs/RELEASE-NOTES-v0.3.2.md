# FreeCode DeepSeek Harness v0.3.2

## English

FreeCode 0.3.2 keeps the optional local `Gemini Web (local)` provider and
removes the short-lived local Perplexity provider from the desktop product.

- The model selector contains the OpenCode Free pool followed by Gemini Web;
  no `Perplexity Free (local)` route is seeded or refreshed.
- Existing settings migrate away the app-managed `perplexity-free` entry while
  preserving providers with a different user-defined name.
- The packaged runtime includes the pinned MIT-licensed
  [gemini-web2api](https://github.com/Sophomoresty/gemini-web2api) source only;
  the removed Perplexity bridge is no longer built or packaged.
- Gemini Web remains at `http://127.0.0.1:8081/v1`, starts automatically when
  Python 3 is available, and keeps its user configuration between launches.
- The release was built and uploaded manually. No GitHub Actions workflow was
  added.

### Release assets / Artifacts

The release contains these manually built assets:

- `FreeCode-DeepSeek-Harness-0.3.2-win-x64-setup.exe` — 276.5 MiB
- `FreeCode-DeepSeek-Harness-0.3.2-win-x64-portable.exe` — 276.3 MiB
- `FreeCode-DeepSeek-Harness-0.3.2-win-x64-setup.exe.blockmap` — 0.3 MiB
- `FreeCode-DeepSeek-Harness-0.3.2-linux-x86_64.AppImage` — 252.4 MiB
- `deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz` — 179.4 MiB
- `deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz.sha256`
- `latest.yml` — updater metadata for Windows

SHA-256 checksums for the main binaries:

- Windows setup: `B469DED8D03733FB72A0FA9AC258CABDD9EEC55E6052A998367061104E6B8E87`
- Windows portable: `E8CD32815B8146F19C6EBC9D287185E8D7042EF20F83386C276746A8CA4CA029`
- Linux AppImage: `B838AA5B363BFED9538C9C26588DA1EAAC56AC6260573078072B4BA362ECDA4B`
- Runtime archive: `7BBAA394659A4437CB0BB9D84EC02BA718DFEE6E0B44F545E1A48F03355C56F3`

## Español

FreeCode 0.3.2 conserva el provider local opcional `Gemini Web (local)` y retira
el provider local de Perplexity del producto de escritorio.

- El selector contiene el pool OpenCode Free seguido por Gemini Web; ya no se
  siembra ni actualiza ninguna ruta `Perplexity Free (local)`.
- La configuración existente elimina la entrada `perplexity-free` administrada
  por la aplicación y conserva los providers con otro nombre definido por el
  usuario.
- El runtime empaquetado contiene únicamente el código MIT fijado de
  [gemini-web2api](https://github.com/Sophomoresty/gemini-web2api); el bridge de
  Perplexity retirado ya no se compila ni se empaqueta.
- Gemini Web sigue disponible en `http://127.0.0.1:8081/v1`, arranca
  automáticamente cuando Python 3 está disponible y conserva su configuración
  de usuario entre lanzamientos.
- La release se compiló y subió manualmente. No se agregó ningún workflow de
  GitHub Actions.

### Release assets / Artefactos

La release contiene estos artefactos compilados manualmente:

- `FreeCode-DeepSeek-Harness-0.3.2-win-x64-setup.exe` — 276,5 MiB
- `FreeCode-DeepSeek-Harness-0.3.2-win-x64-portable.exe` — 276,3 MiB
- `FreeCode-DeepSeek-Harness-0.3.2-win-x64-setup.exe.blockmap` — 0,3 MiB
- `FreeCode-DeepSeek-Harness-0.3.2-linux-x86_64.AppImage` — 252,4 MiB
- `deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz` — 179,4 MiB
- `deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz.sha256`
- `latest.yml` — metadatos del actualizador para Windows

Checksums SHA-256 de los binarios principales:

- Instalador Windows: `B469DED8D03733FB72A0FA9AC258CABDD9EEC55E6052A998367061104E6B8E87`
- Portable Windows: `E8CD32815B8146F19C6EBC9D287185E8D7042EF20F83386C276746A8CA4CA029`
- AppImage Linux: `B838AA5B363BFED9538C9C26588DA1EAAC56AC6260573078072B4BA362ECDA4B`
- Runtime: `7BBAA394659A4437CB0BB9D84EC02BA718DFEE6E0B44F545E1A48F03355C56F3`
