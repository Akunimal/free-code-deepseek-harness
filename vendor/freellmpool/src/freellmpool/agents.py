"""Compatibility alias for `freellmpool code <agent>`.

The profile registry in :mod:`freellmpool.profiles` is now the source of truth.
This module keeps the legacy ``AGENTS``, ``render()``, and ``list_agents()``
surface intact for existing users and tests.
"""

from __future__ import annotations

from .profiles import PROFILES, Profile, get_profile, render_profile_quickstart


def _legacy_steps(profile: Profile) -> list[str]:
    steps = ["freellmpool proxy --port 8080"]
    if "shell" in profile.config_snippets:
        steps.extend(profile.config_snippets["shell"].splitlines())
        return steps
    first_key = next(iter(profile.config_snippets))
    steps.append(f"{first_key}:")
    steps.extend(profile.config_snippets[first_key].splitlines())
    return steps


AGENTS: dict[str, dict] = {
    name: {
        "label": profile.label,
        "steps": _legacy_steps(profile),
        "note": profile.notes,
    }
    for name, profile in PROFILES.items()
}


def render(agent: str) -> str | None:
    profile = get_profile(agent)
    return render_profile_quickstart(profile) if profile is not None else None


def list_agents() -> str:
    rows = [f"  {name:<12} {rec['label']}" for name, rec in AGENTS.items()]
    return "Usage: freellmpool code <agent>\n\nSupported coding agents:\n" + "\n".join(rows)
