"""Battle helpers: bounded model comparison on top of the panel primitive."""

from __future__ import annotations

from .panel import (
    DEFAULT_PANEL_COUNT,
    MAX_PANEL_COUNT,
    PanelAnswer,
    PanelResult,
    run_panel,
)
from .router import Pool


def run_battle(
    pool: Pool,
    prompt: str,
    *,
    n: object = DEFAULT_PANEL_COUNT,
    max_tokens: object = 512,
    timeout: float = 90.0,
    routing: str | None = "quality",
    synthesize: bool = False,
) -> PanelResult:
    return run_panel(
        pool,
        prompt=prompt,
        n=n,
        max_tokens=max_tokens,
        timeout=timeout,
        routing=routing or "quality",
        synthesize=synthesize,
    )


def render_battle_markdown(result: PanelResult) -> str:
    prompt = result.prompt.replace("\n", " ").strip()
    if len(prompt) > 80:
        prompt = prompt[:79] + "..."
    lines = [
        f'# freellmpool battle - {len(result.answers)} models on "{prompt}"',
        "",
    ]
    if result.truncated:
        lines.append(
            f"> requested {result.requested_count}, ran {len(result.answers)} "
            f"(battle is capped at {MAX_PANEL_COUNT} and depends on configured providers)."
        )
        lines.append("")
    lines.extend(
        [
            "| model | result |",
            "|---|---|",
        ]
    )
    for answer in result.answers:
        lines.append(f"| `{_escape_cell(answer.label)}` | {_answer_cell(answer)} |")
    if result.synthesis is not None:
        lines.extend(["", "## synthesis"])
        if result.synthesis.error:
            lines.append(f"failed: `{result.synthesis.error}`")
        else:
            label = f"{result.synthesis.provider_id}/{result.synthesis.model}"
            lines.append(f"via `{label}`")
            lines.append("")
            lines.append(result.synthesis.text or "")
    return "\n".join(lines).rstrip()


def battle_to_dict(result: PanelResult) -> dict:
    return {
        "prompt": result.prompt,
        "requested_count": result.requested_count,
        "selected_count": result.selected_count,
        "max_tokens": result.max_tokens,
        "truncated": result.truncated,
        "answers": [
            {
                "provider_id": answer.provider_id,
                "model": answer.model,
                "label": answer.label,
                "family": answer.family,
                "text": answer.text,
                "latency_ms": answer.latency_ms,
                "error": answer.error,
                "cached": answer.cached,
            }
            for answer in result.answers
        ],
        "synthesis": None
        if result.synthesis is None
        else {
            "provider_id": result.synthesis.provider_id,
            "model": result.synthesis.model,
            "text": result.synthesis.text,
            "error": result.synthesis.error,
        },
        "markdown": render_battle_markdown(result),
    }


def write_battle_record(result: PanelResult, *, store=None):
    from .artifacts import RunRecordStore

    payload = battle_to_dict(result)
    store = store or RunRecordStore()
    return store.append_new(
        kind="battle",
        title="freellmpool battle",
        prompt=result.prompt,
        output=payload["markdown"],
        items=payload["answers"],
        metadata={
            "requested_count": result.requested_count,
            "selected_count": result.selected_count,
            "max_tokens": result.max_tokens,
            "truncated": result.truncated,
        },
    )


def _answer_cell(answer: PanelAnswer) -> str:
    if answer.error:
        return f"failed: `{_escape_cell(answer.error)}`"
    body = _escape_cell(answer.text or "")
    tag = "cache" if answer.cached else f"{answer.latency_ms}ms"
    return f"{body}<br><sub>{tag}</sub>"


def _escape_cell(value: str) -> str:
    return (
        value.replace("|", "\\|")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", "<br>")
    )
