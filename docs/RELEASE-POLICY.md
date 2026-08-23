# Release policy

Releases are performed manually from a maintainer workstation.

This repository intentionally has no GitHub Actions release workflow. Do not
add an automatic `push`, tag, or release workflow: FreeCode releases must not
consume the repository's free GitHub Actions quota.

Manual release checklist:

1. Run the local verification and packaging commands documented in the project
   scripts.
2. Review the generated installers and update metadata locally.
3. Create or update the GitHub release and upload the artifacts manually.
4. Write the description from `docs/RELEASE-NOTES-TEMPLATE.md` with both the
   `English` and `Español` sections, keeping facts aligned.
5. Record the version, commit, assets, and verification result in the release
   notes.

RTK documentation must keep the integration boundary explicit: it is an
optional, user-installed output compressor, not a bundled release dependency.
Before publishing, confirm that the package still runs when `rtk` is absent and
that the release notes state this in both language sections.
