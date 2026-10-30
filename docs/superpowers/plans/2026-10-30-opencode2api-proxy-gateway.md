# Reintegración de OpenCode2API v1.4.5 como Capa Proxy Local con Multi-WARP (v2.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar de forma embebida `opencode2api.exe` v1.4.5 (con WireGuard/gVisor user-space WARP pool de 4 salidas) y el proxy sanitizador Node.js en FreeCode DeepSeek Harness, exponiendo un endpoint OpenAI loopback seguro que resuelve el agotamiento de cuota (`RATE_LIMIT: Free usage limit reached`).

**Architecture:** La shell de Electron (`apps/shell`) supervisa dos procesos nativos livianos en puertos dinámicos (`:0`): un worker directo y un worker pool con rotación IPv6 WARP. Frente a ellos, un proxy local en Node.js (`proxy.js`) valida esquemas, inyecta los 4 gates de OpenCode (User-Agent, sesión canónica `ses_...` persistente, herramienta obligatoria `read`, streaming forzado) y realiza failover automático al pool WARP cuando el endpoint directo recibe `RATE_LIMIT` / HTTP 429. DeepSeek Harness consume el proxy como provider nativo estándar (`api: 'openai-completions'`) preconfigurado en `settings.yaml`.

**Tech Stack:** TypeScript, Node.js (CommonJS/ESM), Go binary (`opencode2api.exe` v1.4.5), Electron 34 (`ELECTRON_RUN_AS_NODE: '1'`), Cloudflare WARP user-space (gVisor/netstack WireGuard), Vitest.

**Spec:** Directiva de usuario: "volver al plan de usar opencode2api como capa proxy". Restricción absoluta de no modificar `C:\LocalAI`. Versión de destino local: `1.0.3`.

---

## Global Constraints

- **Prohibición absoluta de tocar o modificar `C:\LocalAI`**: solo lectura o copia de binarios y scripts hacia `I:\DeepSeek-Harness\free-code-deepseek-harness`.
- **Aislamiento de Red Estricto**: Todos los servicios del gateway (`proxy.js`, `direct`, `pool`) deben escuchar **exclusivamente en `127.0.0.1`**. El uso de `0.0.0.0` está prohibido para evitar exposición a la LAN y robo de cuota.
- **Puertos de loopback 100% dinámicos (`:0`)**: el proxy, el backend WARP y el backend directo deben solicitar puertos efímeros al sistema operativo para evitar colisiones.
- **Cero dependencias del sistema del usuario**: no requerir Docker, no instalar adaptadores TUN/WinTun globales, no requerir Python, **y no depender del Node.js instalado en el sistema operativo**. Se ejecuta estrictamente el runtime embebido de Electron con `ELECTRON_RUN_AS_NODE: '1'`.
- **Gestión de Logs Obligatoria**: `stdout` y `stderr` de los procesos hijos de `opencode2api` y `proxy.js` deben redirigirse a archivos en `userDataDir/logs/oc-gateway/` para diagnóstico forense.
- **Empaquetado verificado en NSIS y Portable**: los ejecutables y scripts deben ubicarse en `resources/freecode/**` para que `electron-builder` los incluya sin exclusiones.
- **Versionado**: mantener versión `1.0.3` hasta que el usuario dé el visto bueno final para taggear en git.

---

## Review Focus

1. **Agotamiento de cuota (HTTP 429 / RATE_LIMIT)**: `proxy.js` debe detectar el fallo en el intento directo y conmutar al worker WARP. Si **ambos** fallan, debe devolver un HTTP 503 claro al cliente en lugar de colgarse.
2. **Persistencia de Sesión Canónica**: La huella `ses_...` debe generarse una vez y persistirse en `userDataDir/oc-gateway/session.json` para evitar que OpenCode detecte un "nuevo dispositivo" en cada reinicio.
3. **Puertos efímeros y colisiones**: generación dinámica de `pool-config.json` y `direct-config.json` en cada arranque con los puertos asignados por `net.createServer()`.
4. **Persistencia y migración de sesiones**: perfiles con sesiones previas (`dsh-our-free-model`) deben migrarse a `freecode-opencode/deepseek-v4.1-flash-free` sin bloquear la UI.
5. **Cierre limpio y anti-zombies**: `launchHidden` y `tree-kill` deben asegurar el cierre. Adicionalmente, persistir PIDs en `.pid` para limpiar procesos huérfanos de ejecuciones anteriores al arrancar Electron.
6. **Compatibilidad de herramientas**: inyección transparente del fingerprint canónico y herramienta señuelo `read`, des-sanitizando `pwsh` en las respuestas.

---

