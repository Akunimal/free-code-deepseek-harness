"""Markdown, HTML, and cost-audit rendering for run records."""

from __future__ import annotations

import html
import os
import re
import sys
import webbrowser
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from .artifacts import RunRecord, RunRecordStore
from .config import load_catalog
from .quota import QuotaStore
from .savings import BASELINE_LABEL, format_saved

_BEARER_RE = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{12,}", re.IGNORECASE)
_API_KEY_PATTERNS = (
    re.compile(r"\bsk-[A-Za-z0-9_\-]{8,}\b"),
    re.compile(r"\bsk-or-[A-Za-z0-9_\-]{8,}\b"),
    re.compile(r"\bgsk_[A-Za-z0-9_\-]{8,}\b"),
    re.compile(r"\bcsk-[A-Za-z0-9_\-]{8,}\b"),
    re.compile(r"\bnvapi-[A-Za-z0-9_\-]{8,}\b"),
    re.compile(r"\bghp_[A-Za-z0-9_]{8,}\b"),
    re.compile(r"\bAIza[A-Za-z0-9_\-]{8,}\b"),
)
_KEY_ASSIGN_RE = re.compile(
    r"\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|KEY)[A-Z0-9_]*\s*[:=]\s*)"
    r"([\"']?)[^\"'\s]{8,}\2",
    re.IGNORECASE,
)
_URL_SCHEME_RE = re.compile(r"https?://", re.IGNORECASE)
_SCHEMELESS_CDN_RE = re.compile(r"//\s*cdn", re.IGNORECASE)
_SCRIPT_SRC_RE = re.compile(r"script-src", re.IGNORECASE)


def render_markdown_report(record: RunRecord) -> str:
    lines = [
        f"# {redact_secrets(record.title)}",
        "",
        f"- run: `{record.run_id}`",
        f"- type: `{record.kind}`",
        f"- status: `{record.status}`",
        f"- created: `{record.created_at}`",
    ]
    for label, value in _record_fields(record):
        lines.append(f"- {label}: `{redact_secrets(value)}`")
    if record.usage:
        prompt_tokens, completion_tokens = usage_totals(record)
        lines.append(f"- usage: `{prompt_tokens}` prompt tokens, `{completion_tokens}` completion tokens")
    if record.prompt:
        lines.extend(["", "## Prompt", redact_secrets(record.prompt)])
    if record.output:
        lines.extend(["", "## Output", redact_secrets(record.output)])
    if record.items:
        lines.extend(["", "## Records"])
        for idx, item in enumerate(record.items, start=1):
            label = str(item.get("label") or item.get("model") or item.get("id") or f"item {idx}")
            lines.extend(["", f"### {redact_secrets(label)}"])
            model_line = _item_model_line(item)
            if model_line:
                lines.append(model_line)
            if item.get("error"):
                lines.extend(["", f"Error: {redact_secrets(str(item['error']))}"])
            text = item.get("text") or item.get("output")
            if text:
                lines.extend(["", redact_secrets(str(text))])
    return "\n".join(lines).rstrip() + "\n"


def render_html_report(record: RunRecord) -> str:
    css = """
    body{font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;color:#1f2933;background:#f6f8fa}
    main{max-width:980px;margin:0 auto;padding:32px 20px}
    h1{font-size:28px;line-height:1.2;margin:0 0 12px}
    h2{font-size:18px;margin:28px 0 10px}
    h3{font-size:16px;margin:20px 0 8px}
    .meta{display:grid;grid-template-columns:160px 1fr;gap:6px 12px;margin:18px 0;padding:14px;border:1px solid #d6dde5;background:#fff}
    .label{color:#52616f;font-weight:600}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;border:1px solid #d6dde5;padding:14px;margin:0}
    .item{border:1px solid #d6dde5;background:#fff;padding:14px;margin:12px 0}
    .error{color:#9f1239;font-weight:600}
    """
    meta_rows = [
        ("run", record.run_id),
        ("type", record.kind),
        ("status", record.status),
        ("created", record.created_at),
    ]
    meta_rows.extend(_record_fields(record))
    if record.usage:
        prompt_tokens, completion_tokens = usage_totals(record)
        meta_rows.append(("usage", f"{prompt_tokens} prompt tokens, {completion_tokens} completion tokens"))
    meta = "\n".join(
        f'<div class="label">{_h(label)}</div><div>{_h(value)}</div>' for label, value in meta_rows
    )
    sections = [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>{_h(record.title)}</title>",
        f"<style>{css}</style>",
        "</head>",
        "<body><main>",
        f"<h1>{_h(record.title)}</h1>",
        f'<section class="meta">{meta}</section>',
    ]
    if record.prompt:
        sections.extend(["<h2>Prompt</h2>", f"<pre>{_h(record.prompt)}</pre>"])
    if record.output:
        sections.extend(["<h2>Output</h2>", f"<pre>{_h(record.output)}</pre>"])
    if record.items:
        sections.append("<h2>Records</h2>")
        for idx, item in enumerate(record.items, start=1):
            label = str(item.get("label") or item.get("model") or item.get("id") or f"item {idx}")
            sections.append('<section class="item">')
            sections.append(f"<h3>{_h(label)}</h3>")
            model_line = _item_model_line(item)
            if model_line:
                sections.append(f"<p>{_h(model_line)}</p>")
            if item.get("error"):
                sections.append(f'<p class="error">Error: {_h(str(item["error"]))}</p>')
            text = item.get("text") or item.get("output")
            if text:
                sections.append(f"<pre>{_h(str(text))}</pre>")
            sections.append("</section>")
    sections.extend(["</main></body>", "</html>"])
    rendered = "\n".join(sections)
    # Defense in depth for self-contained reports: untrusted text may contain
    # URLs or CSP snippets even after escaping, so neutralize external-reference
    # tokens in the final document as well.
    return _neutralize_external_references(rendered)


