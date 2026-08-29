# Mega Plan — FreeCode DeepSeek Harness v0.4.0

**Fecha:** 2026-08-29
**Baseline:** v0.3.2 → v0.4.0
**Objetivo:** Release completa con updater fix, Caveman integrado, upstream sync, y todas las mejoras del roadmap.

---

## Resumen ejecutivo

v0.4.0 es una release mayor que consolida todo lo pendiente:
1. **Fix del actualizador** (known issue v0.3.2 → v0.3.3)
2. **Integración de Caveman** como toggle opcional junto a RTK
3. **Sync con upstream** deepseek-harness (actualmente en v0.1.1-rc.2)
4. **Documentación** — fix drift español, actualizar ROADMAP y CHANGELOG
5. **Build, test, commit, push, release** — todo el pipeline completo

---

## Fase 1: Fix del Actualizador (v0.3.3 scope)

### Problema
El actualizador detecta releases y descarga correctamente, pero:
- El instalador NSIS queda en `pending/` sin ejecutarse
- `install-version.txt` no se actualiza
- No hay notificación visible en la tray durante la instalación
- El botón de actualización usa un círculo independiente, no alineado con "Enviar"

### Archivos a modificar

#### 1.1 Botón de actualización alineado con "Enviar"
**Archivo:** `apps/shell/src/main/index.ts` → `renderUpdateIndicatorHtml()` (línea ~357)

- Reemplazar el indicador circular (`border-radius:50%`, `width:32px;height:32px`) por un botón con la misma geometría que el botón de enviar del Harness
- Mantener la flecha hacia abajo (`&#8595;`) como icono
- Conservar el tooltip `t('update.indicator')` y aria-label accesible
- El botón debe aparecer junto a Configuración en el sidebar

