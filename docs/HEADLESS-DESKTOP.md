# Windows desktop containment / Contención de ventanas en Windows

## Español

Los procesos de fondo de FreeCode se ejecutan mediante `headless-host.exe`, un ejecutable nativo con subsistema GUI. El helper crea un escritorio no interactivo, crea el destino suspendido, lo asigna a un Job Object propio y recién entonces lo reanuda. El escritorio normal de Electron no cambia. Las ventanas que los descendientes crean mediante la herencia normal de Windows permanecen fuera del escritorio visible, incluso si olvidan `windowsHide` o solicitan una consola nueva. El escritorio privado lleva una etiqueta de integridad obligatoria Low y una DACL que concede solo a la sesión de logon del llamador los derechos de escritorio que USER32 necesita para inicializarse (leer objetos, crear ventanas y menús, enumerar, escribir objetos). No concede cambio de escritorio, hooks de entrada, journaling, propiedad ni edición de DACL. El escritorio interactivo no cambia. La etiqueta es lo que permite que los hijos confinados de integridad Low con escritura restringida carguen USER32 en ese escritorio; sin ella, su inicialización de DLL falla.

### Diagnóstico y acciones visibles

El entorno de fondo impone `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never` y `GCM_GUI_PROMPT=0`: Git usa credenciales disponibles o devuelve un error, sin abrir autenticación modal. Esto no cambia la configuración global de Git ni el entorno de las aplicaciones GUI que abre el usuario.

- Dos hooks de eventos observan los escritorios privado e interactivo. Antes de ocultar o registrar una ventana, consultan su pertenencia al Job mediante un handle del proceso. No seleccionan procesos por nombre, títulos o una lista global de PIDs.
- El registro `[headless-window]` contiene PID, nombre del ejecutable, clase y escritorio privado/interactivo. Se limita a 32 entradas por helper; la ocultación continúa. No captura imágenes, títulos, argumentos, variables de entorno ni conversaciones.
- Las acciones humanas de abrir aplicaciones, carpetas, documentos o localizar archivos pasan por un servicio Electron autenticado en loopback. El selector de carpetas mantiene su puente existente. Los ejecutables GUI se validan por su encabezado PE; no se aceptan intérpretes de consola ni scripts como excepción interactiva. El adaptador CLI instalado de GitHub Desktop tiene un permiso específico, sin heredar credenciales del harness.
- Solo ese broker permite la visibilidad normal de la aplicación GUI validada. `windowsHide` también aplica `SW_HIDE` a aplicaciones gráficas en libuv; no se utiliza para esconder un editor que el usuario pidió abrir. Esto no habilita ventanas de procesos de fondo.
- El editor de texto y el navegador de documentos se abren en el escritorio interactivo. Las asociaciones de archivos ejecutables/scripts se rechazan; pueden abrirse como texto. El navegador embebido sigue perteneciendo a Electron, no al árbol de fondo.

### Verificación y actualización

El build del helper usa únicamente la biblioteca estándar de Go, con resolución de módulos y toolchains de red desactivada. La verificación comprueba Windows x64, subsistema GUI, SHA-256 y la huella del código fuente. El smoke nativo ejecuta el helper exacto y fuerza ventanas visibles, solicitud de foco y descendientes con `CREATE_NEW_CONSOLE`; además prueba I/O, argumentos Unicode, entorno, directorio, salida, cierre del Job y que otra ventana ajena al Job no se oculte. La ventana ajena también es una fixture privada: no se inspeccionan ventanas del usuario.

Ejecutar desde la raíz, con Go instalado:

```powershell
rtk node scripts/build-headless-host.mjs
rtk node scripts/verify-headless-desktop.mjs
rtk pnpm --filter @freecode/shell test
```

El gate de empaquetado repite el smoke contra el helper dentro del output real. El inventario impide nuevos `child_process` directos en la shell fuera del launcher y del broker GUI. La shell valida que el runtime descargado incluya los puentes GUI antes de promoverlo o iniciarlo. Este cambio requiere el runtime inmutable `0.2.1-alpha.9`; no se debe sobrescribir alpha8. Una precarga local no reemplaza el smoke público de instalación limpia ni autoriza una publicación.

### Límites

