# FreeCode DeepSeek Harness v0.3.1

## English

FreeCode 0.3.1 adds an optional local `Gemini Web (local)` provider using the
pinned MIT-licensed [gemini-web2api](https://github.com/Sophomoresty/gemini-web2api)
bridge.

It also adds `Perplexity Free (local)` using the pinned MIT-licensed
[Perplexity-AI-API](https://github.com/AndresDevvv/Perplexity-AI-API) bridge.

- The provider is seeded at `http://127.0.0.1:8081/v1` and is not made the
  default; OpenCode Free remains the default route.
- FreeCode starts the bundled Python bridge automatically when Python 3 is
  available, and keeps working normally when it is not.
- The model catalog refresh includes Gemini models without sending a generation
  request for every listed model.
- The model picker keeps the provider order: existing providers, Gemini Web,
  then Perplexity Free. Both optional groups refresh from their `/v1/models`
  endpoints and retain a static list while their bridge is offline.
- User configuration is stored at `<userData>/gemini-web2api/config.json` and
  is preserved across launches.

Real Gemini Pro routing still requires the corresponding Gemini account cookie;
without it, the upstream bridge falls back to Flash. Google may throttle or
change the private web protocol used by the bridge.

Perplexity basic text queries do not require a Perplexity account. The current
upstream bridge targets Linux x86_64 and is not automatically compiled/launched
by the Windows desktop; start it manually with `cargo run --release` on Linux.

## Español

FreeCode 0.3.1 agrega el provider local opcional `Gemini Web (local)` usando el
puente MIT fijado [gemini-web2api](https://github.com/Sophomoresty/gemini-web2api).

También agrega `Perplexity Free (local)` usando el puente MIT fijado
[Perplexity-AI-API](https://github.com/AndresDevvv/Perplexity-AI-API).

- El provider se siembra en `http://127.0.0.1:8081/v1` y no pasa a ser el
  predeterminado; OpenCode Free sigue siendo la ruta default.
- FreeCode arranca automáticamente el puente Python incluido cuando encuentra
  Python 3, y sigue funcionando normalmente si no está instalado.
- El refresh de modelos incluye Gemini sin enviar una generación por cada
  modelo listado.
- El selector conserva el orden de providers: los existentes, Gemini Web y
  luego Perplexity Free. Los dos grupos opcionales se actualizan desde sus
  endpoints `/v1/models` y conservan una lista estática mientras el puente está
  offline.
- La configuración queda en `<userData>/gemini-web2api/config.json` y se
  conserva entre arranques.

El ruteo real a Gemini Pro sigue requiriendo la cookie correspondiente de
Gemini; sin ella, el puente upstream vuelve a Flash. Google puede limitar o
cambiar el protocolo web privado que usa el puente.

Las consultas de texto básicas de Perplexity no requieren cuenta. El puente
upstream actual apunta a Linux x86_64 y el desktop de Windows no lo compila ni
lo arranca automáticamente; en Linux se puede iniciar manualmente con
`cargo run --release`.

### Release assets / Artefactos

- `FreeCode-DeepSeek-Harness-0.3.1-win-x64-setup.exe` — 278.1 MiB.
- `FreeCode-DeepSeek-Harness-0.3.1-win-x64-portable.exe` — 277.9 MiB.
- `FreeCode-DeepSeek-Harness-0.3.1-linux-x86_64.AppImage` — 185.9 MiB; SHA-256 `A5F8D4673FDEE34DE8706CED8D8C017A5476BB2161F9BE51A2DC1ADB71F3A7B4`.
- `deepseek-harness-runtime-0.1.1-rc.2-win32-x64.tar.gz` — 179.4 MiB; SHA-256 `f540298fc57cc92671f67ce583ac9dc092394382d76a274ca5620bacca99465c`.
- `latest.yml` and the NSIS blockmap are included for the Windows updater.

### Verification / Verificación

All release checks were run locally: shell tests, typecheck, contract tests,
runtime closure, Rust `cargo check`, Windows build, clean NSIS install/layout
smoke, 0.2.4-to-0.3.1 upgrade smoke with user-data preservation, and Linux
AppImage packaging/ELF validation. No GitHub Actions workflow was added.

Todos los checks de release se ejecutaron localmente: tests del shell,
typecheck, contratos, cierre del runtime, `cargo check` de Rust, build de
Windows, smoke de instalación NSIS limpia/layout, smoke de upgrade
0.2.4-a-0.3.1 preservando datos de usuario y empaquetado/validación ELF del
AppImage de Linux. No se agregó ningún workflow de GitHub Actions.