## Task 1: Staging de Binario opencode2api v1.4.5, Scripts y Catálogos

**Files:**
- Create: `apps/shell/resources/freecode/opencode2api/opencode2api-win-x64.exe` (copia desde `C:\LocalAI\opencode-gateway\bin\opencode2api.exe`)
- Create: `apps/shell/resources/freecode/opencode2api/freecode-build-receipt.json`
- Create: `apps/shell/resources/freecode/oc-gateway/scripts/*.js` (copia desde `C:\LocalAI\opencode-gateway\scripts/`)
- Create: `apps/shell/resources/freecode/oc-gateway/config/models.json` (copia desde `C:\LocalAI\opencode-gateway\config/models.json`)
- Create: `apps/shell/resources/freecode/oc-gateway/config/models.catalog.json` (copia desde `C:\LocalAI\opencode-gateway\config/config.json.models.catalog.json`)
- Test: `apps/shell/tests/oc-payload-staging.test.ts`

**Interfaces:**
- Consumes: Binarios y scripts validados de `C:\LocalAI\opencode-gateway` (solo lectura).
- Produces: Payload empaquetable en `apps/shell/resources/freecode/`.

- [ ] **Step 1: Escribir el test para validar presencia y hashes del payload**
- [ ] **Step 2: Ejecutar test y verificar que falla**
- [ ] **Step 3: Copiar archivos desde `C:\LocalAI` y generar receipt de hash**
- [ ] **Step 4: Ejecutar test y verificar que pasa**
- [ ] **Step 5: Commit del payload staged**

---

## Task 2: Implementación del Supervisor `oc-gateway.ts` con Anti-Zombies y Logs

**Files:**
- Create: `apps/shell/src/main/oc-gateway.ts`
- Test: `apps/shell/tests/oc-gateway.test.ts`

**Interfaces:**
- Consumes: `resourcesDir`, `userDataDir`, puertos dinámicos.
- Produces: `OcGatewayInstance` (`{ url, port, apiKey, modelIds, stop, restart }`).

- [ ] **Step 1: Escribir tests unitarios para `oc-gateway.ts`**
- [ ] **Step 2: Ejecutar test y verificar que falla**
- [ ] **Step 3: Implementar `oc-gateway.ts`** (Anti-Zombies con `pids.json`, sesión persistente `session.json`, `127.0.0.1` estricto, redirección de logs)
- [ ] **Step 4: Ejecutar test y verificar que pasa**
- [ ] **Step 5: Commit del supervisor**

---

## Task 3: Integración en Shell Runtime y Provider-Seeder

**Files:**
- Modify: `apps/shell/src/main/runtime.ts`
- Modify: `apps/shell/src/main/index.ts`
- Modify: `apps/shell/src/main/provider-seeder.ts`
- Test: `apps/shell/tests/provider-seeder.test.ts`, `apps/shell/tests/runtime.test.ts`

- [ ] **Step 1: Escribir tests para el provider-seeder de OpenCode**
- [ ] **Step 2: Ejecutar test y verificar que falla**
- [ ] **Step 3: Implementar la configuración de proveedor y arranque en `index.ts`**
- [ ] **Step 4: Ejecutar tests y verificar que pasan**
- [ ] **Step 5: Commit de la integración de runtime**

---

## Task 4: Saneamiento de Sesiones Huérfanas y Limpieza de dsh-our-free-model

**Files:**
- Modify: `apps/shell/src/main/plugin-deployer.ts`
- Modify: `apps/shell/src/main/index.ts`
- Test: `apps/shell/tests/plugin-deployer.test.ts`

- [ ] **Step 1: Actualizar tests de sanitización en `plugin-deployer.test.ts`**
- [ ] **Step 2: Ejecutar test y verificar que falla**
- [ ] **Step 3: Implementar la sanitización en `plugin-deployer.ts`**
- [ ] **Step 4: Ejecutar test y verificar que pasa**
- [ ] **Step 5: Commit**

---

## Task 5: Actualización de Políticas de Empaquetado, Tests y Compilación v1.0.3

**Files:**
- Modify: `apps/shell/electron-builder.yml`
- Modify: `apps/shell/tests/package-resource-policy.test.ts`
- Modify: `scripts/verify-runtime-dependencies.mjs`
- Modify: `scripts/package-desktop.mjs`

- [ ] **Step 1: Ajustar `electron-builder.yml` y tests de recursos**
- [ ] **Step 2: Ejecutar suite completa de tests de la shell**
- [ ] **Step 3: Ejecutar `prepackage:verify`**
- [ ] **Step 4: Generar instalador y portable locales de v1.0.3**
- [ ] **Step 5: Commit y actualización de graphify**