def write_report(record: RunRecord, fmt: str, *, store: RunRecordStore | None = None) -> Path:
    store = store or RunRecordStore()
    path = store.report_path(record.run_id, fmt)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = render_html_report(record) if fmt in {"html", "htm"} else render_markdown_report(record)
    path.write_text(text, encoding="utf-8")
    return path


def render_record_list(records: list[RunRecord]) -> str:
    if not records:
        return "No run records found."
    lines = ["run id                 type             status      created               title"]
    for record in records:
        title = redact_secrets(record.title).replace("\n", " ")
        if len(title) > 44:
            title = title[:43] + "..."
        lines.append(
            f"{record.run_id:<22} {record.kind:<16} {record.status:<11} {record.created_at:<20} {title}"
        )
    return "\n".join(lines)


def render_cost_report(
    record: RunRecord,
    *,
    quota: QuotaStore | None = None,
    catalog: Any | None = None,
) -> str:
    prompt_tokens, completion_tokens = usage_totals(record)
    quota = quota or QuotaStore()
    catalog = catalog if catalog is not None else load_catalog()
    quota_snapshot = quota.snapshot()
    lines = [
        f"Cost audit for {record.run_id}",
        f"  type:     {record.kind}",
        f"  role:     {record.role or '-'}",
        f"  profile:  {record.profile or '-'}",
        f"  recipe:   {record.recipe or '-'}",
        f"  tokens:   {prompt_tokens:,} in / {completion_tokens:,} out",
        f"  savings:  {format_saved(prompt_tokens, completion_tokens)}",
    ]
    targets = _record_targets(record)
    if targets:
        lines.append("  local quota hints:")
        for provider_id, model in targets:
            key = f"{provider_id}::{model}"
            used = int(quota_snapshot.get(key, 0))
            rpd = _catalog_rpd(catalog, provider_id, model)
            hint = "unknown" if rpd <= 0 else str(rpd)
            lines.append(f"    {provider_id}/{model}: used {used}/{hint} today")
    lines.append(f"  baseline: {BASELINE_LABEL}")
    return "\n".join(lines)


def open_report_path(
    path: Path,
    *,
    opener: Callable[[str], bool] | None = None,
    stream: Any | None = None,
) -> bool:
    opener = opener or webbrowser.open
    stream = stream if stream is not None else sys.stdout
    target = path.resolve()
    try:
        opened = bool(opener(target.as_uri()))
    except Exception:  # noqa: BLE001 - opening is best effort
        opened = False
    if not opened:
        print(target, file=stream)
    return opened


def usage_totals(record: RunRecord) -> tuple[int, int]:
    prompt_tokens = _int(record.usage.get("prompt_tokens"))
    completion_tokens = _int(record.usage.get("completion_tokens"))
    for item in record.items:
        usage = item.get("usage")
        if isinstance(usage, Mapping):
            prompt_tokens += _int(usage.get("prompt_tokens"))
            completion_tokens += _int(usage.get("completion_tokens"))
    return prompt_tokens, completion_tokens


def redact_secrets(value: str) -> str:
    text = _BEARER_RE.sub("Bearer <redacted>", value)
    text = _KEY_ASSIGN_RE.sub(r"\1<redacted>", text)
    for pattern in _API_KEY_PATTERNS:
        text = pattern.sub("<redacted-api-key>", text)
    return text


def _record_fields(record: RunRecord) -> list[tuple[str, str]]:
    fields: list[tuple[str, str]] = []
    for label, value in (
        ("provider", record.provider_id),
        ("model", record.model),
        ("role", record.role),
        ("profile", record.profile),
        ("recipe", record.recipe),
    ):
        if value:
            fields.append((label, value))
    return fields


def _item_model_line(item: Mapping[str, Any]) -> str:
    provider = item.get("provider_id")
    model = item.get("model")
    if provider and model:
        return f"`{provider}/{model}`"
    if model:
        return f"`{model}`"
    return ""


def _record_targets(record: RunRecord) -> list[tuple[str, str]]:
    seen: set[tuple[str, str]] = set()
    targets: list[tuple[str, str]] = []

    def add(provider_id: Any, model: Any) -> None:
        if not provider_id or not model:
            return
        key = (str(provider_id), str(model))
        if key not in seen:
            seen.add(key)
            targets.append(key)

    add(record.provider_id, record.model)
    for item in record.items:
        add(item.get("provider_id"), item.get("model"))
    return targets


def _catalog_rpd(catalog: Any, provider_id: str, model: str) -> int:
    for provider in catalog:
        if getattr(provider, "id", None) != provider_id:
            continue
        for item in getattr(provider, "models", ()):
            if getattr(item, "name", None) == model:
                return int(getattr(item, "rpd", 0) or 0)
    return 0


def _h(value: str) -> str:
    escaped = html.escape(redact_secrets(str(value)), quote=True)
    return _neutralize_external_references(escaped)


def _neutralize_external_references(value: str) -> str:
    text = _URL_SCHEME_RE.sub(lambda m: "hxxps://" if m.group(0).lower().startswith("https") else "hxxp://", value)
    text = _SCHEMELESS_CDN_RE.sub("// local-cdn-redacted", text)
    return _SCRIPT_SRC_RE.sub("script source", text)


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def resolve_report_target(store: RunRecordStore, target: str | None) -> tuple[RunRecord | None, Path | None]:
    if target is None:
        return store.last(), None
    candidate = Path(os.path.expanduser(target))
    if candidate.suffix or candidate.exists() or "/" in target or "\\" in target:
        return None, candidate
    return store.get(target), None
