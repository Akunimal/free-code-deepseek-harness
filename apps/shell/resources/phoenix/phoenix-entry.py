"""FreeCode's isolated, loopback-only entry point for the pinned FreeLLMpool."""

from __future__ import annotations

import argparse
import os
import signal
import sys
from pathlib import Path


PHOENIX_PROVIDERS = frozenset({"pollinations", "ovh", "kilo", "llm7"})
OS_ENVIRONMENT = frozenset(
    {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC"}
)


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="freecode-freellmpool")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    return parser.parse_args(argv)


def _isolated_environment(state_dir: Path) -> tuple[dict[str, str], str]:
    inherited = os.environ.copy()
    api_key = inherited.get("FREECODE_PHOENIX_PROXY_KEY", "")
    if len(api_key) < 32:
        raise ValueError("FREECODE_PHOENIX_PROXY_KEY must be a random per-instance secret")

    state_dir.mkdir(parents=True, exist_ok=True)
    config_path = state_dir / "config.toml"
    if not config_path.exists():
        config_path.write_text("", encoding="utf-8")

    # Do not pass personal provider credentials, custom user catalogs, proxy
    # settings, or a developer's FreeLLMpool configuration into the pool.
    env = {key: inherited[key] for key in OS_ENVIRONMENT if key in inherited}
    env.update(
        {
            "HOME": str(state_dir),
            "USERPROFILE": str(state_dir),
            "APPDATA": str(state_dir / "roaming"),
            "LOCALAPPDATA": str(state_dir / "local"),
            "FREELLMPOOL_CONFIG_FILE": str(config_path),
            "FREELLMPOOL_QUOTA_PATH": str(state_dir / "quota.json"),
            "FREELLMPOOL_STATS_PATH": str(state_dir / "stats.json"),
            "FREELLMPOOL_CACHE_PATH": str(state_dir / "cache.db"),
            "FREELLMPOOL_PROXY_KEY": api_key,
        }
    )
    os.environ.clear()
    os.environ.update(env)
    return env, api_key


def _catalog_path() -> Path:
    bundle = getattr(sys, "_MEIPASS", None)
    base = Path(bundle) if isinstance(bundle, str) else Path(__file__).resolve().parent
    return base / "phoenix-providers.toml"


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    if args.host != "127.0.0.1" or not 1 <= args.port <= 65535:
        raise ValueError("Phoenix may only bind to 127.0.0.1 on an assigned TCP port")

    env, api_key = _isolated_environment(args.state_dir.resolve())

    # Import after validating arguments and creating the app-private profile.
    from freellmpool.config import configured_providers, load_catalog, settings
    from freellmpool.mode import default_routing_for_mode
    from freellmpool.proxy import serve
    from freellmpool.router import Pool

    catalog = load_catalog(path=_catalog_path())
    unexpected = {provider.id for provider in catalog} - PHOENIX_PROVIDERS
    if unexpected:
        raise ValueError(f"Phoenix catalog contains non-approved providers: {sorted(unexpected)}")
    providers = configured_providers(catalog, env)
    if not providers:
        raise RuntimeError("Phoenix has no configured keyless provider routes")

    pool = Pool(
        providers,
        env=env,
        routing=default_routing_for_mode(env, settings(env)),
    )
    httpd = serve(pool, host=args.host, port=args.port, api_key=api_key)
    print(
        f"Phoenix FreeLLMpool {httpd.server_address[0]}:{httpd.server_address[1]} "
        f"providers={len(providers)} models={sum(len(p.models) for p in providers)}",
        file=sys.stderr,
        flush=True,
    )

    def stop(_signum: int, _frame: object) -> None:
        # serve_forever() runs on this thread; BaseServer.shutdown() called
        # from that same thread waits forever. Raising exits the loop and lets
        # the finally block close the socket and worker pool cleanly.
        raise SystemExit(0)

    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, stop)
    try:
        httpd.serve_forever(poll_interval=0.25)
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
