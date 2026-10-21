"""Quota-wise mode policy helpers.

``FREELLMPOOL_MODE=wise`` is intentionally a conservative overlay on top of
the existing router. It lowers defaults and refuses implicit fallback to
unknown/unmetered targets once declared local free quota is exhausted, while
explicit user choices still win.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, TextIO

MODE_ENV = "FREELLMPOOL_MODE"
WISE_MODE = "wise"
NORMAL_MODE = "normal"
WISE_DEFAULT_MAX_TOKENS = 512
WISE_DEFAULT_ROUTING = "spread"
WISE_TOKENMAX_DEFAULT_MODELS = 3
WISE_EXPENSIVE_MODEL_THRESHOLD = 3


@dataclass(frozen=True)
class ProviderHeadroom:
    provider_id: str
    label: str
    used: int
    limit: int
    remaining: int | None
    declared_models: int
    status: str


def current_mode(
    env: Mapping[str, str] | None = None,
    *,
    override: str | None = None,
    settings: Mapping[str, object] | None = None,
) -> str:
    """Return the normalized freellmpool operating mode."""
    env = os.environ if env is None else env
    raw = override or env.get(MODE_ENV) or (settings or {}).get("mode") or NORMAL_MODE
    mode = str(raw).strip().lower()
    return WISE_MODE if mode == WISE_MODE else NORMAL_MODE


def is_wise_enabled(
    env: Mapping[str, str] | None = None,
    *,
    override: str | None = None,
    settings: Mapping[str, object] | None = None,
) -> bool:
    return current_mode(env, override=override, settings=settings) == WISE_MODE


def default_routing_for_mode(env: Mapping[str, str], settings: Mapping[str, object]) -> str:
    """Return the pool routing default, preserving explicit config/env choices."""
    env_routing = env.get("FREELLMPOOL_ROUTING")
    if env_routing:
        return str(env_routing).lower()
    cfg_routing = settings.get("routing")
    if cfg_routing:
        return str(cfg_routing).lower()
    return WISE_DEFAULT_ROUTING if is_wise_enabled(env, settings=settings) else "fair"


def target_key(target: Any) -> str:
    return f"{target.provider.id}::{target.model}"


def declared_targets(targets: Iterable[Any]) -> list[Any]:
    return [target for target in targets if int(getattr(target, "rpd", 0) or 0) > 0]


def declared_quota_exhausted(targets: Iterable[Any], snapshot: Mapping[str, int]) -> bool:
    """True when every declared-RPD target in the candidate set is exhausted."""
    declared = declared_targets(targets)
    if not declared:
        return False
    for target in declared:
        used = int(snapshot.get(target_key(target), 0))
        if used < int(target.rpd):
            return False
    return True


def targets_with_declared_headroom(
    targets: Iterable[Any], snapshot: Mapping[str, int]
) -> list[Any]:
    available: list[Any] = []
    for target in targets:
        rpd = int(getattr(target, "rpd", 0) or 0)
        if rpd <= 0:
            continue
        if int(snapshot.get(target_key(target), 0)) < rpd:
            available.append(target)
    return available


def provider_ids_with_declared_headroom(
    targets: Iterable[Any], snapshot: Mapping[str, int]
) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for target in targets_with_declared_headroom(targets, snapshot):
        provider_id = target.provider.id
        if provider_id not in seen:
            seen.add(provider_id)
            ids.append(provider_id)
    return ids


def provider_headroom_rows(providers: Sequence[Any], snapshot: Mapping[str, int]) -> list[ProviderHeadroom]:
    rows: list[ProviderHeadroom] = []
    for provider in providers:
        used = 0
        limit = 0
        declared_models = 0
        for model in provider.models:
            if not getattr(model, "enabled", True):
                continue
            rpd = int(getattr(model, "rpd", 0) or 0)
            if rpd <= 0:
                continue
            declared_models += 1
            limit += rpd
            used += int(snapshot.get(f"{provider.id}::{model.name}", 0))
        if limit <= 0:
            remaining = None
            status = "unknown"
        else:
            remaining = max(0, limit - used)
            if remaining == 0:
                status = "exhausted"
            elif remaining <= max(1, int(limit * 0.2)):
                status = "low"
            else:
                status = "available"
        rows.append(
            ProviderHeadroom(
                provider_id=provider.id,
                label=provider.label,
                used=used,
                limit=limit,
                remaining=remaining,
                declared_models=declared_models,
                status=status,
            )
        )
    rows.sort(key=_headroom_sort_key)
    return rows


def recommended_mode(rows: Sequence[ProviderHeadroom]) -> str:
    declared = [row for row in rows if row.limit > 0]
    if not declared:
        return NORMAL_MODE
    if any(row.status in {"low", "exhausted"} for row in declared):
        return WISE_MODE
    return NORMAL_MODE


def render_quota_wise_status(providers: Sequence[Any], snapshot: Mapping[str, int], *, active: bool) -> str:
    rows = provider_headroom_rows(providers, snapshot)
    rec = recommended_mode(rows)
    lines = [
        "Quota-wise status (UTC):",
        f"  active mode:      {WISE_MODE if active else NORMAL_MODE}",
        f"  recommended mode: {rec}",
        "",
        "local headroom from declared RPD hints:",
        f"  {'provider':<13} {'used':>7} {'limit':>7} {'remain':>7}  status",
    ]
    if not rows:
        lines.append("  (no configured providers)")
        return "\n".join(lines)
    for row in rows:
        limit = "-" if row.limit <= 0 else str(row.limit)
        remaining = "-" if row.remaining is None else str(row.remaining)
        lines.append(
            f"  {row.provider_id:<13} {row.used:>7} {limit:>7} {remaining:>7}  {row.status}"
        )
    return "\n".join(lines)


def confirm_expensive_operation(
    label: str,
    *,
    assume_yes: bool = False,
    stdin: TextIO | None = None,
    stderr: TextIO | None = None,
) -> bool:
    """Prompt before expensive wise-mode work; non-interactive callers fail closed."""
    if assume_yes:
        return True
    stdin = stdin or sys.stdin
    stderr = stderr or sys.stderr
    if stdin is None or not getattr(stdin, "isatty", lambda: False)():
        print(
            f"freellmpool: wise mode refuses {label} in non-interactive mode; "
            "pass --yes or lower --max-models.",
            file=stderr,
        )
        return False
    print(f"freellmpool wise mode: {label}. Continue? [y/N] ", end="", file=stderr)
    try:
        answer = stdin.readline().strip().lower()
    except OSError:
        return False
    return answer in {"y", "yes"}


def _headroom_sort_key(row: ProviderHeadroom) -> tuple[int, int, str]:
    rank = {"available": 0, "low": 1, "exhausted": 2, "unknown": 3}
    return (rank.get(row.status, 9), -(row.remaining or 0), row.provider_id)
