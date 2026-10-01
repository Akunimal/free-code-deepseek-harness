# Traducciones al español — harness upstream

El shell (menus, splash, diálogos) ya tiene i18n ES/EN en `apps/shell/src/main/i18n.ts`.

El **harness web** (la UI interna de DeepSeek) conserva catálogos chino (zh), inglés
(en) y español (es). En 0.8.0 el selector visible muestra correctamente español,
inglés y chino gracias al parche `141-*`.

## Estado actual (0.9.0)

✅ **Resuelto en 0.8.0, verificado en 0.9.0** — El locale español está
completamente funcional en la UI web. El parche
`141-freecode-spanish-translations.patch` agrega diccionarios `es` reales a 30
archivos `locales.ts` (~1000 claves), y los bundles de vendor se reconstruyeron
con `pnpm build:vendor` para que los cambios queden activos. El selector de
idioma renderiza español correctamente. El gate de 0.9.0 volvió a verificarlo.

## Archivos actualizados en el parche 141

- `vendor/deepseek-harness/packages/client/locale/src/locales/en.ts` (base)
- `vendor/deepseek-harness/packages/client/locale/src/locales/settings.ts` (ES agregado)
- `vendor/deepseek-harness/packages/client/locale/src/locales/index.ts` (ES registrado)

## Archivos por componente (~30 archivos)

Cada paquete `ui-*` tiene su propio `locales.ts` con clave `es` agregada:

```
vendor/deepseek-harness/packages/client/ui-chat/src/client/locales.ts
vendor/deepseek-harness/packages/client/ui-settings/src/client/locales.ts
vendor/deepseek-harness/packages/client/ui-sidebar/src/client/locales.ts
... (y ~27 más)
```

## Verificación realizada

- Se agregaron catálogos `es` a los 30 namespaces `locales.ts`, además de los
  catálogos base, settings y el selector de directorios.
- Se registró `es` en cada plugin que expone UI traducible y en la preferencia
  persistida `locale.preference`.
- Se verificó paridad de claves `zh/en/es`, typecheck upstream y las pruebas
  de locale, settings, conversación y directory picker.
- Se reconstruyeron los bundles de vendor con `pnpm build:vendor`.
- Se instaló la app 0.8.0 y se confirmó que el selector expone y renderiza
  español correctamente. Se reconfirmó en la instalación de 0.9.0.

## Nota

`zh.ts` sigue siendo el key-set de referencia (repo chino-first); `en` y `es`
se comprueban contra ese conjunto para evitar claves faltantes.
