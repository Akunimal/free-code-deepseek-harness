# Conversation UI / Interfaz de conversación

## English

FreeCode adds a CSS-only ambient background to upstream's `@deepseek-ai/dsh-client-ui-conversation`, on the `ConversationRoot` surface. Two theme-colored radial-gradient pseudo-elements drift independently with slow, compositor-friendly `transform: translate3d(...)` animations.

The layers use no image, canvas, timer, `requestAnimationFrame`, or new dependency. They are non-interactive (`pointer-events: none`), remain behind conversation content in an isolated stacking context, and add no DOM/accessibility nodes. `prefers-reduced-motion: reduce` stops both animations and leaves only a faint static tint. The release bundle verifier requires both effect-specific animation names; unrelated hero/composer animations are not sufficient evidence.

## Español

FreeCode agrega un fondo ambiental CSS-only a `@deepseek-ai/dsh-client-ui-conversation`, sobre la superficie `ConversationRoot` de upstream. Dos pseudo-elementos con gradientes radiales coloreados por el tema se desplazan de forma independiente mediante animaciones lentas y eficientes para el compositor con `transform: translate3d(...)`.

Las capas no usan imágenes, canvas, temporizadores, `requestAnimationFrame` ni dependencias nuevas. No interceptan la interacción (`pointer-events: none`), quedan detrás del contenido en un contexto de apilamiento aislado y no agregan nodos al DOM ni al árbol de accesibilidad. Con `prefers-reduced-motion: reduce` se detienen ambas animaciones y queda un tinte estático tenue. El verificador del bundle de release exige los dos nombres de animación específicos; las animaciones ajenas del hero o del composer no cuentan como evidencia.
