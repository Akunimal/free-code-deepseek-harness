"""Deterministic behavioral contracts for the pinned FreeLLMpool router.

This deliberately uses only in-memory providers and a fake stream transport: the
contract must never call a public model endpoint or use an API credential.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "vendor" / "freellmpool" / "src"))

from freellmpool import router  # noqa: E402
from freellmpool.errors import AllProvidersExhausted, ProviderHTTPError  # noqa: E402
from freellmpool.models import Model, Provider  # noqa: E402
from freellmpool.proxy import _parse_model  # noqa: E402


class PhoenixRoutingContracts(unittest.TestCase):
    def make_pool(self) -> router.Pool:
        providers = [
            Provider("route-a", "Route A", "openai", "https://route-a.invalid/v1", (Model("shared-model"),), auth="none"),
            Provider("route-b", "Route B", "openai", "https://route-b.invalid/v1", (Model("shared-model"),), auth="none"),
        ]
        pool = router.Pool(providers, env={})
        # Keep candidate order deterministic without testing the balancing policy.
        pool._order = lambda targets, **_kwargs: targets  # type: ignore[method-assign]
        return pool

    @staticmethod
    def failing(status: int, message: str, *, retryable: bool):
        def stream():
            raise ProviderHTTPError(status, message, retryable=retryable)
            yield "unreachable"

        return stream()

    def test_concrete_selector_model_is_pinned_and_client_error_does_not_poison_health(self) -> None:
        pool = self.make_pool()
        calls: list[tuple[str, str]] = []

        def fake_stream_call(provider, model, *_args, **_kwargs):
            calls.append((provider.id, model))
            return self.failing(400, "unsupported request for this model", retryable=False)

        providers, model = _parse_model("route-a/shared-model", {"route-a", "route-b"})
        self.assertEqual(providers, ["route-a"])
        self.assertEqual(model, "shared-model")
        stream = pool.stream_chat([{"role": "user", "content": "test"}], model=model, providers=providers)

        with patch.object(router._client, "stream_call", side_effect=fake_stream_call):
            with self.assertRaises(AllProvidersExhausted) as raised:
                next(stream)

        self.assertEqual(raised.exception.client_status, 400)
        self.assertEqual(calls, [("route-a", "shared-model")])
        self.assertIsNone(pool.metrics.get("route-a/shared-model"))

    def test_auto_retries_another_route_only_before_the_first_stream_chunk(self) -> None:
        pool = self.make_pool()
        calls: list[str] = []

        def fake_stream_call(provider, model, *_args, **_kwargs):
            calls.append(provider.id)
            if provider.id == "route-a":
                return self.failing(503, "temporary upstream outage", retryable=True)
            return iter(["answer"])

        providers, model = _parse_model("auto", {"route-a", "route-b"})
        self.assertIsNone(providers)
        self.assertIsNone(model)
        with patch.object(router._client, "stream_call", side_effect=fake_stream_call):
            chunks = list(pool.stream_chat([{"role": "user", "content": "test"}], model=model, providers=providers))

        self.assertEqual(calls, ["route-a", "route-b"])
        self.assertEqual(chunks[0], {"provider": "route-b", "model": "shared-model", "attempts": 2})
        self.assertEqual(chunks[1], "answer")

    def test_auto_never_switches_route_after_streaming_has_started(self) -> None:
        pool = self.make_pool()
        calls: list[str] = []

        def fake_stream_call(provider, model, *_args, **_kwargs):
            calls.append(provider.id)

            def stream():
                yield "partial answer"
                raise OSError("connection reset after first token")

            return stream()

        with patch.object(router._client, "stream_call", side_effect=fake_stream_call):
            stream = pool.stream_chat([{"role": "user", "content": "test"}])
            self.assertEqual(next(stream)["provider"], "route-a")
            self.assertEqual(next(stream), "partial answer")
            with self.assertRaisesRegex(OSError, "after first token"):
                next(stream)

        self.assertEqual(calls, ["route-a"])

    def test_client_cancellation_closes_upstream_stream_without_retry(self) -> None:
        pool = self.make_pool()
        calls: list[str] = []
        closed: list[bool] = []

        def fake_stream_call(provider, model, *_args, **_kwargs):
            calls.append(provider.id)

            def stream():
                try:
                    yield "first token"
                    yield "second token"
                finally:
                    closed.append(True)

            return stream()

        with patch.object(router._client, "stream_call", side_effect=fake_stream_call):
            stream = pool.stream_chat([{"role": "user", "content": "test"}])
            self.assertEqual(next(stream)["provider"], "route-a")
            self.assertEqual(next(stream), "first token")
            stream.close()

        self.assertEqual(calls, ["route-a"])
        self.assertEqual(closed, [True])


if __name__ == "__main__":
    unittest.main(verbosity=2)
