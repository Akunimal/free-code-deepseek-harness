# Agent Note: Zero-trust desktop release gates own published-path verification

Status: implemented

English | [中文](2026-08-25-zero-trust-desktop-release-gates.zh.md)

## Problem

The desktop release path spans source bundles, NSIS hooks, installed runtime files, child-process visibility, and upgrade behavior. A source test can pass while a packaged installation still loses runtime directories or shortcuts.

## Decision

The repository owns a Windows `release:gate` that runs whitespace validation, the complete FreeCode workspace tests, contract tests, typechecks, the Windows ACL regression tests, desktop packaging, dynamic vendored-bundle freshness, and isolated fresh-install and 0.2.4-upgrade smokes. The installed-runtime smoke uses only temporary install and user-data directories, verifies the CLI and preflight, and probes descendant windows. NSIS post-extraction hooks may recreate missing Start Menu and Desktop links but may not delete or mutate the extracted payload.

The shortcut contract is explicit in the electron-builder configuration and is mechanically checked in the NSIS hook gate and release contract tests. Published release notes keep English and Spanish sections aligned with the artifact list and verification result.

## Alternatives considered

- **Rely on the installer defaults and a manual launch** — rejected because electron-builder preserves a `KeepShortcuts` registry state even when a link is absent, and a successful launch does not prove upgrade or shortcut behavior.
- **Run installation tests against the user's installation** — rejected because verification must not close or mutate an active FreeCode session.
- **Treat skipped or unrelated upstream suites as a release result** — rejected because only the product-scoped gates and their explicit platform limitations are evidence for this desktop artifact.

## Consequences

- Releases take longer on Windows because packaging and isolated installer smokes are mandatory.
- A release cannot be declared green when an installed-path smoke is skipped or interrupted.
- Full upstream suites may expose independent platform, credential, or environment failures; those failures remain separate from the product release gate and must not be silently relabeled as product coverage.
