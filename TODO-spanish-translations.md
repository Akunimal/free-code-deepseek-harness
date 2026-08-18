# Traducciones al español — harness upstream

El shell (menus, splash, diálogos) ya tiene i18n ES/EN en `apps/shell/src/main/i18n.ts`.

El **harness web** (la UI interna de DeepSeek) solo trae chino (zh) e inglés (en).
Para agregar español hay que traducir ~1100 strings en estos archivos:

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

## Pasos

1. Crear `es.ts` basado en `en.ts` (fuente de verdad para ES es la versión EN)
2. Traducir todos los strings
3. Registrar `es` en el index y settings
4. Agregar entries ES en cada `locales.ts` de los paquetes `ui-*`
5. Probar con `app.getLocale()` retornando `es-*`

## Nota

`zh.ts` es el key-set de referencia (repo chino-first). Pero para traducir
al español es más práctico partir del `en.ts`.
