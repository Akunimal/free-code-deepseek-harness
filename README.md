# FreeCode DeepSeek Harness

> Vibe coding on Windows with OpenCode Free models — open a project, describe what you want to build, and start.

[Leer en español](README.es.md)

![FreeCode with x-preview-f selected](docs/assets/capeng.jpg)

## English

## What is FreeCode?

FreeCode is the DeepSeek Harness desktop app with an OpenCode bridge already
configured. Its default free model pool comes from OpenCode Free. It gives you
a local coding workspace with chat, files, tools, sessions, and a persistent
embedded Chromium browser.

You do not need to install Node, pnpm, Git, OpenCode, or a separate worker
service to use the default Windows release. The optional Gemini Web provider
uses Python 3; FreeCode starts the bundled `gemini-web2api` bridge
automatically when Python is available.

## Start in three steps

1. Download the Windows installer or Linux AppImage from the [latest release](https://github.com/Akunimal/free-code-deepseek-harness/releases/latest).
2. Install FreeCode, open it, and choose your project folder.
3. Tell the model what you want to build in plain language.

The release also includes a Windows portable `.exe` if you do not want an
installer. The installer is the better choice for everyday use; the portable
build is useful when you want to carry the app with you. On Linux, download
the `.AppImage`, make it executable (`chmod +x`), and run it.

## What you get

- OpenCode Free models ready to use, including `x-preview-f` when it is available.
- A persistent Chromium browser for research and browser-based computer use.
- Headless tool calling for normal coding work; only the project selector needs
  to open a visible chooser when required.
- Sessions, workspaces, file tools, permissions, plans, questions, and the
  complete upstream Harness web experience.
- English, Spanish, and Chinese in the app, including native menus and tray.
- CSS conversation backgrounds with reduced-motion support.
- Automatic update checks with a small download-arrow indicator beside Settings when an update is ready.
- Automatic context compaction at 75% of the active model window, including when switching to a smaller-context model.
- Optional RTK output compression when an `rtk` executable is already installed; FreeCode never installs it automatically.
- Optional `Gemini Web (local)` provider backed by the MIT-licensed
  [`gemini-web2api`](https://github.com/Sophomoresty/gemini-web2api) bridge.
  It listens on `127.0.0.1:8081` and does not replace the default OpenCode
  Free route. Real Gemini Pro routing requires the corresponding Gemini
  account cookie; without it, the upstream bridge falls back to Flash.
- Optional `Perplexity Free (local)` provider backed by the MIT-licensed
  [`Perplexity-AI-API`](https://github.com/AndresDevvv/Perplexity-AI-API)
  bridge. It is listed at `127.0.0.1:3030`, needs no Perplexity account for
  basic anonymous text queries, and does not replace the default route.

## A few practical limits

The OpenCode Free route is shared and can be limited by upstream IP/session
rate limits. That means a response can take a while or temporarily fail.
FreeCode keeps the last known-good model selection, gives slow `x-preview-f`
probes extra time, and retries transient network failures. More workers improve
concurrency; they do not create more quota.

The upstream provider endpoint can also become temporarily unavailable and
return `503`, even when the API key is valid. A subsequent model/provider
mismatch may be displayed as `API key is invalid`; switching to a provider with
a supported, healthy model can recover the request, but changing provider alone
is not a guarantee.

### Gemini Web provider

FreeCode seeds a `Gemini Web (local)` provider at
`http://127.0.0.1:8081/v1` and keeps its model catalog in sync. If Python 3 is
installed, the app starts the vendored bridge automatically. If not, install
Python and `httpx`, or run the bridge separately on that port; the normal
OpenCode Free provider keeps working either way.

The bridge configuration is created at the app's user-data directory under
`gemini-web2api/config.json`. You can set `FREECODE_GEMINI_WEB2API_PORT` or
`FREECODE_GEMINI_WEB2API_PYTHON` before launching FreeCode. The upstream bridge
supports anonymous Flash access, optional cookies for Pro routing, native web
search, tool calling, and OpenAI-compatible Chat Completions.

### Perplexity Free provider

FreeCode also seeds `Perplexity Free (local)` at
`http://127.0.0.1:3030/v1`. Its models are read from the bridge's `/v1/models`
endpoint during refresh, so new upstream models can appear in the same picker
without changing the app. When the bridge is offline, the provider remains
visible with its last known-good/static model list.

The upstream bridge works without a Perplexity account for basic anonymous text
queries. The current upstream distribution targets Linux x86_64 and uses the
included `curl-impersonate` helper, so the Windows desktop lists the provider
but does not try to compile or launch that Rust server automatically. On Linux,
start it from the packaged source with `cargo run --release` inside
`resources/freecode/perplexity-api`; it defaults to loopback port 3030. A
session cookie is optional and is only needed for authenticated/Pro features,
higher limits, or image uploads.

## Updating

FreeCode checks automatically. When an update is found, click the download arrow
beside Settings. Releases are built and uploaded manually, with no GitHub Actions
release workflow, so the repository does not spend its free CI quota. The release checklist and bilingual notes are in
[docs/RELEASE-POLICY.md](docs/RELEASE-POLICY.md).

## For contributors

```bash
pnpm install
pnpm build:vendor
pnpm build
pnpm test
pnpm test:contract
pnpm build:desktop
```

More detail is available in [the architecture guide](docs/ARCHITECTURE.md),
[the feature inventory](docs/UPSTREAM-FEATURES.md),
[the release guide](docs/RELEASE.md), and
[the UI notes](docs/UI.md).

## Project

This is the public [Akunimal/free-code-deepseek-harness](https://github.com/Akunimal/free-code-deepseek-harness)
fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
The product branch is `main`; the upstream reference lives in
`vendor/deepseek-harness`.

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Español

> Vibecoding en Windows con modelos OpenCode Free: abrí un proyecto, describí lo que querés construir y empezá.

FreeCode es la aplicación de escritorio del DeepSeek Harness con un puente
OpenCode ya configurado. Su pool gratuito predeterminado usa modelos de
OpenCode Free. Te da un espacio local para programar con chat, archivos,
herramientas, sesiones y un navegador Chromium embebido con sesiones
persistentes.

No necesitás instalar Node, pnpm, Git, OpenCode ni un servicio separado de
workers para usar la release predeterminada de Windows. El provider opcional
Gemini Web usa Python 3 cuando lo seleccionás; FreeCode arranca el puente
`gemini-web2api` incluido cuando Python está disponible.

### Empezá en tres pasos

1. Descargá el instalador de Windows o la AppImage de Linux desde la [última release](https://github.com/Akunimal/free-code-deepseek-harness/releases/latest).
2. Instalá FreeCode, abrilo y elegí la carpeta de tu proyecto.
3. Contale al modelo en lenguaje natural qué querés construir.

La release también incluye un `.exe` portable si no querés instalar. Para uso
diario conviene el instalador; el portable sirve para llevar la aplicación a
otra carpeta o máquina. En Linux, descargá la `.AppImage`, dale permisos de
ejecución (`chmod +x`) y ejecutala.

### Qué incluye

- Modelos OpenCode Free listos para usar, incluido `x-preview-f` cuando está disponible.
- Navegador Chromium persistente para investigar y usar computer use desde el
  navegador.
- Tool calling headless para el trabajo normal; sólo el selector de proyecto
  abre un selector visible cuando hace falta.
- Sesiones, workspaces, herramientas de archivos, permisos, planes, preguntas
  y toda la experiencia web upstream del Harness.
- Inglés, español y chino en la aplicación, incluidos los menús nativos y la
  bandeja.
- Fondos CSS animados con soporte para reducir el movimiento.
- Comprobación automática de actualizaciones, con una flecha de descarga junto a Configuración cuando hay una nueva versión.
- Compactado automático al 75% del contexto del modelo activo, también al cambiar a un modelo con menor contexto.
- Compresión opcional de salidas con RTK si ya tenés el ejecutable `rtk`; FreeCode nunca lo instala automáticamente.
- Provider opcional `Gemini Web (local)` basado en el puente MIT
  [`gemini-web2api`](https://github.com/Sophomoresty/gemini-web2api). Escucha
  en `127.0.0.1:8081` y no reemplaza la ruta predeterminada OpenCode Free. El
  ruteo real a Gemini Pro requiere la cookie correspondiente de Gemini; sin
  ella, el puente upstream vuelve a Flash.
- Provider opcional `Perplexity Free (local)` basado en el puente MIT
  [`Perplexity-AI-API`](https://github.com/AndresDevvv/Perplexity-AI-API). Se
  lista en `127.0.0.1:3030`, funciona sin cuenta de Perplexity para consultas
  de texto anónimas básicas y no reemplaza la ruta default.

### Algunos límites prácticos

La ruta OpenCode Free es compartida y puede tener límites upstream por
IP/sesión. Una respuesta puede tardar o fallar temporalmente. FreeCode conserva
la última selección válida, da más tiempo a las probes lentas de `x-preview-f` y
reintenta fallos de red transitorios. Más workers mejoran la concurrencia, pero
no crean más cuota.

El endpoint del proveedor upstream también puede quedar temporalmente fuera de
servicio y devolver `503`, incluso cuando la API key es válida. Un desajuste
posterior entre proveedor y modelo puede mostrarse como `API key is invalid`;
cambiar a un proveedor con un modelo compatible y saludable puede recuperar la
solicitud, pero cambiar de proveedor por sí solo no lo garantiza.

### Provider Gemini Web

FreeCode siembra el provider `Gemini Web (local)` en
`http://127.0.0.1:8081/v1` y mantiene actualizado su catálogo de modelos. Si
tenés Python 3 instalado, la app arranca automáticamente el puente vendorizado.
Si no, instalá Python y `httpx`, o ejecutá el puente por separado en ese puerto;
el provider normal OpenCode Free sigue funcionando igual.

La configuración del puente se crea en el directorio de datos de la app, dentro
de `gemini-web2api/config.json`. Podés definir
`FREECODE_GEMINI_WEB2API_PORT` o `FREECODE_GEMINI_WEB2API_PYTHON` antes de abrir
FreeCode. El puente upstream soporta acceso Flash anónimo, cookies opcionales
para Pro, búsqueda web nativa, tool calling y Chat Completions compatible con
OpenAI.

### Provider Perplexity Free

FreeCode también siembra `Perplexity Free (local)` en
`http://127.0.0.1:3030/v1`. Durante cada refresh lee los modelos desde
`/v1/models`, por lo que los nuevos modelos upstream pueden aparecer en el
mismo selector sin cambiar la app. Si el puente está offline, el provider
queda visible con su última lista válida o la lista estática inicial.

El puente upstream funciona sin cuenta de Perplexity para consultas de texto
anónimas básicas. La distribución actual apunta a Linux x86_64 y usa el helper
incluido `curl-impersonate`; por eso el desktop de Windows muestra el provider
pero no intenta compilar ni arrancar automáticamente ese servidor Rust. En
Linux podés arrancarlo desde el código empaquetado con `cargo run --release`
dentro de `resources/freecode/perplexity-api`; por defecto escucha en loopback,
puerto 3030. La cookie de sesión es opcional y sólo hace falta para funciones
autenticadas/Pro, más límites o carga de imágenes.

### Actualización

FreeCode busca actualizaciones automáticamente. Cuando encuentra una, usá la
flecha de descarga junto a Configuración. Las releases se compilan y suben
manualmente, sin workflow de release de GitHub Actions, para no consumir la cuota
gratuita de CI. El checklist y las notas bilingües están en
[docs/RELEASE-POLICY.md](docs/RELEASE-POLICY.md).

### Para contribuir

```bash
pnpm install
pnpm build:vendor
pnpm build
pnpm test
pnpm test:contract
pnpm build:desktop
```

Más detalle en [la guía de arquitectura](docs/ARCHITECTURE.md),
[el inventario de funciones](docs/UPSTREAM-FEATURES.md),
[la guía de releases](docs/RELEASE.es.md) y
[las notas de UI](docs/UI.md), el [roadmap](docs/ROADMAP.md) y los
[problemas conocidos](docs/KNOWN-ISSUES.md).

### Proyecto

Este es el fork público [Akunimal/free-code-deepseek-harness](https://github.com/Akunimal/free-code-deepseek-harness)
de [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
La rama de producto es `main` y la referencia upstream está en
`vendor/deepseek-harness`.

MIT — ver [LICENSE](LICENSE) y [NOTICE](NOTICE).

## Related projects / Proyectos relacionados

FreeCode integrates and builds on these open-source projects:

- [OpenCode2API](https://github.com/jasonxu114514/opencode2api) — local OpenCode-compatible bridge and worker pool used by the free-model route. / Puente local compatible con OpenCode y pool de workers usado por la ruta de modelos gratuitos.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — upstream agent harness and plugin-based web runtime. / Harness de agentes upstream y runtime web basado en plugins.
- [gemini-web2api](https://github.com/Sophomoresty/gemini-web2api) — optional MIT-licensed OpenAI-compatible bridge for Gemini Web. / Puente opcional MIT compatible con OpenAI para Gemini Web.
- [Perplexity-AI-API](https://github.com/AndresDevvv/Perplexity-AI-API) — optional MIT-licensed no-account OpenAI-compatible bridge for Perplexity. / Puente opcional MIT compatible con OpenAI para Perplexity sin cuenta.
- [RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) — optional CLI output compressor that can reduce model-facing shell output. / Compresor opcional de salidas CLI que puede reducir lo que llega al contexto del modelo.
- [Caveman](https://github.com/JuliusBrussee/caveman) — candidate optional response/context compression layer under evaluation; not bundled or installed by FreeCode. / Capa opcional candidata de compresión de respuestas/contexto en evaluación; FreeCode no la incluye ni la instala.

RTK is not bundled, downloaded, or installed by FreeCode. When the RTK toggle is enabled and an `rtk` executable is already available, FreeCode wraps only eligible plain CLI commands; pipelines, redirects, substitutions, and other shell syntax are left unchanged. If RTK is missing, execution falls back to the original command.