Esta medida previene ventanas accidentales de los árboles de fondo, no constituye un sandbox frente a código malicioso con los mismos permisos. Como el escritorio privado tiene etiqueta Low para los hijos confinados, otros procesos de integridad Low de la misma sesión de logon que conozcan su nombre aleatorio de 128 bits pueden crear ventanas y escribir objetos allí; aun así no pueden cambiar de escritorio ni instalar hooks de entrada. Servicios, elevación/UAC, brokers del sistema y un proceso que cambie explícitamente de escritorio requieren análisis separado. El watchdog interactivo es asíncrono: por sí solo no puede garantizar que no aparezca un primer frame. La prevención principal es elegir el escritorio antes de ejecutar el destino. La automatización nativa del escritorio interactivo debe usar un servicio explícito fuera del árbol de fondo; no debe intentarse ocultando ventanas de otras aplicaciones.

## English

FreeCode background roots run through `headless-host.exe`, a native GUI-subsystem executable. It creates a noninteractive desktop, creates the target suspended, assigns an owned Job Object, then resumes execution. Electron stays on the interactive desktop. Normally inherited descendant windows remain off that desktop even when a dependency omits hidden flags or requests a new console. The private desktop carries a Low mandatory integrity label and a DACL that grants only the caller's logon session the desktop rights USER32 initialisation needs (read objects, create windows and menus, enumerate, write objects). It grants no desktop switching, input hooks, journaling, ownership or DACL edits. The interactive desktop is untouched. The label is what lets Low-integrity, write-restricted confined children load USER32 on that desktop; without it their DLL initialisation fails.

### Diagnostics and intentional GUI actions

Background environments enforce `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never` and `GCM_GUI_PROMPT=0`, without changing global Git configuration or intentional GUI-app environments. Available credentials still work; required interaction returns an error instead of a modal prompt. See the [GCM configuration reference](https://github.com/git-ecosystem/git-credential-manager/blob/main/docs/configuration.md).

Event hooks monitor the private and interactive desktops. Every hide/log action requires kernel Job membership verified through a process handle, never a process-name or window-title match. Bounded `[headless-window]` diagnostics contain PID, executable basename, class and private/interactive desktop; no screenshots, titles, arguments, environment or conversation content are captured. Logging stops after 32 records per helper; enforcement continues.

Explicit application, directory, document and reveal actions use the authenticated loopback Electron GUI broker. The existing folder-picker bridge remains active. The broker verifies GUI PE headers, strips inherited credentials and rejects console/script launchers. The installed GitHub Desktop CLI adapter has a narrow explicit exception. Text editing and browser-renderable documents remain interactive; executable/script associations are refused and can instead be opened as text. Embedded browsing remains owned by Electron.

Only that broker permits normal visibility for its validated GUI executable. `windowsHide` also sets `SW_HIDE` for GUI applications in [libuv's Windows launcher](https://github.com/libuv/libuv/blob/v1.x/src/win/process.c), so applying it there could hide an intentionally opened editor. This is not a background-process escape hatch.

### Verification and limitations

The standard-library-only Go build disables network module/toolchain resolution. Checks bind source digest, SHA-256, Windows x64 and GUI subsystem to the exact binary. Native tests deliberately show windows, request focus, create new-console descendants, verify standard streams/argv/environment/cwd/exit status, close the owned Job tree and leave a different Job's private test window untouched. Packaging repeats these tests against its actual output, not a separate helper build. The source inventory rejects new direct shell spawns outside the launcher and GUI broker.

Downloaded runtimes must include both GUI bridges before promotion/startup. This requires immutable runtime `0.2.1-alpha.9`, not replacement of alpha8. Public clean-cache first-run evidence remains mandatory before release; local preloading is not that evidence.

Containment is not a same-user malicious-code sandbox. UAC, services, OS brokers and deliberate desktop switching remain outside the inherited-desktop guarantee. Because the private desktop is labelled Low for the confined children, other Low-integrity processes of the same logon session that learn its random 128-bit name may create windows and write objects there; they still cannot switch desktops or install input hooks. Interactive WinEvent delivery is asynchronous and cannot alone eliminate a first frame; pre-execution desktop selection supplies primary prevention. Interactive native desktop automation needs an explicit service outside the background tree. No user's active FreeCode instance needs inspection, restart or termination to run the isolated tests.
