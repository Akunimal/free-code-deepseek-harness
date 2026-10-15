/**
 * ModelDirectoryResolver (`ctx.modelDirectories`): the root owner of per-session
 * {@link ModelDirectory} instances. Both selection entries (the /model popup
 * and the composer model seat) resolve their session's directory through
 * this service, which is what makes the dual entry one shared state.
 *
 * Per-session storage follows the client service pattern (InputTriggerService /
 * CommandUiRuntime): a lazy service-internal map whose entry is deleted by the
 * owning scope's disposer. The host `dsh-scope` ScopedLayers registry does
 * does not belong here: it derives scope from the host carrier mechanism
 * (object-keyed), while client scopes tag contexts with branded SessionId
 * strings, and it models global+shadow named registries — this is a
 * per-session singleton with no global layer to merge.
 */
import type {} from '@deepseek-ai/dsh-client-product-analytics/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ComposerBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { WeakMapWithValues } from '@deepseek-ai/dsh-util-values'
import { ModelCatalogDirectory } from './catalog.ts'
import { ModelDirectory } from './directory.ts'
import type { ModelKey } from './locales.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelDirectories: ModelDirectoryResolver
  }
}

/** Live mutable state in one holder (service methods run behind the caller-ctx tracker). */
interface LiveState {
  /** Directories keyed by Client binding, removed by their scope disposer. */
  readonly directories: WeakMapWithValues<SessionBinding, ModelDirectory>
}

/** The `ctx.modelDirectories` session model-selection service. */
export class ModelDirectoryResolver extends Service {
  static inject = ['conversation', 'sessions', 'remote', 'remote.session']

  private readonly live: LiveState = { directories: new WeakMapWithValues() }
  private readonly catalog: ModelCatalogDirectory

  /**
   * @param ctx - owning root context (the service registers itself as `models`).
   */
  constructor(ctx: Context) {
    super(ctx, 'modelDirectories')
    this.catalog = new ModelCatalogDirectory(ctx)
    void this.catalog.load().catch(() => { /* selectors expose the shared error */ })
    ctx.on('connection/reset', () => {
      this.catalog.resetGeneration()
      for (const directory of this.live.directories.values) directory.resetConnected()
    })
    ctx.remote.$on('llm/adapters-updated', () => { this.catalog.refresh() })
    ctx.remote.$on('settings/document-updated', () => { this.catalog.refresh() })
    ctx.remote.$on('credentials/record-updated', () => { this.catalog.refresh() })
    ctx.remote.$on('credentials/reference-updated', () => { this.catalog.refresh() })
  }

  /**
   * Resolve the per-session shared directory (lazy; the scope disposer
   * removes and disposes it). Unknown sessions fail loud.
   * @param sessionId - the owning session.
   * @returns the resident directory both entries share.
   */
  directoryFor(sessionId: SessionId): ModelDirectory {
    const { live } = this
    const sessions = this.ctx.sessions
    const actx = sessions.scope(sessionId)
    if (actx === undefined) throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no scope`)
    const binding = sessions.binding(sessionId)
    if (binding === undefined) throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no binding`)
    const existing = live.directories.get(binding)
    if (existing !== undefined) return existing
    const directory = new ModelDirectory(
      this.ctx.remote.session,
      sessionId,
      () => sessions.subagentAddress(sessionId) === undefined,
      this.catalog,
      binding.session.projections.faceOf('modelSelection'),
      () => binding.session.getSnapshot().blank,
      (name, attributes) => this.ctx.get('productAnalytics')?.track(name, attributes),
    )
    live.directories.set(binding, directory)

    // Client-side affordance only: the Host independently rejects a prompt
    // whose saved route disappeared, but the composer should explain and
    // prevent that doomed submission before the user sees an upstream 400.
    const blocks = this.ctx.conversation.blocks
    const blockStore = blocks.storeFor(sessionId)
    let ownedBlock: ComposerBlock | undefined
    let ownedReasonKey: ModelKey | undefined
    const syncComposerBlock = (): void => {
      // These model RPCs and the composer block belong only to ordinary
      // sessions, not addressed subagent views.
      if (sessions.subagentAddress(sessionId) !== undefined) return
      const state = directory.store.getSnapshot()
      let reason: ModelKey | null | undefined
      if (state.status === 'ready') {
        if (state.current === null) {
          reason = state.groups.length === 0 ? 'blocked.noModels' : 'blocked.choose'
        } else if (state.routable === true) {
          reason = null
        } else if (state.routable === false) {
          reason = state.groups.length === 0 ? 'blocked.noModels' : 'blocked.unavailable'
        }
      } else if (state.status === 'error' && state.current === null && state.groups.length === 0) {
        reason = 'blocked.noModels'
      }
      // Loading/refreshing is not a new availability decision: keep an
      // existing block until a ready catalog verifies or rejects the route.
      if (reason === undefined) return

      const currentBlock = blockStore.getSnapshot()
      if (reason === null) {
        if (ownedBlock !== undefined && currentBlock === ownedBlock) {
          ownedBlock = undefined
          ownedReasonKey = undefined
          blocks.set(sessionId, undefined)
        } else if (currentBlock !== ownedBlock) {
          ownedBlock = undefined
          ownedReasonKey = undefined
        }
        return
      }

      if (currentBlock !== undefined && currentBlock !== ownedBlock) {
        // Another feature owns the more specific block; never clear or
        // overwrite it. The block-store subscription retries when it changes.
        ownedBlock = undefined
        ownedReasonKey = undefined
        return
      }
      const localizedReason = this.ctx.locale.bind('model')(reason)
      if (currentBlock === ownedBlock && ownedBlock !== undefined
        && ownedReasonKey === reason && ownedBlock.reason === localizedReason) return
      ownedReasonKey = reason
      ownedBlock = { reason: localizedReason }
      blocks.set(sessionId, ownedBlock)
    }
    const unsubscribeDirectory = directory.store.subscribe(syncComposerBlock)
    const unsubscribeBlock = blockStore.subscribe(syncComposerBlock)
    syncComposerBlock()
    actx.effect(() => () => {
      unsubscribeDirectory()
      unsubscribeBlock()
      if (ownedBlock !== undefined && blockStore.getSnapshot() === ownedBlock) {
        blocks.set(sessionId, undefined)
      }
      directory.dispose()
      live.directories.delete(binding)
    }, 'ui-model-selection: session directory')
    return directory
  }
}
