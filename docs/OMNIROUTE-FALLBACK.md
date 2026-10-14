# Optional free-only fallback / Respaldo opcional gratuito

## English
The 0.9.4 candidate prepares the pinned OmniRoute 3.8.51 runtime in the
background on first launch. The installer carries only its SHA-256/size/URL
descriptor, not the dependency tree. Preparation never blocks DSH or the UI.
A valid verified cache works offline; interruption, a bad checksum or an unsafe
archive cannot replace a working installation. Missing unpublished release
assets are reported as optional preparation unavailable, not a DSH failure.

Implementation status: download/cache lifecycle is implemented. Managed server,
automatic verified failover and release artifacts remain pending validation.

## Español
El candidato 0.9.4 prepara OmniRoute 3.8.51 en segundo plano al primer inicio.
El instalador lleva solo el descriptor SHA-256/tamaño/URL, no las dependencias.
La preparación nunca bloquea DSH ni la interfaz. La caché verificada funciona
sin conexión; una interrupción, checksum incorrecto o archivo inseguro no
reemplaza una instalación válida. Si faltan assets aún no publicados, se
informa que el respaldo opcional no está disponible; DSH sigue funcionando.

Estado: descarga y caché implementadas. Servidor administrado, failover
automático verificado y artefactos de release pendientes de validación.
