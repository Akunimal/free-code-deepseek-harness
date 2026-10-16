# Repository coding and release rules

## Clean-install proof for external runtimes

When a desktop release downloads a runtime separately on first launch, never
claim that a fresh installation works and never publish the release until the
mandatory release gate has completed a real clean-cache first-run smoke. The
required evidence is a public clean-cache runtime smoke, not an offline cache hit.
The smoke must start from a newly created empty app profile and runtime cache, use
the same production bootstrap/updater and packaged Electron ABI as the release,
fetch the exact public GitHub runtime asset, verify its SHA-256, extraction
layout, manifest and ABI, then start the downloaded CLI hidden and successfully.
The test must fail closed if the public asset, network, checksum, manifest, ABI
or CLI startup is unavailable or mismatched.

Mocks, unit tests alone, static hashes, a local/preloaded runtime cache, a
successful setup exit code, or a runtime copied into the test profile are not
evidence of a working first install. Keep the smoke as a mandatory release-gate
step and protect its Electron environment, empty-cache setup, hidden child
process and public download with a regression contract. If the smoke cannot
complete, state exactly what is unverified and hold publication; do not soften
the gate or describe a local cached install as a clean-install pass.

Keep every smoke profile/cache and child process isolated and test-owned. Do
not inspect, stop, restart, install over, or otherwise interfere with a user's
running FreeCode instance to perform release validation.
