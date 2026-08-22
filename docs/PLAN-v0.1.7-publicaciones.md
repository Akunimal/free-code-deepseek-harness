# PLAN v0.1.7 — publicaciones en grupos de OpenCode

Fecha: 2026-08-22 · Repo: `Akunimal/free-code-deepseek-harness` · Estado: PENDIENTE DE CONFIRMACIÓN DEL USUARIO

## Alcance

La release publicada es [v0.1.7](https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.1.7). Se localizaron en Facebook los resultados cuyo título contiene `OpenCode`/`opencode`. Se publicará sólo donde la cuenta ya es miembro; no se solicitará entrar a grupos nuevos sin una instrucción separada.

## Grupos localizados

| Grupo | Idioma del texto | Estado visible |
|---|---|---|
| `Opencode en Español` | Español | Miembro |
| `Devs: Antigravity, Codex, Claude Code y OpenCode en Español` | Español | Miembro |
| `OPENCODE \| AVANZADO` | Español | Miembro |
| `OpenCode en Español` | Español | Miembro |
| `opencode-crew` | Inglés | Miembro |
| `OpenCode VN - Cộng Đồng AI Coding Agent` | Inglés | Miembro |
| `Opencode-harness-Deepseek` | Inglés | Miembro |

También aparecen resultados públicos en los que la cuenta todavía muestra `Unirte` —por ejemplo `AI Developers & Vibe Coders (Claude Code, Hermes, OpenCode, OpenClaw, more)`, `أخبار OpenCode بالعربي`, `Opencode PH`, `OpenCode`, `OpenCode En Español` y `Claude code / open code (Sin Hate)`—. No se solicitará entrar a esos grupos dentro de esta publicación.

## Texto en español

> 🚀 **FreeCode DeepSeek Harness v0.1.7 — vibecoding casi gratis con OpenCode**
>
> Buenas, les comparto algo que armé originalmente para no quedarme sin poder programar cuando se terminan los créditos: una aplicación de escritorio basada en DeepSeek Harness que integra `opencode2api`, un pool de workers con round-robin y Tor rotativo opcional para repartir la salida entre distintos exits y evitar saturar tan rápido el límite por IP. No crea cuentas ni elimina los límites del proveedor: ayuda a aprovechar mejor la cuota pública disponible.
>
> ¿Estabas usando OpenCode y se te terminó el uso? FreeCode incluye el puente OpenCode ya configurado; elegís la carpeta de trabajo y podés continuar desde el Harness sin descargar ni configurar nada extra. La v0.1.7 ya está estable para uso normal en Windows e incluye descubrimiento dinámico de modelos gratuitos, tool calling headless, instalador NSIS y versión portable.
>
> El pool puede trabajar con modelos gratuitos como `x-preview-f`, `mimo-v2.5`, `hy3`, `nemotron-3-ultra`, `nemotron-3.5-lightning` y `laguna-s-2.1`; el catálogo puede cambiar porque depende del servicio público.
>
> Características: pool de 1 a 16 workers, round-robin automático, interfaz completa del Harness, portable y también instalador Windows. ⚠️ Es una aplicación grande: el portable pesa unos 444 MB comprimido y puede extraer cerca de 1,6 GB al abrirse, por lo que la primera ejecución puede tardar entre 30 y 90 segundos —o más con antivirus lento—. La instalación también puede tardar varios minutos; después las aperturas son mucho más rápidas.
>
> Known issue: por ahora el selector de idioma muestra sólo English y 中文; Español está pendiente de una corrección.
>
> Por ahora sólo pude probar la build de Windows; si alguien la prueba en otro sistema o encuentra algún fallo, se agradecen los avisos.
>
> Es open source y fork de `deepseek-ai/deepseek-harness`. Descarga: https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.1.7

## Text in English

> 🚀 **FreeCode DeepSeek Harness v0.1.7 — almost-free coding with OpenCode**
>
> Hi everyone, I originally built this because I did not want to lose the ability to code after running out of credits. It is a Windows desktop app based on DeepSeek Harness with the OpenCode bridge (`opencode2api`) already configured, a round-robin worker pool, and optional rotating Tor egress to spread traffic across exits and avoid saturating the same IP ceiling too quickly. It does not create accounts or remove provider limits; it only helps use the available public quota more efficiently.
>
> If you were using OpenCode and ran out of usage, you can choose your workspace folder and continue from the Harness without downloading or configuring anything else. v0.1.7 is stable for normal Windows use and includes dynamic free-model discovery, headless tool calling, an NSIS installer, and a portable build.
>
> The pool currently discovers free models such as `x-preview-f`, `mimo-v2.5`, `hy3`, `nemotron-3-ultra`, `nemotron-3.5-lightning`, and `laguna-s-2.1`; the public catalog can change over time.
>
> Features include 1–16 workers, automatic round-robin routing, the full Harness interface, a portable build, and a Windows installer. ⚠️ It is a large application: the portable build is about 444 MB compressed and may extract close to 1.6 GB before opening, so the first launch can take 30–90 seconds —or longer with slow antivirus scanning—. The installer can also take several minutes; later launches are much faster.
>
> Known issue: the current language selector exposes English and Chinese only; Spanish is still pending a fix.
>
> I have only tested the Windows build so far. Feedback from other systems or any issue is very welcome.
>
> It is open source and forked from `deepseek-ai/deepseek-harness`. Download: https://github.com/Akunimal/free-code-deepseek-harness/releases/tag/v0.1.7

## Known issue to mention only if relevant

The current desktop language selector shows only English and Chinese. Spanish dictionaries are bundled upstream, but Spanish is not currently exposed in Settings; this regression is documented in the repository and release notes.

## Publication gate

- [x] Search completed in the embedded Facebook browser.
- [x] Drafts prepared in both languages.
- [ ] User confirms the two texts immediately before posting.
- [ ] Publish to the seven groups where the account is already a member.
- [ ] Verify each post contains the intended text and release link.
