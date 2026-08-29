# Gemini-Web2API — Mejoras de Streaming y Tool Calling

**Fecha:** 2026-08-29
**Problema central:** El stream se corta y tool calling no funciona con streaming habilitado.
**Archivo fuente:** `vendor/gemini-web2api/gemini_web2api/`

---

## Diagnóstico actual

### Problema 1: Streaming se corta

**Archivo:** `gemini_web2api/gemini.py` → `generate_stream()` (línea 235-279)

El streaming usa httpx `iter_text()` contra el protocolo web de Gemini (wrb.fr lines):

```python
# Línea 252-273 — el buffer parsing es frágil
with client.stream("POST", url, content=body, headers=headers) as resp:
    buf = ""
    for chunk in resp.iter_text():
        buf += chunk
        # ... parsing de líneas wrb.fr ...
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            for t in _extract_texts_from_line(line):
                # ... yield delta ...
```

**Causas del corte:**
1. **Buffer incompleto:** Si un chunk llega a mitad de una línea wrb.fr, `buf.split("\n")` deja la línea incompleta en `buf`. El siguiente chunk puede no llegar a tiempo.
2. **Timeout de httpx:** `CONFIG["request_timeout_sec"]` aplica por chunk, no por response completa. Chunks lentos causan timeout.
3. **Conexión cerrada:** El servidor de Gemini cierra la conexión después de un período sin datos. No hay reconexión automática.
4. **Error de parsing:** `_extract_texts_from_line()` retorna `[]` si la línea no tiene el formato esperado. Líneas parciales se descartan silenciosamente.

### Problema 2: Tool calling no funciona con streaming

**Archivo:** `gemini_web2api/server.py` → `_handle_chat()` (línea 202)

```python
# Línea 202 — streaming SOLO cuando NO hay tools
if stream and (not tools or tool_choice == "none"):
    # ... streaming real ...
    return

# Línea 234-262 — tools SIEMPRE usa non-streaming
text = generate(prompt, model_id, think_mode, file_refs, extra_fields)  # ← no streaming
tool_calls = None
if tools and text and tool_choice != "none":
    text, tool_calls = parse_tool_calls(text)
# ... envía resultado como un solo chunk SSE ...
```

**Consecuencia:** Cuando el agente usa tool calling (que es el caso normal de DeepSeek Harness), el streaming se deshabilita completamente. El usuario ve la respuesta completa de golpe, sin chunks progresivos.

### Problema 3: Protocolo Gemini web es frágil

**Archivo:** `gemini_web2api/gemini.py` → `_extract_texts_from_line()` (línea 169-189)

```python
def _extract_texts_from_line(line: str) -> list:
    if '"wrb.fr"' not in line or len(line) < 200:  # ← umbral arbitrario
        return []
    try:
        arr = json.loads(line)
        inner_str = arr[0][2]  # ← acoplado a estructura interna de Gemini
        # ... parsing específico de Google ...
```

El parsing depende de la estructura exacta de la respuesta de Gemini web. Si Google cambia el formato, el streaming se rompe sin error claro.

---

## Soluciones propuestas

### Solución 1: Streaming robusto con keep-alive y buffer persistente

**Archivo a modificar:** `vendor/gemini-web2api/gemini_web2api/gemini.py`

