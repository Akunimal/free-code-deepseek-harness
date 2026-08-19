# Agent Note: Workspace Registration Deletion

Status: implemented

English | [中文](2026-07-27-workspace-registration-deletion.zh.md)

## Problem

A Workspace registers an existing code directory so the GUI can name it and order its Sessions. That record does not say that Harness created or owns the directory, and the Session log is an independent persistence object. Treating the row's Delete action as recursive source deletion or Session deletion would destroy data outside the record's ownership boundary.

The existing visual-only menu row also left deletion semantics undefined across durable order, the Workspace table, Host streams, concurrent browser tabs, reconnect baselines, and a list request racing the mutation.

## Decision

`ctx.workspaceRegistry.delete(id)` deletes only the Workspace registration: its id leaves durable `workspaceIds`, its `workspaces` table row and entity-cache entry disappear, and its ordered `sessionIds` account disappears with that row. Before the table deletion, every currently accounted Session id is added to the registry-global archive set. It never calls filesystem removal or `SessionPersistence`; the directory, every user file, every live Session, and every persisted Session log remain. Archived Sessions are hidden from grouping surfaces, so deleting a Workspace cannot leave its Sessions as Ungrouped rows.

Unknown ids return `false` at the domain contract. `workspace.delete({ workspaceId })` maps that distinction to `workspace-not-found`; success returns `{ deleted: true }`. `workspace.list` remains the reconnect baseline.

## Durable commit and publication

Registry operations serialize create and delete. Deletion first writes the Workspace order without the id and the updated archive set, then removes the entity from the cache, then deletes the table row. The table deletion is the notification commit point: the package invariant accepts it only after the cache stopped publishing the entity, and the Host emits `host/workspace-removed` only from that committed deletion. A table-write failure restores the cache, prior durable order, and prior archive set; no removal frame is published.

The Host stream keeps its committed-id set through the preceding global-order write and removes the id only on the table deletion. Create rollback therefore emits no false removal, while every connected tab receives exactly the id needed to delete its projection.

The Host also suppresses the staged archive-set frame while a delete pending marker is present. The archive frame is emitted only after the table deletion has committed; a failed row write therefore cannot transiently hide Sessions in another tab.

Create and delete write a durable `pendingMutation` before their record/order pair can diverge. Startup completes only the operation named by that marker and clears it; an orphan row alone does not identify which operation was interrupted. Unmarked order/table divergence therefore retains the registry's fail-loud corruption behavior. A deletion whose table write committed but marker cleanup failed still reports success—the requested state and removal frame are already committed—and the next startup clears that marker idempotently.

## Client convergence

`WorkspaceManager` treats both `host/workspace-changed` and `host/workspace-removed` as ordered deltas replayed over an in-flight `workspace.list` response. A successful unary delete removes the row immediately instead of waiting for its own stream echo. Removal is idempotent, and a process-local tombstone rejects late changed frames or stale baseline rows for the never-reused Workspace id. A reconnect still refreshes from `workspace.list`; Session state is never pruned by a Workspace delta.

The delete confirmation remains pending until the React Workspace projection has committed the removed id, so the next Workspace gesture cannot observe or target one stale list frame.

## Confirmation interaction

The existing Workspace row menu opens a shared `Modal` before deletion. The text states all three consequences: the Workspace leaves the list, the folder and session logs remain, and its Sessions are archived rather than shown under Ungrouped. While the request is pending, the confirm and Cancel controls are disabled, duplicate confirmation is ignored, and Escape or Close cannot dismiss the operation. Failure keeps the Modal open with the error; Cancel, Escape, and Close before submission never delete.

The menu, Modal, and buttons retain their existing structure and design tokens. Session deletion remains visual-only and outside this decision.

## Alternatives considered

**Cascade-delete Sessions.** Rejected because Workspace registration does not own Session persistence. Archive preserves histories without making Workspace deletion destructive; Session deletion needs its own lifecycle, running checks, descendant semantics, and explicit UI.

**Leave Sessions under Ungrouped.** Rejected because deleting a Workspace would leave the user with the same histories as orphan rows and no owning Workspace. The existing registry-global archive set hides them consistently across tabs while preserving the logs for a future unarchive surface.

**Move the folder to Trash.** Rejected because the record cannot prove directory ownership. A future destructive filesystem action must be separately named, separately confirmed, and enforce explicit safety boundaries.

**Delete the table row and repair order later.** Rejected because a crash or write failure would leave an initialized registry whose order and table disagree. The registry updates both under one serialized operation and restores the prior order on table failure.

**Delete every unreferenced row at startup.** Rejected because the same shape can come from unexplained order corruption; silently discarding it could lose Workspace metadata and Session accounting. Recovery requires the explicit pending marker written by the owning mutation.

**Refetch both lists after success.** Rejected because the committed removal frame plus immediate unary echo is sufficient, preserves the current Session object, and avoids turning a local mutation into two list requests. Reconnect baselines remain the repair path.

## Verification

Workspace package tests pin successful registration deletion with session archiving, same-path re-registration, unknown-id idempotence, table-failure rollback of the archive set, explicit-marker restart recovery, unexplained-corruption rejection, and cache/table invariant behavior. Apiproxy and carrier tests pin the schema, handler, `workspace-not-found`, retained Session/folder, archived-session frame, fresh-id re-registration, and committed `host/workspace-removed` frame. Client tests pin unary direct echo, duplicate removal, late changed frames, and deletion racing an in-flight baseline. Component tests pin confirmation, projection-settled closing, success-frame-before-unary ordering, failure, Cancel, Escape, and Close. The browser scenario observes every transient alert, slot error, console error, and page error while reusing a deleted title for a different directory.

The assembled keyless Web scenario registers an existing temporary project directory, accounts a persisted Session, makes that Session current, confirms deletion in Chromium, and verifies the Workspace group disappears while the archived Session does not appear under Ungrouped. It checks the user file and JSONL log before and after deletion and repeats the UI, directory, archive-set, and log assertions after reload.

## Consequences

Deleting a Workspace is intentionally non-destructive for directories and Session logs, and reversible at the registration level by registering the same directory again with a fresh id. Its prior manual Session order is gone, and its old Sessions remain archived rather than being automatically re-adopted after bootstrap. A future unarchive surface can restore those histories; until then, deletion gives up one-click cleanup in exchange for a deletion boundary that matches what the record actually owns.
