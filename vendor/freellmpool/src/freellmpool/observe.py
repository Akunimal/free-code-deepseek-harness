"""Observability: a module logger plus a per-Pool event hook.

The library never configures logging handlers itself (that's the application's
job) — it only emits on the ``freellmpool`` logger, so it stays silent until a
host opts in. Set ``FREELLMPOOL_LOG`` (a level name like ``info`` or ``debug``,
or ``1`` for info) and the CLI/proxy will attach a stderr handler.

Programmatic users can pass ``on_event`` to :class:`~freellmpool.Pool` to receive
structured event dicts — one per routing attempt, success, error, and cooldown —
for metrics/tracing pipelines (OpenTelemetry, Prometheus, plain JSON logs, ...).
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable, Mapping

logger = logging.getLogger("freellmpool")

#: An event hook receives a dict like ``{"event": "success", "target": "groq/...",
#: "latency_ms": 142.0, "attempts": 1}``. Exceptions raised by a hook are swallowed.
EventHook = Callable[[dict], None]

_LEVELS = {
    "1": logging.INFO,
    "true": logging.INFO,
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "warn": logging.WARNING,
    "error": logging.ERROR,
}


def configure_logging_from_env(env: Mapping[str, str] | None = None) -> bool:
    """If ``FREELLMPOOL_LOG`` is set, attach a stderr handler at that level.

    Returns True if logging was enabled. Idempotent — won't double-add handlers.
    Meant to be called by the CLI/proxy entrypoints, not the library.
    """
    env = env if env is not None else os.environ
    raw = (env.get("FREELLMPOOL_LOG") or "").strip().lower()
    if not raw:
        return False
    level = _LEVELS.get(raw, logging.INFO)
    logger.setLevel(level)
    if not any(getattr(h, "_freellmpool", False) for h in logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("freellmpool %(levelname)s %(message)s"))
        handler._freellmpool = True  # type: ignore[attr-defined]
        logger.addHandler(handler)
    return True


def emit(hook: EventHook | None, event: str, **fields) -> None:
    """Log a structured event and, if present, pass it to the user hook.

    Failures in the user hook are isolated — observability must never break a
    completion. Log level is keyed off the event name.
    """
    payload = {"event": event, **fields}
    if logger.isEnabledFor(logging.DEBUG) or (
        event in ("error", "cooldown", "exhausted") and logger.isEnabledFor(logging.INFO)
    ):
        _log(event, payload)
    if hook is not None:
        try:
            hook(payload)
        except Exception:  # noqa: BLE001 — a bad hook must not break routing
            logger.debug("event hook raised", exc_info=True)


def _log(event: str, payload: dict) -> None:
    detail = " ".join(f"{k}={v}" for k, v in payload.items() if k != "event")
    if event in ("error", "exhausted"):
        logger.info("%s %s", event, detail)
    elif event == "cooldown":
        logger.info("%s %s", event, detail)
    else:
        logger.debug("%s %s", event, detail)
