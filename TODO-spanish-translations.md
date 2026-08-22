# Traducciones al español — harness upstream

El shell (menus, splash, diálogos) ya tiene i18n ES/EN en `apps/shell/src/main/i18n.ts`.

El **harness web** (la UI interna de DeepSeek) conserva catálogos chino (zh), inglés
(en) y español (es), pero en el build desktop actual el selector visible sólo ofrece
inglés y chino. La exposición de español es una regresión conocida pendiente; no se
debe documentar como disponible hasta que el selector vuelva a mostrarla.

## Archivos principales

- `vendor/deepseek-harness/packages/client/locale/src/locales/en.ts` → copiar como `es.ts`
- `vendor/deepseek-harness/packages/client/locale/src/locales/settings.ts` → agregar ES
- `vendor/deepseek-harness/packages/client/locale/src/locales/index.ts` → registrar ES

## Archivos por componente (~20 archivos)

Cada paquete `ui-*` tiene su propio `locales.ts`:

```
vendor/deepseek-harness/packages/client/ui-chat/src/client/locales.ts
vendor/deepseek-harness/packages/client/ui-settings/src/client/locales.ts
vendor/deepseek-harness/packages/client/ui-sidebar/src/client/locales.ts
... (y ~17 más)
```

## Verificación realizada

- Se agregaron catálogos `es` a los 25 namespaces `locales.ts`, además de los
  catálogos base, settings y el selector de directorios.
- Se registró `es` en cada plugin que expone UI traducible y en la preferencia
  persistida `locale.preference`.
- Se verificó paridad de claves `zh/en/es`, typecheck upstream y las pruebas
  de locale, settings, conversación y directory picker.

## Nota

`zh.ts` sigue siendo el key-set de referencia (repo chino-first); `en` y `es`
se comprueban contra ese conjunto para evitar claves faltantes.
