"""Append-only run records and deterministic report paths."""

from __future__ import annotations

import contextlib
import json
import os
import re
import threading
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

try:
    import fcntl  # POSIX advisory file locks
except ImportError:  # pragma: no cover - non-POSIX (Windows)
    fcntl = None

RUN_RECORD_SCHEMA_VERSION = "1.0.0"
RUN_RECORD_KINDS = frozenset({"ask", "second-opinion", "battle", "recipe", "job"})

_SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9_.-]+$")


class RunRecordError(ValueError):
    """Raised when a run record cannot be parsed or written safely."""


@dataclass(frozen=True)
class RunRecord:
    """Versioned local record for reportable freellmpool runs."""

    run_id: str
    kind: str
    created_at: str
    title: str
    prompt: str = ""
    output: str = ""
    status: str = "completed"
    provider_id: str | None = None
    model: str | None = None
    role: str | None = None
    profile: str | None = None
    recipe: str | None = None
    usage: Mapping[str, Any] = field(default_factory=dict)
    items: tuple[dict[str, Any], ...] = ()
    metadata: Mapping[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> RunRecord:
        version = data.get("schema_version")
        if version != RUN_RECORD_SCHEMA_VERSION:
            raise RunRecordError(f"unsupported run record schema version: {version!r}")
        kind = str(data.get("kind", ""))
        if kind not in RUN_RECORD_KINDS:
            raise RunRecordError(f"unsupported run record kind: {kind!r}")
        run_id = str(data.get("run_id", ""))
        if not is_safe_run_id(run_id):
            raise RunRecordError(f"unsafe run id: {run_id!r}")
        items = data.get("items", ())
        if not isinstance(items, list | tuple):
            raise RunRecordError("run record items must be a list")
        clean_items: list[dict[str, Any]] = []
        for item in items:
            if isinstance(item, Mapping):
                clean_items.append(dict(item))
        usage = data.get("usage", {})
        metadata = data.get("metadata", {})
        return cls(
            run_id=run_id,
            kind=kind,
            created_at=str(data.get("created_at", "")),
            title=str(data.get("title", kind)),
            prompt=str(data.get("prompt", "")),
            output=str(data.get("output", "")),
            status=str(data.get("status", "completed")),
            provider_id=_optional_str(data.get("provider_id")),
            model=_optional_str(data.get("model")),
            role=_optional_str(data.get("role")),
            profile=_optional_str(data.get("profile")),
            recipe=_optional_str(data.get("recipe")),
            usage=dict(usage) if isinstance(usage, Mapping) else {},
            items=tuple(clean_items),
            metadata=dict(metadata) if isinstance(metadata, Mapping) else {},
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": RUN_RECORD_SCHEMA_VERSION,
            "run_id": self.run_id,
            "kind": self.kind,
            "created_at": self.created_at,
            "title": self.title,
            "prompt": self.prompt,
            "output": self.output,
            "status": self.status,
            "provider_id": self.provider_id,
            "model": self.model,
            "role": self.role,
            "profile": self.profile,
            "recipe": self.recipe,
            "usage": dict(self.usage),
            "items": [dict(item) for item in self.items],
            "metadata": dict(self.metadata),
        }

    @property
    def label(self) -> str:
        if self.recipe:
            return f"{self.kind}:{self.recipe}"
        if self.provider_id and self.model:
            return f"{self.provider_id}/{self.model}"
        return self.kind


class RunRecordStore:
    """JSONL-backed run-record store.

    Writes are append-only. Reads ignore malformed records and replay valid
    records in file order, so "last" is defined by append order rather than a
    mutable pointer file or report-file mtimes.
    """

    def __init__(
        self,
        path: Path | str | None = None,
        *,
        reports_dir: Path | str | None = None,
        clock: Callable[[], datetime] | None = None,
    ):
        self.path = Path(path).expanduser() if path is not None else default_run_records_path()
        self.reports_dir = (
            Path(reports_dir).expanduser() if reports_dir is not None else default_reports_dir()
        )
        self._clock = clock or (lambda: datetime.now(UTC))
        self._lock = threading.Lock()

    def append_new(
        self,
        *,
        kind: str,
        title: str,
        prompt: str = "",
        output: str = "",
        status: str = "completed",
        provider_id: str | None = None,
        model: str | None = None,
        role: str | None = None,
        profile: str | None = None,
        recipe: str | None = None,
        usage: Mapping[str, Any] | None = None,
        items: Iterable[Mapping[str, Any]] = (),
        metadata: Mapping[str, Any] | None = None,
    ) -> RunRecord:
        if kind not in RUN_RECORD_KINDS:
            raise RunRecordError(f"unsupported run record kind: {kind!r}")
        with self._lock, self._file_lock():
            run_id = self._next_run_id_locked()
            record = RunRecord(
                run_id=run_id,
                kind=kind,
                created_at=self._iso_now(),
                title=title,
                prompt=prompt,
                output=output,
                status=status,
                provider_id=provider_id,
                model=model,
                role=role,
                profile=profile,
                recipe=recipe,
                usage=dict(usage or {}),
                items=tuple(dict(item) for item in items),
                metadata=dict(metadata or {}),
            )
            self._append_locked(record)
            return record

    def append(self, record: RunRecord) -> RunRecord:
        with self._lock, self._file_lock():
            self._append_locked(record)
        return record

    def records(self) -> list[RunRecord]:
        out: list[RunRecord] = []
        for data in _read_jsonl_dicts(self.path):
            with contextlib.suppress(RunRecordError):
                out.append(RunRecord.from_dict(data))
        return out

    def recent(self, limit: int = 20) -> list[RunRecord]:
        records = self.records()
        if limit <= 0:
            return records
        return records[-limit:]

    def last(self) -> RunRecord | None:
        records = self.records()
        return records[-1] if records else None

    def get(self, run_id: str) -> RunRecord | None:
        for record in self.records():
            if record.run_id == run_id:
                return record
        return None

    def report_path(self, run_id: str, fmt: str) -> Path:
        return report_path(run_id, fmt, reports_dir=self.reports_dir)

    def _next_run_id_locked(self) -> str:
        seq = 1
        try:
            with self.path.open("r", encoding="utf-8") as fh:
                seq += sum(1 for line in fh if line.strip())
        except FileNotFoundError:
            pass
        stamp = self._clock().astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
        return f"{stamp}-{seq:04d}"

    def _append_locked(self, record: RunRecord) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as fh:
            json.dump(record.to_dict(), fh, sort_keys=True)
            fh.write("\n")

    @contextlib.contextmanager
    def _file_lock(self):
        if fcntl is None:
            yield
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock_path = self.path.with_suffix(self.path.suffix + ".lock")
        try:
            fh = open(lock_path, "w")
        except OSError:
            yield
            return
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            yield
        finally:
            with contextlib.suppress(OSError):
                fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
            fh.close()

    def _iso_now(self) -> str:
        return self._clock().astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def default_data_dir() -> Path:
    override = os.environ.get("FREELLMPOOL_DATA_DIR")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".config" / "freellmpool"


def default_run_records_path() -> Path:
    override = os.environ.get("FREELLMPOOL_RUN_RECORDS_PATH")
    if override:
        return Path(override).expanduser()
    return default_data_dir() / "run_records.jsonl"


def default_reports_dir() -> Path:
    override = os.environ.get("FREELLMPOOL_REPORT_DIR") or os.environ.get(
        "FREELLMPOOL_REPORTS_DIR"
    )
    if override:
        return Path(override).expanduser()
    return default_data_dir() / "reports"


def report_path(run_id: str, fmt: str, *, reports_dir: Path | str | None = None) -> Path:
    if not is_safe_run_id(run_id):
        raise RunRecordError(f"unsafe run id: {run_id!r}")
    suffix = _suffix_for_format(fmt)
    root = Path(reports_dir).expanduser() if reports_dir is not None else default_reports_dir()
    return root / f"{run_id}.{suffix}"


def is_safe_run_id(run_id: str) -> bool:
    return bool(run_id and _SAFE_RUN_ID.fullmatch(run_id) and "/" not in run_id and "\\" not in run_id)


def _suffix_for_format(fmt: str) -> str:
    normalized = fmt.lower().lstrip(".")
    if normalized in {"md", "markdown"}:
        return "md"
    if normalized in {"html", "htm"}:
        return "html"
    raise RunRecordError(f"unsupported report format: {fmt!r}")


def _read_jsonl_dicts(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(data, dict):
                    rows.append(data)
    except OSError:
        return []
    return rows


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text else None
