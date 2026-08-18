# Conversation UI

The conversation column is upstream's `@deepseek-ai/dsh-client-ui-conversation`. FreeCode adds a small CSS-only atmosphere directly to `ConversationRoot` so every conversation column has independent motion behind its transcript.

The effect uses two oversized radial-gradient layers animated with compositor-friendly `transform: translate3d(...)`. It has no canvas, no interval, no requestAnimationFrame loop, no image asset, and no new dependency. The layer is clipped, `pointer-events: none`, `aria-hidden`, and kept behind the conversation content. `prefers-reduced-motion: reduce` disables the animation and leaves a faint static tint.