```python
def generate_stream(prompt: str, model_id: int, think_mode: int, 
                    file_refs: list = None, extra_fields: dict = None):
    """Streaming robusto con manejo de errores y buffer persistente."""
    if not HAS_HTTPX:
        text = generate(prompt, model_id, think_mode, file_refs, extra_fields)
        if text:
            yield text
        return

    body = _build_payload(prompt, model_id, think_mode, file_refs, extra_fields)
    url = _get_url()
    headers = _build_headers()
    
    # Configuración de timeout extendida para streaming
    stream_timeout = httpx.Timeout(
        connect=10.0,
        read=300.0,  # 5 minutos por chunk — streaming puede ser lento
        write=10.0,
        pool=10.0
    )
    
    client = _get_httpx_client()
    emitted_raw_text = ""
    buf = ""
    max_retries = CONFIG["retry_attempts"]
    
    for attempt in range(max_retries):
        try:
            with client.stream("POST", url, content=body, headers=headers, 
                             timeout=stream_timeout) as resp:
                resp.raise_for_status()
                
                for chunk in resp.iter_text():
                    buf += chunk
                    
                    # Procesar líneas completas
                    while "\n" in buf:
                        line, buf = buf.split("\n", 1)
                        line = line.strip()
                        if not line:
                            continue
                            
                        # Detectar errores de Gemini
                        if "BardErrorInfo" in line:
                            bard_err = re.search(r'BardErrorInfo\s*\[(\d+)\]', line)
                            if bard_err:
                                raise RuntimeError(
                                    f"Gemini upstream rejected request: "
                                    f"BardErrorInfo [{bard_err.group(1)}]"
                                )
                        
                        # Extraer texto de la línea
                        for t in _extract_texts_from_line(line):
                            if t == emitted_raw_text or emitted_raw_text.startswith(t):
                                continue
                            if not t.startswith(emitted_raw_text):
                                # El contenido cambió — posible error de estado
                                log(f"Stream content changed: expected prefix "
                                    f"'{emitted_raw_text[:50]}...' got '{t[:50]}...'")
                                continue
                            
                            delta = clean_text(t[len(emitted_raw_text):], strip=False)
                            emitted_raw_text = t
                            if delta:
                                yield delta
                
                # Procesar buffer restante al finalizar
                if buf.strip():
                    for t in _extract_texts_from_line(buf):
                        if t and not t.startswith(emitted_raw_text):
                            delta = clean_text(t[len(emitted_raw_text):], strip=False)
                            if delta:
                                yield delta
                
                return  # Éxito — salir del loop de reintentos
                
        except (httpx.ReadTimeout, httpx.ConnectTimeout):
            log(f"Stream timeout on attempt {attempt+1}/{max_retries}")
            if attempt < max_retries - 1:
                time.sleep(CONFIG["retry_delay_sec"])
                # No resetear emitted_raw_text — continuar desde donde quedó
                
        except httpx.RemoteProtocolError as e:
            log(f"Stream protocol error on attempt {attempt+1}/{max_retries}: {e}")
            if attempt < max_retries - 1:
                time.sleep(CONFIG["retry_delay_sec"])
                
        except Exception as e:
            log(f"Stream error on attempt {attempt+1}/{max_retries}: {e}")
            if attempt < max_retries - 1:
                time.sleep(CONFIG["retry_delay_sec"])
    
    # Si todos los reintentos fallan, intentar non-streaming como fallback
    log("All stream retries exhausted, falling back to non-streaming")
    text = generate(prompt, model_id, think_mode, file_refs, extra_fields)
    if text and not emitted_raw_text:
        yield text
    elif text and emitted_raw_text and text.startswith(emitted_raw_text):
        delta = text[len(emitted_raw_text):]
        if delta:
            yield delta
```

### Solución 2: Tool calling con streaming chunked

**Archivo a modificar:** `vendor/gemini-web2api/gemini_web2api/server.py`

El problema actual es que `parse_tool_calls()` necesita el texto completo para extraer los tool calls. Pero podemos hacer streaming del contenido de texto Y enviar los tool calls al final:

```python
def _handle_chat(self, body: bytes):
    req = self._parse_body(body)
    if req is None:
        self.send_json({"error": {"message": "invalid JSON"}}, 400)
        return
    
    model_name, model_id, think_mode, err, extra_fields = resolve_model(
        req.get("model", CONFIG["default_model"]))
    if err:
        self.send_json({"error": {"message": err}}, 400)
        return

    tools = req.get("tools")
    tool_choice = req.get("tool_choice", "auto")
    prompt, images = messages_to_prompt(req.get("messages", []), tools, tool_choice)
    if not prompt.strip():
        self.send_json({"error": {"message": "empty prompt"}}, 400)
        return

    stream = req.get("stream", False)
    cid = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    
    try:
        file_refs = _upload_images(images)
    except RuntimeError as e:
        self.send_json({"error": {"message": f"upstream error: {e}"}}, 502)
        return

    # ─── Streaming con tool calling ──────────────────────────────────
    if stream:
        try:
            self._start_sse()
            
            # Primer chunk: role
            first_chunk = {
                "id": cid,
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": model_name,
                "choices": [{
                    "index": 0,
                    "delta": {"role": "assistant"},
                    "finish_reason": None,
                }],
            }
            self.wfile.write(f"data: {json.dumps(first_chunk)}\n\n".encode())
            self.wfile.flush()
            
            # Acumular texto completo para parsear tool calls al final
            full_text = ""
            
            # Si hay tools, hacer streaming del texto y parsear tool calls al final
            for delta in generate_stream(prompt, model_id, think_mode, file_refs, extra_fields):
                full_text += delta
                
                # Emitir chunk de contenido
                chunk = {
                    "id": cid,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model_name,
                    "choices": [{
                        "index": 0,
                        "delta": {"content": delta},
                        "finish_reason": None,
                    }]
                }
                self.wfile.write(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode())
                self.wfile.flush()
            
            # Parsear tool calls del texto completo acumulado
            tool_calls = None
            if tools and full_text and tool_choice != "none":
                # Limpiar el texto acumulado (quitar tool calls del contenido)
                clean_text, tool_calls = parse_tool_calls(full_text)
                
                # Si había tool calls, enviar chunk de corrección
                if tool_calls:
                    # Enviar chunk con tool_calls (reemplaza el contenido)
                    tool_chunk = {
                        "id": cid,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": model_name,
                        "choices": [{
                            "index": 0,
                            "delta": {
                                "content": None,  # Limpiar contenido anterior
                                "tool_calls": tool_calls,
                            },
                            "finish_reason": "tool_calls",
                        }]
                    }
                    self.wfile.write(f"data: {json.dumps(tool_chunk, ensure_ascii=False)}\n\n".encode())
                    self.wfile.flush()
                else:
                    # Sin tool calls — finish normal
                    end = {
                        "id": cid,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": model_name,
                        "choices": [{
                            "index": 0,
                            "delta": {},
                            "finish_reason": "stop",
                        }]
                    }
                    self.wfile.write(f"data: {json.dumps(end)}\n\n".encode())
                    self.wfile.flush()
            else:
                # Sin tools — finish normal
                end = {
                    "id": cid,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model_name,
                    "choices": [{
                        "index": 0,
                        "delta": {},
                        "finish_reason": "stop",
                    }]
                }
                self.wfile.write(f"data: {json.dumps(end)}\n\n".encode())
                self.wfile.flush()
            
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
            
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            log(f"Stream error: {e}")
        return
    
    # ─── Non-streaming (fallback) ───────────────────────────────────
    try:
        text = generate(prompt, model_id, think_mode, file_refs, extra_fields)
    except Exception as e:
        self.send_json({"error": {"message": f"upstream error: {e}"}}, 502)
        return

    tool_calls = None
    if tools and text and tool_choice != "none":
        text, tool_calls = parse_tool_calls(text)
    
    msg = {"role": "assistant", "content": text or None}
    if tool_calls:
        msg["tool_calls"] = tool_calls
    finish = "tool_calls" if tool_calls else "stop"

    self.send_json({
        "id": cid, "object": "chat.completion", "created": int(time.time()),
        "model": model_name,
        "choices": [{"index": 0, "message": msg, "finish_reason": finish}],
        "usage": {"prompt_tokens": len(prompt)//4, "completion_tokens": len(text or "")//4,
                  "total_tokens": (len(prompt)+len(text or ""))//4},
    })
```

