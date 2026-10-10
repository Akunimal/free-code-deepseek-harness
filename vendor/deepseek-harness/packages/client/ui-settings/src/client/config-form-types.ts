/**
<<<<<<<< HEAD:vendor/deepseek-harness/packages/client/ui-settings/src/client/settings-contract.ts
 * Settings-namespace scope contracts owned beside the settings transport.
========
 * Client configuration values and atomic write operations.
>>>>>>>> 15a4129ecf332e3e1018f26ee50c49f3f0b2054d:vendor/deepseek-harness/packages/client/ui-settings/src/client/config-form-types.ts
 */

import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'

/** Client-side sync state of one settings namespace. */
export interface ConfigFormSnapshot<T> {
  /**
   * `loading` until the first accepted section, `ready` while one stands, and
   * `unavailable` when the namespace is not exposed to this client or the
   * connection keeps preferences process-local (memory mode).
   */
  status: 'loading' | 'ready' | 'unavailable'
  /** Last accepted schema-resolved section; undefined before the first acceptance. */
  value: T | undefined
  /**
   * Composition layer the Host resolved {@link value} over, when the owning
   * plugin declared one. What a field reverts to once cleared.
   */
  base: unknown
  /**
   * Raw user layer as stored, when one exists. A field's PRESENCE here is what
   * marks it overridden — an override whose value equals the composition
   * default is still an override, and comparing values could not see it.
   */
  user: unknown
  /** Namespace revision fencing the next write; undefined before the first Host view. */
  revision: number | undefined
  /** Whether the Host document accepts writes; memory mode never does. */
  writable: boolean
  /** `host` syncs with the Host document; `memory` keeps a remote browser process-local. */
  mode: 'host' | 'memory'
}

/**
<<<<<<<< HEAD:vendor/deepseek-harness/packages/client/ui-settings/src/client/settings-contract.ts
 * Reactive owner handle over one namespace's durable section — the browser
 * mirror of the Host-side `SettingsScope` owner seam. Domain services read
 * and observe the snapshot and route explicit user choices through its
 * mutation methods.
========
 * Accepted values and serialized writes shared by editors of one Host entry.
>>>>>>>> 15a4129ecf332e3e1018f26ee50c49f3f0b2054d:vendor/deepseek-harness/packages/client/ui-settings/src/client/config-form-types.ts
 */
export interface ConfigForm<T> {
  /** @returns the current sync snapshot (stable reference until the next change). */
  getSnapshot(): ConfigFormSnapshot<T>
  /**
   * Observe snapshot replacements.
   * @param listener - invoked after each snapshot change.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void
  /**
   * Queue one atomic namespace mutation. All operations share one revision
   * fence, Host validation, persistence decision, and recovery read. Supplying
   * `expectedRevision` preserves an earlier read as the fence instead of using
   * the latest queued or mirrored revision.
   * @param ops - ordered field operations copied when queued.
   * @param expectedRevision - optional fixed revision read by the domain editor.
<<<<<<<< HEAD:vendor/deepseek-harness/packages/client/ui-settings/src/client/settings-contract.ts
   * @returns settlement after the mutation and any latest-write recovery read.
   */
  mutate(ops: readonly SettingsPathOpView[], expectedRevision?: number): Promise<void>
========
   * @returns true for Host acceptance, false for refusal or skipped writes, after any latest-write recovery.
   * Transport failures reject.
   */
  mutate(ops: readonly SettingsPathOpView[], expectedRevision?: number): Promise<boolean>
>>>>>>>> 15a4129ecf332e3e1018f26ee50c49f3f0b2054d:vendor/deepseek-harness/packages/client/ui-settings/src/client/config-form-types.ts
  /**
   * Queue one field write. Rapid writes preserve mutation order, each carries
   * the latest known namespace revision, and only the latest settlement may
   * publish; a Host-refused latest write reloads Host state instead.
   * @param field - scalar field inside the namespace section.
   * @param value - JSON-shaped value selected by the user.
   * @returns true for Host acceptance, false for refusal or skipped writes, after any latest-write recovery.
   * Transport failures reject.
   */
  set(field: string, value: unknown): Promise<boolean>
  /**
   * Queue one field clear, so the field re-inherits the composition layer.
   * Shares {@link set}'s ordering, revision, and recovery contract.
   * @param field - scalar field inside the namespace section.
   * @returns true for Host acceptance, false for refusal or skipped writes, after any latest-write recovery.
   * Transport failures reject.
   */
  unset(field: string): Promise<boolean>
}
