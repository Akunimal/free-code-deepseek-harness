from __future__ import annotations

from dataclasses import dataclass

from .benchmark import benchmark
from .router import Pool


@dataclass(frozen=True)
class HealthRow:
    target: str
    status: str
    latency_ms: float | None
    note: str

    @property
    def ok(self) -> bool:
        return self.status == "ok"


def run_healthcheck(
    pool: Pool, *, model: str | None = None, providers=None, timeout: float = 20.0
) -> list[HealthRow]:
    rows = benchmark(pool, model=model, providers=providers, timeout=timeout, max_tokens=8)
    out: list[HealthRow] = []
    for row in rows:
        if row.ok:
            note = f"{row.tokens} tok" if row.tokens else "responded"
            out.append(HealthRow(row.target, "ok", row.latency_ms, note))
        else:
            note = _short_note(row.error or "failed")
            status = "rate_limited" if "429" in note else "fail"
            out.append(HealthRow(row.target, status, None, note))
    return out


def render_health_table(rows: list[HealthRow]) -> str:
    if not rows:
        return "No configured providers to check."
    width = max(len(row.target) for row in rows)
    lines = [f"  {'provider/model':<{width}}  {'status':<12}  {'latency':>9}  note"]
    for row in rows:
        latency = f"{row.latency_ms:,.0f} ms" if row.latency_ms is not None else "-"
        lines.append(
            f"  {row.target:<{width}}  {row.status:<12}  {latency:>9}  {_short_note(row.note)}"
        )
    ok = sum(1 for row in rows if row.ok)
    lines.append(f"\n  {ok}/{len(rows)} providers ok")
    return "\n".join(lines)


def _short_note(value: str) -> str:
    lines = (value or "").splitlines()
    return lines[0][:80] if lines else ""
