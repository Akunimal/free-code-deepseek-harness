"""Context-window helpers: input-size estimation and provider error parsing.

Pure, dependency-free functions shared by the sync and async routers. freellmpool
never truncates a request; instead it uses these to (a) skip models whose window
is known (declared or learned from a prior error) to be too small, and (b) raise a
clear :class:`~freellmpool.errors.ContextWindowExceeded` when nothing fits.

The token estimate is deliberately a rough ``chars / 4`` — the same heuristic the
Anthropic shim uses — so there is no tokenizer dependency. It is approximate (it
under-counts CJK/code), so it is only ever used to *skip a window already known to
be too small*, never to truncate.
"""

from __future__ import annotations

import json
import re

# Phrases that mark a 400/413 as a *context-window* overflow specifically — kept
# narrow so unrelated 400s ("tool description too long", "image url too long",
# "reduce the length of the JSON schema") do not match.
_CTX_PHRASES = re.compile(
    r"maximum context length|context length is|context window|maximum_context_length|"
    r"prompt is too long|input is too long|too many (?:input )?tokens|"
    r"exceeds the (?:model'?s )?context|reduce the length of the messages",
    re.IGNORECASE,
)

# The model's *limit* (not the "you requested N" figure): the number that follows
# "context length/window". e.g. "maximum context length is 4096 tokens" -> 4096.
_LIMIT_RE = re.compile(r"context\s+(?:length|window)[^.\d]*?(\d[\d,]+)\s*token", re.IGNORECASE)

_TOKENS_PER_CHAR = 0.25  # ~4 chars/token; see module docstring on why this is rough


def estimate_input_tokens(messages, tools=None) -> int:
    """A rough token estimate of a request's input (messages + any tools).

    Counts string ``content`` and the text parts of multimodal content, plus any
    assistant ``tool_calls`` and the serialized ``tools`` (both sent in the body).
    Never raises. The chars/4 estimate under-counts CJK/code, so it is only used to
    skip a window already known too small — never to truncate.
    """
    chars = 0
    for m in messages or []:
        if not isinstance(m, dict):
            continue
        content = m.get("content")
        if isinstance(content, str):
            chars += len(content)
        elif isinstance(content, list):  # multimodal parts
            for part in content:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    chars += len(part["text"])
        if m.get("tool_calls"):  # assistant function-call turns can be large
            try:
                chars += len(json.dumps(m["tool_calls"]))
            except (TypeError, ValueError):  # pragma: no cover - defensive
                pass
    if tools:
        try:
            chars += len(json.dumps(tools))
        except (TypeError, ValueError):  # pragma: no cover - defensive
            pass
    return int(chars * _TOKENS_PER_CHAR)


def context_limit_from_error(status: int, message: str) -> tuple[bool, int | None]:
    """Classify a provider error: ``(is_context_overflow, learned_limit_or_None)``.

    Only ``400``/``413`` with a context-specific phrase count. The limit is parsed
    from the "context length/window ... N tokens" figure when present (ignoring the
    separate "you requested N" number), else ``None``.
    """
    if status not in (400, 413):
        return (False, None)
    msg = message or ""
    if not _CTX_PHRASES.search(msg):
        return (False, None)
    limit: int | None = None
    m = _LIMIT_RE.search(msg)
    if m:
        digits = m.group(1).replace(",", "")
        if digits.isdigit():
            limit = int(digits)
    return (True, limit)
