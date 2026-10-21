"""User plugins: register custom providers and request/response adapters.

Two extension points, both additive — they never shadow the built-in catalog
unless they reuse an id:

* **Providers.** Call :func:`register_provider` (or expose a
  ``freellmpool.providers`` entry point) to add an endpoint freellmpool will
  route to alongside the built-ins. The provider is subject to the same
  ``is_configured`` check, so it only activates when its key/env is present.

* **Adapters.** Call :func:`register_adapter` to teach the client a new request
  shape beyond the built-in ``openai`` / ``cloudflare`` / ``gemini`` ones. An
  adapter is a callable with the same signature as the built-in callers; set the
  provider's ``adapter`` field to its name.

Entry-point providers are discovered lazily and cached. A failing entry point is
skipped (logged at debug), never fatal.
"""

from __future__ import annotations

import threading
from collections.abc import Callable

from .models import Provider
from .observe import logger

# Process-global registries. Small and write-rarely; a plain list/dict is fine.
_PROVIDERS: list[Provider] = []
_ADAPTERS: dict[str, Callable] = {}
_ENTRYPOINTS_LOADED = False
_ENTRYPOINT_PROVIDERS: list[Provider] = []
_ENTRYPOINT_LOCK = threading.Lock()


def register_provider(provider: Provider) -> None:
    """Add a custom :class:`~freellmpool.Provider` to the routing catalog."""
    if not isinstance(provider, Provider):  # pragma: no cover - guardrail
        raise TypeError(f"expected Provider, got {type(provider).__name__}")
    _PROVIDERS.append(provider)


def register_adapter(name: str, caller: Callable) -> None:
    """Register a request/response adapter under ``name``.

    ``caller`` must accept the same arguments as the built-in ``call`` adapters
    (provider, model, messages, *, api_key, env, max_tokens, temperature,
    timeout, tools, tool_choice, post) and return a :class:`~freellmpool.Reply`.
    """
    if not callable(caller):  # pragma: no cover - guardrail
        raise TypeError("adapter caller must be callable")
    _ADAPTERS[name] = caller


def registered_adapters() -> dict[str, Callable]:
    return dict(_ADAPTERS)


def registered_providers() -> list[Provider]:
    """All plugin providers: explicitly registered ones plus entry points."""
    return list(_PROVIDERS) + _load_entrypoint_providers()


def _load_entrypoint_providers() -> list[Provider]:
    global _ENTRYPOINTS_LOADED
    if _ENTRYPOINTS_LOADED:  # fast path once loaded
        return list(_ENTRYPOINT_PROVIDERS)
    with _ENTRYPOINT_LOCK:
        if _ENTRYPOINTS_LOADED:  # another thread finished while we waited
            return list(_ENTRYPOINT_PROVIDERS)
        loaded: list[Provider] = []
        try:
            from importlib.metadata import entry_points

            try:
                eps = entry_points(group="freellmpool.providers")
            except TypeError:  # pragma: no cover - <3.10 selection API
                eps = entry_points().get("freellmpool.providers", [])  # type: ignore[attr-defined]
            for ep in eps:
                try:
                    obj = ep.load()
                    result = obj() if callable(obj) else obj
                    items = result if isinstance(result, (list, tuple)) else [result]
                    loaded.extend(i for i in items if isinstance(i, Provider))
                except Exception:  # noqa: BLE001 — a broken plugin must not break startup
                    logger.debug(
                        "failed to load provider entry point %r",
                        getattr(ep, "name", ep),
                        exc_info=True,
                    )
        except Exception:  # pragma: no cover - importlib.metadata unavailable
            loaded = []
        # Publish the fully-populated list, *then* flip the flag, so no concurrent
        # reader can observe a partial result.
        _ENTRYPOINT_PROVIDERS.extend(loaded)
        _ENTRYPOINTS_LOADED = True
        return list(_ENTRYPOINT_PROVIDERS)


def _reset_for_tests() -> None:
    """Clear registries — used by the test suite for isolation."""
    global _ENTRYPOINTS_LOADED
    _PROVIDERS.clear()
    _ADAPTERS.clear()
    _ENTRYPOINT_PROVIDERS.clear()
    _ENTRYPOINTS_LOADED = False
