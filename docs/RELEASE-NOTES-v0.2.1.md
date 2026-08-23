# FreeCode DeepSeek Harness v0.2.1

## English

### Fixed

- Prevented the misleading `Pool opencode2api unavailable` notification during an expected application shutdown. Genuine pool state transitions still report their status.
- Made [RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) an optional, live settings toggle for both Bash and PowerShell shell presets. When the `rtk` executable is absent, the setting safely becomes a no-op; FreeCode does not install or download it.

### Build and operations

- Added regression coverage for shutdown notification suppression, RTK settings, and the Windows PowerShell path.
- This release was built and uploaded manually; GitHub Actions is not used, preserving the repository's free workflow quota.

Verification: shell backend-state tests; RTK/UI focused tests; shell and vendor typechecks; release contract checks; desktop package build.

Source: changes after `v0.2.0` reviewed from the release diff on 2026-08-23.

## Español

### Corregido

- Se eliminó el aviso engañoso `Pool opencode2api no disponible` durante el cierre esperado de la aplicación. Las transiciones reales del pool siguen informando su estado.
- [RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) ahora es un toggle opcional y efectivo en tiempo real para los presets de shell Bash y PowerShell. Si el ejecutable `rtk` no está instalado, la opción queda sin efecto sin romper la ejecución; FreeCode no lo instala ni lo descarga.

### Build y operaciones

- Se agregó cobertura de regresión para el apagado, la configuración de RTK y la ruta de PowerShell en Windows.
- Esta release se compiló y subió manualmente; GitHub Actions no se usa, para conservar la cuota gratuita de workflows del repositorio.

Verificación: tests del estado del backend del shell; tests focalizados de RTK/UI; typechecks del shell y del vendor; contratos de release; build del paquete de escritorio.

Fuente: cambios posteriores a `v0.2.0`, revisados en el diff de release el 2026-08-23.
