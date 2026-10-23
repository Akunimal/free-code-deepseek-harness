# Contributing

FreeCode DeepSeek Harness is a Windows x64 Electron shell around a vendored copy
of the DeepSeek Harness web app, with a bundled Phoenix model gateway. Read the
[README](README.md) for what the product does and [docs/README.md](docs/README.md)
for the document map.

## Requirements

- **Windows x64** for the desktop build and the release gate. Linux, macOS and
  Windows ARM64 are not release targets. You can build elsewhere for development,
  but that output is not release evidence.
- **Node.js 24**, as pinned in [.nvmrc](.nvmrc). `engines` in
  [package.json](package.json) allows `>=22.19`; use 24.
- **pnpm 11.22.0**, as pinned by the `packageManager` field. Run `corepack enable`
  to use the pinned version.
- **Git**.

Do not share one `node_modules` between Windows and WSL. Native modules and
workspace links differ per OS. When you switch, reinstall for the OS you are
using. See [docs/UPSTREAM-PATCHING.md](docs/UPSTREAM-PATCHING.md).

## Setup

```bash
pnpm install --frozen-lockfile
pnpm apply:upstream-patches
pnpm build:vendor
```

`apply:upstream-patches` applies the ordered patch stack in `patches/upstream/`
to the vendored harness. It is idempotent and fails closed: if a patch no longer
applies, it stops and does not guess.

## Checks before opening a pull request

```bash
pnpm test
pnpm typecheck
```

- `pnpm test` applies the upstream patches first, then runs the tests of every
  package and app in sequence.
- `pnpm test:contract` runs the contract tests on their own. See
  [docs/CONTRACT-TESTS.md](docs/CONTRACT-TESTS.md).
- `pnpm verify:upstream-patches` checks the patch stack. Run it after any change to
  `patches/upstream/` or to the vendored subtree.

Add or update a test for each behavior you change.

## Changes to the vendored harness

`vendor/deepseek-harness` is a git subtree of the upstream DeepSeek Harness.

- Do not leave permanent direct edits inside `vendor/deepseek-harness`.
- Express each product change as a small, sorted patch in `patches/upstream/`,
  with a focused contract test and an idempotence check.
- Keep every product feature in an owner file, a patch, or shell-layer code.
- To update the subtree, follow [docs/UPSTREAM-SYNC.md](docs/UPSTREAM-SYNC.md)
  and [docs/UPSTREAM-PATCHING.md](docs/UPSTREAM-PATCHING.md). The required order
  is: fetch upstream, replay the patches, verify the patch manifest, test, build,
  package.

## Windows background processes

Shell-owned background processes on Windows must go through `freecode-launcher`
and the `headless-host` helper. Do not add a direct-spawn fallback, an environment
opt-out, or a process-name window hider. Explicit user GUI actions use the
authenticated Electron broker. See
[docs/HEADLESS-DESKTOP.md](docs/HEADLESS-DESKTOP.md).

## Releases

Release work is for maintainers. The release process is in
[docs/RELEASE.md](docs/RELEASE.md) and [docs/RELEASE-POLICY.md](docs/RELEASE-POLICY.md).

- Do not publish a release until the clean-cache runtime smoke in the release gate
  passes. A local cache, a mock, or a successful setup exit code is not evidence
  of a working first install. See [AGENTS.md](AGENTS.md).
- Do not inspect, stop, or reinstall over a user's running FreeCode instance to
  validate a release.

## Code style

- Match the style, naming, and comment density of the code around your change.
- Follow [.editorconfig](.editorconfig): UTF-8, LF line endings, 2-space indent,
  final newline.

## Documentation

- Technical documents are in English. User-facing documents are in English with a
  Spanish version (a `.es.md` sibling or a Spanish section). Keep the two versions
  in step when you change one.
- Add each new document to [docs/README.md](docs/README.md).
- Mark a document as historical when it stops describing the current release, and
  do not edit past release notes to match later behavior.
- User-visible changes go in [CHANGELOG.md](CHANGELOG.md).

## Commits and pull requests

- Use Conventional Commits, as the existing history does: `docs:`, `fix(shell):`,
  `fix(phoenix):`.
- Branch from `main`. The default branch is `origin/main`.
- In the pull request description, list what changed, the commands you ran, and
  whether the change touches the release gate, the patch stack or the packaging.
- Generated output stays out of git. `*.log`, `apps/shell/release-*/`, `dist/` and
  `node_modules/` are already in `.gitignore`. Do not force-add them.
