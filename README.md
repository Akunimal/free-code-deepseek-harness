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

You do not need to install Node, pnpm, Git, Python, OpenCode, or a separate
worker service to use the Windows release.

## Start in three steps

1. Download the Windows installer from [Release v0.1.8](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.1.8).
2. Install FreeCode, open it, and choose your project folder.
3. Tell the model what you want to build in plain language.

The release also includes a portable `.exe` if you do not want an installer.
The installer is the better choice for everyday use; the portable build is
useful when you want to carry the app with you.

## What you get

- OpenCode Free models ready to use, including `x-preview-f` when it is available.
- A persistent Chromium browser for research and browser-based computer use.
- Headless tool calling for normal coding work; only the project selector needs
  to open a visible chooser when required.
- Sessions, workspaces, file tools, permissions, plans, questions, and the
  complete upstream Harness web experience.
- English, Spanish, and Chinese in the app, including native menus and tray.
- CSS conversation backgrounds with reduced-motion support.
- An in-app update check from the Help menu.

## A few practical limits

The OpenCode Free route is shared and can be limited by upstream IP/session
rate limits. That means a response can take a while or temporarily fail.
FreeCode keeps the last known-good model selection, gives slow `x-preview-f`
probes extra time, and retries transient network failures. More workers improve
concurrency; they do not create more quota.

## Updating

Use Help → Check for updates. Releases are built and uploaded manually, with no
GitHub Actions release workflow, so the repository does not spend its free CI
quota. The release checklist and bilingual notes are in
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

No necesitás instalar Node, pnpm, Git, Python, OpenCode ni un servicio de
workers separado para usar la release de Windows.

### Empezá en tres pasos

1. Descargá el instalador de Windows desde la [release v0.1.8](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.1.8).
2. Instalá FreeCode, abrilo y elegí la carpeta de tu proyecto.
3. Contale al modelo en lenguaje natural qué querés construir.

La release también incluye un `.exe` portable si no querés instalar. Para uso
diario conviene el instalador; el portable sirve para llevar la aplicación a
otra carpeta o máquina.

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
- Actualización integrada desde Ayuda → Buscar actualizaciones.

### Algunos límites prácticos

La ruta OpenCode Free es compartida y puede tener límites upstream por
IP/sesión. Una respuesta puede tardar o fallar temporalmente. FreeCode conserva
la última selección válida, da más tiempo a las probes lentas de `x-preview-f` y
reintenta fallos de red transitorios. Más workers mejoran la concurrencia, pero
no crean más cuota.

### Actualización

Usá Ayuda → Buscar actualizaciones. Las releases se compilan y suben
manualmente, sin workflow de release de GitHub Actions, para no consumir la
cuota gratuita de CI. El checklist y las notas bilingües están en
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
[las notas de UI](docs/UI.md).

### Proyecto

Este es el fork público [Akunimal/free-code-deepseek-harness](https://github.com/Akunimal/free-code-deepseek-harness)
de [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
La rama de producto es `main` y la referencia upstream está en
`vendor/deepseek-harness`.

MIT — ver [LICENSE](LICENSE) y [NOTICE](NOTICE).
