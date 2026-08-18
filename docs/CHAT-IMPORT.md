# Chat import

`@freecode/chat-importer` normalizes external conversations into the shared `InterchangeChat` schema. It is deliberately independent of Electron so it can be tested and reused by the shell or a future CLI.

## Supported sources

- OpenCode's real SQLite storage, including session metadata and message/tool rows.
- ChatML-like JSON/JSONL transcripts.
- Marker-aware repeated imports: stable markers prevent duplicating a conversation already imported into a workspace.

## Normalized model

An imported chat contains a version (`1`), source agent and source id, title, creation/update timestamps, optional workspace and model metadata, and ordered messages. Message content can be text or typed tool parts; tool calls and results preserve ids, inputs, outputs, and error state.

## Safety properties

- Unknown or malformed rows are rejected at the boundary instead of silently becoming assistant text.
- Source ids remain available for deduplication and traceability.
- Imports do not mutate the source database.
- Tool output is represented as data; it is not executed during import.

See `packages/chat-importer/src/opencode.ts`, `src/chatml.ts`, and `src/markers.ts` for the implementation and `tests/importer.test.ts` for fixtures.
