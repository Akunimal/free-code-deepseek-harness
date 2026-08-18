# Workspace bridge

`@freecode/workspace-bridge` continues an imported OpenCode conversation inside a selected workspace. It combines an `InterchangeChat` with an RPC client and emits the continuation request without coupling the importer to Electron.

## Flow

1. Discover/import a source conversation.
2. Select a destination workspace and provider/model.
3. Build a continuation payload containing the normalized history, source marker, and workspace context.
4. Send it through the configured RPC transport.
5. Return the new session id or a typed failure; the original conversation stays unchanged.

The bridge is intentionally idempotent around the importer marker and keeps transport errors separate from parsing errors. `tests/bridge.test.ts` covers the continuation and failure paths.