### Solución 3: Configuración de timeouts mejorada

**Archivo a modificar:** `vendor/gemini-web2api/gemini_web2api/config.py`

```python
# Configuración actual
DEFAULT_CONFIG = {
    "request_timeout_sec": 30,  # ← demasiado corto para streaming
    # ...
}

# Configuración mejorada
DEFAULT_CONFIG = {
    "request_timeout_sec": 30,
    "stream_read_timeout_sec": 300,  # 5 min por chunk para streaming
    "stream_keepalive_interval_sec": 30,  # Heartbeat para mantener conexión
    "retry_attempts": 3,
    "retry_delay_sec": 2,
    # ...
}
```

### Solución 4: Heartbeat para mantener conexión viva

**Archivo a modificar:** `vendor/gemini-web2api/gemini_web2api/gemini.py`

Agregar heartbeat cada 30 segundos durante streaming lento:

```python
import threading

class StreamHeartbeat:
    """Envía heartbeat SSE para mantener conexión viva."""
    
    def __init__(self, wfile, interval=30):
        self.wfile = wfile
        self.interval = interval
        self._stop = threading.Event()
        self._thread = None
    
    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
    
    def _run(self):
        while not self._stop.wait(self.interval):
            try:
                # Comentario SSE como heartbeat
                self.wfile.write(b": heartbeat\n\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                break
    
    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

# Uso en _handle_chat:
heartbeat = StreamHeartbeat(self.wfile)
heartbeat.start()
try:
    for delta in generate_stream(...):
        # ... process delta ...
finally:
    heartbeat.stop()
```

---

## Resumen de cambios

| Archivo | Cambio | Prioridad |
|---------|--------|-----------|
| `gemini_web2api/gemini.py` | Streaming robusto con timeout extendido y buffer persistente | 🔴 Alta |
| `gemini_web2api/server.py` | Tool calling con streaming chunked (acumular texto + emitir tool_calls al final) | 🔴 Alta |
| `gemini_web2api/config.py` | Timeouts configurables para streaming | 🟡 Media |
| `gemini_web2api/gemini.py` | Heartbeat para mantener conexión viva | 🟡 Media |

---

## Verificación

1. **Streaming sin tools:** Probar con `curl --stream` y verificar que los chunks llegan progresivamente
2. **Streaming con tools:** Probar con DeepSeek Harness (tool calling activo) y verificar que:
   - Los chunks de contenido llegan progresivamente
   - Los tool calls se envían correctamente al final
   - El `finish_reason` es `"tool_calls"` cuando aplica
3. **Reconexión:** Simular timeout de red y verificar que el streaming reconecta automáticamente
4. **Fallback:** Verificar que si el streaming falla completamente, cae a non-streaming correctamente

---

## Notas de implementación

- Los cambios son en `vendor/gemini-web2api/` — directorio vendorizado
- Después de modificar, ejecutar `pnpm build:vendor` para reconstruir
- Los tests existentes en `apps/shell/tests/gemini-web2api.test.ts` deben seguir pasando
- Considerar agregar tests específicos de streaming en el futuro
