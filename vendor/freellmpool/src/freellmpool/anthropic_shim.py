"""Anthropic Messages API shim — run Claude Code (and any Anthropic-API tool) on
free models. Translates Anthropic `/v1/messages` <-> the pool's OpenAI-style chat,
including tools (tool_use / tool_result) and the streaming event sequence.

The streaming path is *buffered-then-replayed*: freellmpool resolves the full
completion (with failover + tool calls) and then emits Anthropic's exact SSE event
sequence, so clients that require streaming work without true mid-stream failover.

This is experimental — text + tool-use are covered; images/vision are not yet.
"""

from __future__ import annotations

import json
from collections.abc import Iterator


def _flatten_text(blocks) -> str:
    if isinstance(blocks, str):
        return blocks
    if isinstance(blocks, list):
        return "".join(
            str(b.get("text") or "")
            for b in blocks
            if isinstance(b, dict) and b.get("type") == "text"
        )
    return ""


def _safe_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def request_to_chat(body: dict) -> dict:
    """Anthropic Messages request -> kwargs for Pool.chat()."""
    messages: list[dict] = []

    system = body.get("system")
    sys_text = _flatten_text(system) if system else ""
    if sys_text:
        messages.append({"role": "system", "content": sys_text})

    for m in body.get("messages", []):
        if not isinstance(m, dict):
            continue
        role = m.get("role", "user")
        content = m.get("content")
        if isinstance(content, str):
            messages.append({"role": role, "content": content})
            continue
        if not isinstance(content, list):
            continue
        text_parts: list[str] = []
        tool_calls: list[dict] = []
        tool_results: list[dict] = []
        for b in content:
            if not isinstance(b, dict):
                continue
            t = b.get("type")
            if t == "text":
                text_parts.append(str(b.get("text") or ""))
            elif t == "tool_use":
                tool_calls.append(
                    {
                        "id": b.get("id") or "toolu_0",
                        "type": "function",
                        "function": {
                            "name": b.get("name"),
                            "arguments": json.dumps(b.get("input") or {}),
                        },
                    }
                )
            elif t == "tool_result":
                rc = b.get("content")
                rc = _flatten_text(rc) if isinstance(rc, list) else rc
                tool_results.append(
                    {
                        "role": "tool",
                        "tool_call_id": b.get("tool_use_id") or "toolu_0",
                        "content": "" if rc is None else str(rc),
                    }
                )
            # image blocks are ignored for now (no vision yet)
        if role == "assistant":
            msg: dict = {"role": "assistant", "content": "".join(text_parts) or None}
            if tool_calls:
                msg["tool_calls"] = tool_calls
            messages.append(msg)
        else:
            if text_parts:
                messages.append({"role": "user", "content": "".join(text_parts)})
            messages.extend(tool_results)

    tools = None
    if isinstance(body.get("tools"), list):
        tools = [
            {
                "type": "function",
                "function": {
                    "name": t.get("name"),
                    "description": t.get("description", ""),
                    "parameters": t.get("input_schema") or {"type": "object"},
                },
            }
            for t in body["tools"]
            if isinstance(t, dict) and t.get("name")
        ] or None

    return {
        "messages": messages,
        "tools": tools,
        "tool_choice": _tool_choice(body.get("tool_choice")),
        "max_tokens": _safe_int(body.get("max_tokens"), 1024),
        "temperature": _safe_float(body.get("temperature"), 0.0),
        "model": body.get("model", "auto"),
    }


def _tool_choice(choice):
    if not isinstance(choice, dict):
        return None
    t = choice.get("type")
    if t == "auto":
        return "auto"
    if t == "any":
        return "required"
    if t == "tool" and choice.get("name"):
        return {"type": "function", "function": {"name": choice["name"]}}
    return None


def _content_blocks(reply) -> tuple[list[dict], str]:
    """Build Anthropic content blocks + stop_reason from a pool Reply."""
    blocks: list[dict] = []
    tool_calls = (reply.message or {}).get("tool_calls") if reply.message else None
    if tool_calls:
        if reply.text:
            blocks.append({"type": "text", "text": reply.text})
        for tc in tool_calls:
            fn = tc.get("function") or {}
            try:
                inp = json.loads(fn.get("arguments") or "{}")
            except (json.JSONDecodeError, ValueError):
                inp = {}
            blocks.append(
                {
                    "type": "tool_use",
                    "id": tc.get("id") or "toolu_0",
                    "name": fn.get("name"),
                    "input": inp,
                }
            )
        return blocks, "tool_use"
    blocks.append({"type": "text", "text": reply.text})
    return blocks, "end_turn"


def reply_to_message(reply, model: str, msg_id: str = "msg_freellmpool") -> dict:
    blocks, stop_reason = _content_blocks(reply)
    return {
        "id": msg_id,
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": blocks,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {
            "input_tokens": reply.prompt_tokens or 0,
            "output_tokens": reply.completion_tokens or 0,
        },
    }


def reply_to_sse(reply, model: str, msg_id: str = "msg_freellmpool") -> Iterator[str]:
    """Yield Anthropic SSE event blocks (buffered replay of a finished reply)."""
    blocks, stop_reason = _content_blocks(reply)

    def ev(name: str, data: dict) -> str:
        return f"event: {name}\ndata: {json.dumps(data)}\n\n"

    yield ev(
        "message_start",
        {
            "type": "message_start",
            "message": {
                "id": msg_id,
                "type": "message",
                "role": "assistant",
                "model": model,
                "content": [],
                "stop_reason": None,
                "stop_sequence": None,
                "usage": {"input_tokens": reply.prompt_tokens or 0, "output_tokens": 0},
            },
        },
    )
    for i, block in enumerate(blocks):
        if block["type"] == "text":
            yield ev(
                "content_block_start",
                {
                    "type": "content_block_start",
                    "index": i,
                    "content_block": {"type": "text", "text": ""},
                },
            )
            yield ev(
                "content_block_delta",
                {
                    "type": "content_block_delta",
                    "index": i,
                    "delta": {"type": "text_delta", "text": block["text"]},
                },
            )
        else:  # tool_use
            yield ev(
                "content_block_start",
                {
                    "type": "content_block_start",
                    "index": i,
                    "content_block": {
                        "type": "tool_use",
                        "id": block["id"],
                        "name": block["name"],
                        "input": {},
                    },
                },
            )
            yield ev(
                "content_block_delta",
                {
                    "type": "content_block_delta",
                    "index": i,
                    "delta": {
                        "type": "input_json_delta",
                        "partial_json": json.dumps(block["input"]),
                    },
                },
            )
        yield ev("content_block_stop", {"type": "content_block_stop", "index": i})
    yield ev(
        "message_delta",
        {
            "type": "message_delta",
            "delta": {"stop_reason": stop_reason, "stop_sequence": None},
            "usage": {"output_tokens": reply.completion_tokens or 0},
        },
    )
    yield ev("message_stop", {"type": "message_stop"})


def estimate_tokens(body: dict) -> int:
    """Rough token estimate for /v1/messages/count_tokens (chars/4)."""
    chat = request_to_chat(body)
    chars = sum(len(str(m.get("content") or "")) for m in chat["messages"])
    return max(1, chars // 4)