```typescript
// Cambio propuesto en renderUpdateIndicatorHtml():
// Antes: círculo aislado con border-radius:50%
// Después: botón con misma geometría que "Enviar"
function renderUpdateIndicatorHtml(): string {
  const label = t('update.indicator');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}
a{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;
  color:#c9ced8;background:#262a33;border:1px solid #3c424e;border-radius:8px;
  font:600 14px/1 system-ui,-apple-system,sans-serif;cursor:pointer;box-shadow:0 2px 8px #0005;
  padding:6px 10px;gap:4px}
a:hover{color:#fff;background:#343a46;border-color:#6b7484}a:active{transform:translateY(1px)}
</style></head><body><a href="freecode://updates/open" aria-label="${label}" title="${label}">&#8595; Update</a></body></html>`;
}
```

#### 1.2 Notificación nativa en tray durante instalación
**Archivo:** `apps/shell/src/main/index.ts` → función `downloadAndInstall` del update service (línea ~854)

- Antes de `harnessUpdater.downloadAndInstall(info)`, emitir `Notification` nativa:
  ```typescript
  new Notification({
    title: t('update.installing.title'),    // "FreeCode se está actualizando"
    body: t('update.installing.body'),       // "La aplicación se reiniciará pronto..."
  }).show();
  ```
- Cubrir ambas rutas: `downloadAndInstall` (app completa) y `installHarness` (runtime only)
- Agregar claves i18n en `apps/shell/src/main/i18n.ts` para EN/ES/ZH

#### 1.3 Fix de instalación in-app
**Archivo:** `apps/shell/src/main/updater.ts` → `downloadAndInstall()` (línea ~183)

El problema actual: `adapter.quitAndInstall()` se llama pero el instalador NSIS no se ejecuta correctamente porque electron-updater necesita que `downloadUpdate()` haya completado y el path del instalador sea correcto.

```typescript
// Fix propuesto:
async downloadAndInstall() {
  if (!enabled) return { status: 'disabled' };
  try {
    const checked = await this.check();
    if (!checked.info?.version) {
      return { status: 'failed', error: checked.error ?? 'No release update is ready to download' };
    }
    adapter ??= await loadElectronUpdater();
    adapter.autoDownload = false;  // ← No auto-download, we manage it
    adapter.autoInstallOnAppQuit = false;  // ← We handle install explicitly
    
    // 1. Download explicitly
    if (adapter.downloadUpdate) await adapter.downloadUpdate();
    
    // 2. Log the install path for debugging
    log('update downloaded, initiating install', { version: checked.info.version });
    
    // 3. quitAndInstall with force
    adapter.quitAndInstall(true);  // true = forceRunAfter
    
    return { status: 'installed' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('update download failed', message);
    return { status: 'failed', error: message };
  }
}
```

**Nota:** También verificar que `electron-builder.yml` tenga la configuración correcta para auto-update (`publish` section con GitHub provider).

#### 1.4 Verificación post-instalación
**Archivo:** `apps/shell/src/main/index.ts` → `writeInstallMarker()` (línea ~79)

- Después del reinicio, verificar que `install-version.txt` coincida con `app.getVersion()`
- Si no coincide, logear error y notificar al usuario
- Consumir el archivo pendiente en `pending/` después de instalación exitosa

### Tests
- **Archivo:** `apps/shell/tests/updater.test.ts`
- Agregar test para `quitAndInstall(true)` con force flag
- Agregar test para la verificación post-instalación
- Agregar test para las notificaciones de tray

---

## Fase 2: Integración de Caveman

### Contexto
Caveman es un compresor de contexto que funciona con cualquier IA. El usuario quiere que esté como toggle opcional junto a RTK, sin medición — solo integrar y listo.

### Patrón RTK detallado (5 capas)

| Capa | Archivo(s) | Qué hace |
|------|-----------|----------|
| **1. Core Logic** | `shell/shell/src/rtk.ts` (37 líneas) | `resolveRtk()` (probe PATH), `canUseRtk()` (safety gate), `wrapWithRtk()` (prepend) |
| **2. Export** | `shell/shell/src/index.ts:39` | `export { canUseRtk, resolveRtk, wrapWithRtk } from './rtk.ts'` |
| **3. Executor** | `bash-local/src/index.ts:163`, `pwsh-local/src/index.ts:206` | `rtk?: boolean` config (default `true`), `rtkInstalled` cached in constructor, wrapping en `resolve()` |
| **4. UI Toggle** | `ui-settings-plugins/src/client/bash-card-controller.ts:48`, `BashCard.tsx:59-71`, `locales.ts` | `booleanField('rtk')` → `ToggleField` → i18n `bashRtk`/`bashRtkHint` |
| **5. Tests** | `rtk.spec.ts`, `settings.spec.ts`, UI specs, contract tests | Unit + integration + UI render |

**Key design decisions:**
- Toggle defaults `true` but is a **complete no-op** when binary missing (safe fallback)
- Binary probed **once** at executor construction (`resolveRtk()`), not per command
- `resolve()` is the single wrapping point — gated by `this.config.rtk === true && this.rtkInstalled`
- Shell metacharacters rejected by regex: `| & ; < > ` $ ( ) { }` never pass safety gate
- UI uses generic `CardForm` + `booleanField` — no RTK-specific code beyond locale strings

### Archivos a crear/modificar para Caveman

#### 2.1 Módulo Caveman wrapper
**Archivo nuevo:** `vendor/deepseek-harness/packages/shell/shell/src/caveman.ts`

Seguir exactamente el patrón de `rtk.ts` (37 líneas):
- `resolveCaveman()`: probe PATH con `spawnSync('caveman', ['--version'])`
- `canUseCaveman(command)`: safety gate — solo comandos simples sin metacaracteres shell
- `wrapWithCaveman(command, available)`: prepend `caveman compress --stdin` si eligible

```typescript
/** Caveman context compression — optional user-installed accelerator.
 *  Detection is best effort; if the binary is missing the feature is
 *  silently unavailable. */

import { spawnSync } from 'node:child_process'

/** Check whether the caveman binary is available on PATH. */
export function resolveCaveman(): boolean {
  try {
    const result = spawnSync('caveman', ['--version'], {
      timeout: 2_000,
      stdio: 'ignore',
      windowsHide: true,
    })
    return result.status === 0
  } catch {
    return false
  }
}

/** Commands whose output is safe for Caveman to compress. */
const CAVEMAN_COMMANDS = new Set([
  'cat', 'head', 'tail', 'grep', 'rg', 'find', 'ls', 'dir',
  'git', 'pnpm', 'npm', 'yarn', 'node', 'python', 'pip',
])

/** Whether a command is eligible for Caveman compression. */
function canUseCaveman(command: string): boolean {
  const executable = command.trim().split(/\s+/)[0]?.split('/').pop()?.split('\\').pop()
  return executable !== undefined && CAVEMAN_COMMANDS.has(executable)
}

/** Add the Caveman prefix only when the caller enabled it and the command is eligible. */
export function wrapWithCaveman(command: string, available: boolean): string {
  return available && canUseCaveman(command) ? `caveman compress --stdin "${command}"` : command
}
```

#### 2.2 Config en bash-local y pwsh-local
**Archivos (mismos patrones, ambos ejecutores):**
- `vendor/deepseek-harness/packages/shell/bash-local/src/index.ts`
  - Config interface (línea ~54): agregar `caveman?: boolean`
  - Schema (línea ~114): `caveman: z.boolean().default(false)` — default OFF
  - Constructor (línea ~134): `this.cavemanInstalled = resolveCaveman()`
  - `resolve()` (línea ~163): envolver con Caveman después de RTK
- `vendor/deepseek-harness/packages/shell/pwsh-local/src/index.ts`
  - Config interface (línea ~71): agregar `caveman?: boolean`
  - Schema (línea ~141): `caveman: z.boolean().default(false)`
  - Constructor (línea ~174): `this.cavemanInstalled = resolveCaveman()`
  - `resolve()` (línea ~206): mismo patrón

```typescript
// En Config interface:
/** Use an installed Caveman binary to compress context output. */
caveman?: boolean

// En static Config:
caveman: z.boolean().default(false),  // Default OFF — opt-in

// En constructor:
this.cavemanInstalled = resolveCaveman()

// En resolve() — Caveman wrapping va DESPUÉS de RTK:
command: wrapWithCaveman(
  wrapWithRtk(request.command, this.config.rtk === true && this.rtkInstalled),
  this.config.caveman === true && this.cavemanInstalled
),
```

#### 2.3 UI Settings — BashCardController
**Archivo:** `vendor/deepseek-harness/packages/client/ui-settings-plugins/src/client/bash-card-controller.ts`

```typescript
export interface BashSettings {
  timeoutMs?: number
  maxOutputBytes?: number
  rtk?: boolean
  caveman?: boolean  // ← Nuevo (línea ~20)
}

export interface BashCardState extends CardShell {
  timeoutMs: CardFieldState
  maxOutputBytes: CardFieldState
  rtk: CardFieldState
  caveman: CardFieldState  // ← Nuevo (línea ~30)
}

// En constructor (línea ~48):
this.form = new CardForm(scope, [
  numberField('timeoutMs'),
  numberField('maxOutputBytes'),
  booleanField('rtk'),
  booleanField('caveman'),  // ← Nuevo
])

// En projection() (línea ~57):
caveman: this.form.field('caveman'),
```

#### 2.4 BashCard.tsx — ToggleField
**Archivo:** `vendor/deepseek-harness/packages/client/ui-settings-plugins/src/client/BashCard.tsx`

Agregar ToggleField después del de RTK (líneas ~59-71):
```tsx
<ToggleField
  id="plugin-config-bash-caveman"
  label={t('bashCaveman')}
  hint={t('bashCavemanHint')}
  overriddenLabel={t('overridden')}
  resetLabel={t('reset')}
  invalidLabel={t('invalidNumber')}
  disabled={disabled}
  checked={state.caveman.text === 'true'}
  {...state.caveman}
  onEdit={(text) => { props.edit('caveman', text) }}
  onReset={() => { props.resetField('caveman') }}
/>
```

#### 2.5 Locales
**Archivo:** `vendor/deepseek-harness/packages/client/ui-settings-plugins/src/client/locales.ts`

Agregar a `PluginsSettingsLocaleKey` (línea ~8):
```typescript
| 'bashCaveman' | 'bashCavemanHint'
```

Agregar a cada locale:
```typescript
// EN (línea ~41):
bashCaveman: 'Use Caveman context compression',
bashCavemanHint: 'Compresses command output context for token savings. Requires Caveman installed separately.',

// ZH (línea ~84):
bashCaveman: '使用 Caveman 上下文压缩',
bashCavemanHint: '压缩命令输出上下文以节省 token。需要单独安装 Caveman。',

// ES (línea ~127):
bashCaveman: 'Usar compresión de contexto Caveman',
bashCavemanHint: 'Comprime la salida de comandos para ahorrar tokens. Requiere Caveman instalado por separado.',
```

#### 2.6 Export del wrapper
**Archivo:** `vendor/deepseek-harness/packages/shell/shell/src/index.ts` (línea ~39)

Agregar export:
```typescript
export { canUseCaveman, resolveCaveman, wrapWithCaveman } from './caveman.ts'
```

#### 2.7 Tests
**Archivo nuevo:** `vendor/deepseek-harness/packages/shell/bash-local/tests/caveman.spec.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { wrapWithCaveman, resolveCaveman } from '../../shell/src/caveman.ts'

describe('optional Caveman command wrapper', () => {
  it('wraps supported plain commands only when Caveman is available', () => {
    expect(wrapWithCaveman('git status', true)).toBe('caveman compress --stdin "git status"')
    expect(wrapWithCaveman('ls -la', true)).toBe('caveman compress --stdin "ls -la"')
  })

  it('does not wrap compound shell commands', () => {
    expect(wrapWithCaveman('echo hello', true)).toBe('echo hello')
    expect(wrapWithCaveman('pwd', true)).toBe('pwd')
    expect(wrapWithCaveman('cat file | grep foo', true)).toBe('cat file | grep foo')
  })

  it('does not wrap when Caveman is not available', () => {
    expect(wrapWithCaveman('git status', false)).toBe('git status')
  })
})
```

**Archivos existentes a modificar:**
- `vendor/deepseek-harness/packages/shell/bash-local/tests/settings.spec.ts` (línea ~49, ~57-63)
  - Agregar test: `config.caveman` defaults to `false`
  - Agregar test: toggle caveman on/off via settings update
- `vendor/deepseek-harness/packages/shell/pwsh-local/tests/settings.spec.ts` (mismo patrón)
- `vendor/deepseek-harness/packages/client/ui-settings-plugins/tests/stores.client.spec.ts` (línea ~167)
  - Agregar test para `caveman` field edit flow
- `vendor/deepseek-harness/packages/client/ui-settings-plugins/tests/section.client.spec.tsx` (línea ~86, ~207)
  - Agregar fixture `caveman: field('false')` y test de render/toggle

---

## Fase 3: Sync con Upstream DSH

### Contexto
El vendor actual está en `v0.1.1-rc.2` (commit `b150a551`). Necesitamos sincronizar con upstream.

### Proceso
1. **Verificar upstream:** `git ls-remote https://github.com/deepseek-ai/deepseek-harness.git main`
2. **Sync vendor:** Seguir el procedimiento en `vendor/README.md` (no existe, pero el patrón es):
   - Clonar/actualizar upstream en temporal
   - Copiar cambios al vendor
   - Re-aplicar modificaciones locales (RTK,.reasoning_effort normalization, Windows fixes)
   - Actualizar manifest con nuevo SHA
3. **Verificar:**
   - `pnpm install` OK
   - `pnpm typecheck` OK
   - Tests del upstream: `pnpm run test` dentro del vendor
   - Tests del shell: `pnpm --filter @freecode/shell test`

### Archivos afectados
- `vendor/deepseek-harness/` (todo el directorio)
- `vendor/deepseek-harness/package.json` (version bump)
- Posibles cambios en `packages/shell/`, `packages/client/`, `packages/core/`

### Riesgo
- Upstream puede haber cambiado interfaces que rompan la integración
- Las modificaciones locales (reasoning_effort, Windows fixes) pueden necesitar re-aplicación
- **Mitigación:** Hacer backup del vendor actual antes del sync, y comparar diffs cuidadosamente

---

## Fase 4: Documentación

### 4.1 Locale español ya funcional (no requiere fix)
El locale español ya está operativo en el selector de idioma. Se verifica que esté correctamente documentado:

**Archivo:** `state.md` → línea ~56
```markdown
### Known issue actual — locale español

- El locale español ya está funcional en el selector de idioma. Se elimina del known issues.
```

**Archivo:** `docs/ROADMAP.md` → sección "Después"
- Eliminar el item de locale español del backlog (ya resuelto)

**Archivo:** `README.es.md` → verificar que mencione soporte español completo

### 4.2 Actualizar ROADMAP.md
**Archivo:** `docs/ROADMAP.md`

- Mover v0.3.3 (Update UX) a "Completado" dentro de v0.4.0
- Mover v0.3.0 (Caveman spike) a "Completado" — ahora está integrado como toggle
- Actualizar v0.4.0 como "Completado"
- Agregar nueva sección "Después" con items pendientes:
  - Revaluar perfiles Free Pool con datos reales
  - Sincronización selectiva con upstream
  - Soporte multiplataforma con contratos equivalentes
  - Prueba manual en Linux con Tor nativo

### 4.3 CHANGELOG.md
**Archivo:** `CHANGELOG.md`

Agregar sección v0.4.0 al inicio:
```markdown
## 0.4.0 — 2026-08-29

### Added / Agregado

- Integrated Caveman context compression as an optional toggle alongside RTK in
  Shell settings. Disabled by default; enables compression of eligible command
  output when the Caveman binary is installed separately. / Se integró la
  compresión de contexto Caveman como toggle opcional junto a RTK en la
  configuración del Shell. Deshabilitado por defecto; activa la compresión de
  salida de comandos compatibles cuando el binario de Caveman está instalado
  por separado.

### Fixed / Corregido

- Fixed application updater: the installer now launches correctly after download,
  the install-version marker updates after restart, and a tray notification
  appears during the update process. / Corregido el actualizador de la aplicación:
  el instalador ahora se ejecuta correctamente después de la descarga, el
  marcador install-version se actualiza después del reinicio, y aparece una
  notificación en la bandeja durante el proceso de actualización.

- Aligned the update indicator button with the Send button visual system,
  replacing the standalone circular control. / Se alineó el botón de indicador
  de actualización con el sistema visual del botón Enviar, reemplazando el
  control circular independiente.

### Changed / Cambiado

- Spanish locale support verified and documented. / Se verificó y documentó el
  soporte del locale español.

- Updated vendored DeepSeek Harness runtime to latest upstream. / Se actualizó
  el runtime vendado de DeepSeek Harness al último upstream.
```

### 4.4 Release Notes
**Archivo:** `docs/RELEASE-NOTES-v0.4.0.md`

Crear release notes bilingüe siguiendo el template existente.

---

## Fase 5: Gemini-Web2API — Documento de Mejoras

### Contexto
Gemini-Web2API es el bridge local que convierte la interfaz web de Google Gemini en una API compatible con OpenAI. FreeCode lo gestiona como provider opcional. El usuario pide un documento MD que explique las mejoras posibles.

### Archivo a crear
**Archivo nuevo:** `docs/GEMINI-WEB2API-IMPROVEMENTS.md`

Este documento cubrirá:

#### 5.1 Estado actual
- **Supervisor:** `apps/shell/src/main/gemini-web2api-supervisor.ts` (294 líneas)
- **Config:** `apps/shell/src/main/local-provider-config.ts` — provider `gemini-web`, puerto 8081
- **Vendor:** `vendor/gemini-web2api/` — Python bridge (server.py, gemini.py, tools.py, multimodal.py)
- **Integración:** Auto-start si Python 3 disponible, health check, restart on crash

#### 5.2 Mejoras identificadas

**A. Streaming real (SSE)**
- Actual: `server.py` usa `http.server` con `ThreadingMixIn` — streaming limitado
- Mejora: Migrar a `aiohttp` o `uvicorn` para streaming SSE real con httpx
- Impacto: Mejor latencia percebida, menos timeouts en respuestas largas

**B. Rate limiting y retry**
- Actual: Sin rate limiting — puede saturar el endpoint de Gemini
- Mejora: Agregar rate limiter configurable, retry con backoff exponencial
- Impacto: Menos 429 errors, mejor estabilidad

**C. Cache de respuestas**
- Actual: Sin cache — cada request va directo a Gemini
- Mejora: Cache LRU para requests idénticos (mismo modelo + mensajes)
- Impacto: Ahorro de cuota, respuestas más rápidas para preguntas repetidas

**D. Modelos fallback automático**
- Actual: `GEMINI_WEB_FALLBACK_MODELS` hardcodeado en `local-provider-config.ts`
- Mejora: Auto-descubrir modelos disponibles desde `/v1/models`, fallback automático si modelo no responde
- Impacto: Menos configuración manual, mayor resiliencia

**E. Gestión de errores mejorada**
- Actual: Errores Python se loggean pero no se propagan claramente al usuario
- Mejora: Clasificar errores (rate limit, auth, network, model not found) y mostrar mensajes accionables
- Impacto: Mejor experiencia de usuario, debugging más rápido

**F. Health check y monitoreo**
- Actual: Health check básico (`GET /` → `{ status: 'ok' }`)
- Mejora: Endpoint `/health` con métricas (uptime, requests, errors, model status)
- Impacto: Mejor observabilidad, diagnóstico más rápido

**G. Configuración via UI**
- Actual: Config manual en `config.json` del usuario
- Mejora: Exponer configuración clave en la UI de Settings (puerto, modelos, rate limit)
- Impacto: UX mejorada, menos archivos JSON para editar

**H. Seguridad**
- Actual: API keys opcionales, CORS `*`
- Mejora: CORS configurable, validación de input más estricta, rate limit por IP
- Impacto: Seguridad mejorada para entornos compartidos

#### 5.3 Priorización

| Mejora | Prioridad | Esfuerzo | Impacto |
|--------|-----------|----------|---------|
| Streaming real (SSE) | Alta | Medio | Alto |
| Rate limiting | Alta | Bajo | Alto |
| Modelos fallback auto | Media | Bajo | Medio |
| Gestión de errores | Media | Bajo | Medio |
| Cache de respuestas | Baja | Medio | Medio |
| Health check mejorado | Baja | Bajo | Bajo |
| Config via UI | Baja | Alto | Medio |
| Seguridad CORS | Baja | Bajo | Bajo |

#### 5.4 Próximos pasos
1. Crear el documento `docs/GEMINI-WEB2API-IMPROVEMENTS.md`
2. Priorizar A (streaming) y B (rate limiting) para v0.4.1
3. Implementar en fases separadas del core de FreeCode

---

## Fase 6: Build y Verificación

### 5.1 Pre-flight checks
```bash
# 1. Instalación limpia
pnpm install

# 2. Typecheck
pnpm typecheck
pnpm --filter @freecode/shell typecheck

# 3. Tests del shell
pnpm --filter @freecode/shell test

# 4. Tests de contratos
pnpm test:contract

# 5. Tests del adapter
pnpm --filter @freecode/opencode-adapter test

# 6. Verificación de vendor
pnpm run prepackage:verify

# 7. git diff --check
git diff --check
```

### 5.2 Build
```bash
# 1. Build del shell
pnpm --filter @freecode/shell build

# 2. Build del runtime vendorizado
pnpm --filter @freecode/shell package:runtime

# 3. Build completo del desktop
pnpm build:desktop
```

### 5.3 Smoke tests
```bash
# 1. NSIS smoke
pnpm --filter @freecode/shell smoke:nsis

# 2. NSIS upgrade smoke
pnpm --filter @freecode/shell smoke:nsis:upgrade

# 3. Runtime closure
node --test scripts/runtime-closure.test.mjs

# 4. Release gate
pnpm release:gate
```

### 5.4 Package
```bash
# Build completo con electron-builder
pnpm --filter @freecode/shell package
```

---

## Fase 7: Commit, Push y Release

### 6.1 Git
```bash
# 1. Stage todo
git add -A

# 2. Commit con mensaje descriptivo
git commit -m "feat: v0.4.0 — Caveman integration, updater fix, upstream sync

- Integrated Caveman context compression as optional toggle alongside RTK
- Fixed application updater: installer launches correctly, tray notifications
- Aligned update indicator button with Send button visual system
- Updated vendored DeepSeek Harness to latest upstream
- Fixed Spanish locale drift in documentation
- All tests passing, release gate passed"

# 3. Push a main
git push origin main
```

### 6.2 Release
```bash
# 1. Crear tag
git tag -a v0.4.0 -m "v0.4.0 — Caveman integration, updater fix, upstream sync"

# 2. Push tag
git push origin v0.4.0

# 3. Crear release en GitHub (manual, sin workflow)
gh release create v0.4.0 \
  --title "v0.4.0 — Caveman + Updater Fix" \
  --notes-file docs/RELEASE-NOTES-v0.4.0.md \
  apps/shell/release/FreeCode-DeepSeek-Harness-0.4.0-win-x64-setup.exe \
  apps/shell/release/FreeCode-DeepSeek-Harness-0.4.0-win-x64-portable.exe \
  apps/shell/release/*.blockmap \
  apps/shell/release/latest.yml
```

### 6.3 Website
```bash
# Actualizar website si es necesario
cd website && pnpm build
```

---

## Cronograma estimado

| Fase | Tiempo estimado | Dependencias |
|------|----------------|--------------|
| Fase 1: Updater fix | 2-3 horas | Ninguna |
| Fase 2: Caveman integration | 1-2 horas | Ninguna |
| Fase 3: Upstream sync | 1-2 horas | Fase 2 (para evitar conflictos) |
| Fase 4: Documentación | 30 min | Fases 1-3 |
| Fase 5: Gemini-Web2API doc | 30 min | Ninguna |
| Fase 6: Build y verificación | 1-2 horas | Fases 1-5 |
| Fase 7: Commit y release | 30 min | Fase 6 |
| **Total** | **6-10 horas** | |

---

## Archivos modificados (resumen)

### Nuevos
- `vendor/deepseek-harness/packages/shell/shell/src/caveman.ts`
- `vendor/deepseek-harness/packages/shell/bash-local/tests/caveman.spec.ts`
- `docs/RELEASE-NOTES-v0.4.0.md`
- `docs/GEMINI-WEB2API-IMPROVEMENTS.md`

### Modificados
- `apps/shell/src/main/index.ts` (updater fix, notification, button alignment)
- `apps/shell/src/main/updater.ts` (quitAndInstall fix)
- `apps/shell/src/main/i18n.ts` (new keys)
- `apps/shell/tests/updater.test.ts` (new tests)
- `vendor/deepseek-harness/packages/shell/shell/src/index.ts` (caveman export)
- `vendor/deepseek-harness/packages/shell/bash-local/src/index.ts` (caveman config)
- `vendor/deepseek-harness/packages/shell/pwsh-local/src/index.ts` (caveman config)
- `vendor/deepseek-harness/packages/shell/bash-local/tests/settings.spec.ts` (caveman test)
- `vendor/deepseek-harness/packages/shell/pwsh-local/tests/settings.spec.ts` (caveman test)
- `vendor/deepseek-harness/packages/client/ui-settings-plugins/src/client/bash-card-controller.ts` (caveman field)
- `vendor/deepseek-harness/packages/client/ui-settings-plugins/src/client/locales.ts` (caveman locales)
- `vendor/deepseek-harness/packages/client/ui-settings-plugins/tests/stores.client.spec.ts` (caveman test)
- `vendor/deepseek-harness/package.json` (version bump after sync)
- `apps/shell/package.json` (version bump to 0.4.0)
- `CHANGELOG.md` (v0.4.0 entry)
- `docs/ROADMAP.md` (update status)
- `state.md` (verificar/update status — locale ya funcional)
- `README.es.md` (verify Spanish support)

---

## Criterios de aceptación

- [ ] El botón de actualización se percibe como parte del mismo sistema visual que "Enviar"
- [ ] Al iniciar actualización aparece notificación en la tray
- [ ] La actualización completa termina con la nueva versión instalada y la app reiniciada
- [ ] `install-version.txt` refleja la nueva versión después del reinicio
- [ ] El toggle de Caveman aparece en Settings junto a RTK
- [ ] Caveman está deshabilitado por defecto
- [ ] RTK y Caveman pueden activarse independientemente
- [x] El locale español funciona en el selector de idioma (ya está funcional)
- [ ] Todos los tests pasan (shell, contracts, adapter, vendor)
- [ ] `pnpm release:gate` pasa
- [ ] Build completo genera setup, portable y blockmap
- [ ] Release publicada en GitHub con release notes
