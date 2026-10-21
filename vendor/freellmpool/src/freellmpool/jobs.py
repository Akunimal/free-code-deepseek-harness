"""Local foreground job queue for slow, quota-aware freellmpool work.

The queue is an append-only JSONL log under the user config dir. Every
state transition is a new event, not a mutation of an earlier record — the
queue is replayed from scratch on read so the queue survives process
restart. Cancellation is represented by a dedicated ``cancelled`` event so
it composes with restart-safe replay.

The first slice runs jobs synchronously in the foreground (no daemon); see
``freellmpool jobs run`` for the entry point.
"""

from __future__ import annotations

import contextlib
import json
import os
import re
import threading
import uuid
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

try:
    import fcntl  # POSIX advisory file locks
except ImportError:  # pragma: no cover - non-POSIX (Windows)
    fcntl = None  # type: ignore[assignment]  # noqa: N806

from .models import Reply
from .reports import write_report  # re-exported at module level for tests/CLI  # noqa: E402

JOB_SCHEMA_VERSION = "1.0.0"
JOB_KIND_RECIPE = "recipe"
JOB_KIND_ASK = "ask"

JOB_EVENT_QUEUED = "queued"
JOB_EVENT_STARTED = "started"
JOB_EVENT_COMPLETED = "completed"
JOB_EVENT_FAILED = "failed"
JOB_EVENT_CANCELLED = "cancelled"

# WU-009 contract: the set of event types this implementation understands
# and is willing to materialize. Any other event type seen in the JSONL
# must be rejected by ``JobEvent.from_dict`` and skipped during replay
# so a future/unknown event appended by a newer writer can never mutate
# the materialized view of an already-terminal job (e.g. resurrecting a
# ``completed``/``cancelled`` job by emitting a spurious
# ``status="running"`` event after the fact).
JOB_KNOWN_EVENT_TYPES = frozenset(
    {
        JOB_EVENT_QUEUED,
        JOB_EVENT_STARTED,
        JOB_EVENT_COMPLETED,
        JOB_EVENT_FAILED,
        JOB_EVENT_CANCELLED,
    }
)

JOB_STATUS_PENDING = "pending"
JOB_STATUS_RUNNING = "running"
JOB_STATUS_COMPLETED = "completed"
JOB_STATUS_FAILED = "failed"
JOB_STATUS_CANCELLED = "cancelled"

JOB_TERMINAL_STATUSES = frozenset(
    {JOB_STATUS_COMPLETED, JOB_STATUS_FAILED, JOB_STATUS_CANCELLED}
)

_JOB_ID = re.compile(r"^[A-Za-z0-9_-]+$")


class JobError(ValueError):
    """Raised when a job record cannot be parsed or written safely."""


class UnknownJobError(JobError):
    def __init__(self, job_id: str):
        super().__init__(f"unknown job id: {job_id}")
        self.job_id = job_id


class DuplicateJobError(JobError):
    pass


@dataclass(frozen=True)
class JobEvent:
    """One append-only event in the job queue log."""

    seq: int
    event: str
    job_id: str
    created_at: str
    status: str
    spec: Mapping[str, Any] = field(default_factory=dict)
    attempt: int = 0
    attempt_metadata: Mapping[str, Any] = field(default_factory=dict)
    error: str | None = None
    run_id: str | None = None
    output: str | None = None
    provider_id: str | None = None
    model: str | None = None

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> JobEvent:
        schema = data.get("schema_version")
        if schema != JOB_SCHEMA_VERSION:
            raise JobError(f"unsupported job schema version: {schema!r}")
        seq = data.get("seq")
        event = data.get("event")
        # WU-009 contract: events must carry a stable top-level ``id`` (==
        # ``job_id``) so future readers can address an event without having
        # to know about the legacy ``job_id`` alias. Accept either form on
        # replay so older logs keep working.
        job_id = data.get("job_id")
        if job_id is None:
            job_id = data.get("id")
        created_at = data.get("created_at")
        status = data.get("status")
        if not isinstance(seq, int):
            raise JobError("job event missing integer seq")
        if not isinstance(event, str) or not event:
            raise JobError("job event missing event type")
        # Reject unknown/future event types so they can never mutate the
        # materialized view of an already-terminal job. ``_read_jsonl_events``
        # catches ``JobError`` and skips the offending line, so an unknown
        # future event appended later in the JSONL is dropped on replay
        # instead of being applied as a fresh status transition.
        if event not in JOB_KNOWN_EVENT_TYPES:
            raise JobError(f"unknown job event type: {event!r}")
        if not isinstance(job_id, str) or not _JOB_ID.fullmatch(job_id):
            raise JobError(f"unsafe job id: {job_id!r}")
        if not isinstance(created_at, str) or not created_at:
            raise JobError("job event missing created_at")
        if status is not None and not isinstance(status, str):
            raise JobError("job event status must be a string")
        spec = data.get("spec", {})
        if not isinstance(spec, Mapping):
            raise JobError("job event spec must be an object")
        attempt = data.get("attempt", 0)
        if not isinstance(attempt, int):
            raise JobError("job event attempt must be an integer")
        attempt_metadata = data.get("attempt_metadata", {})
        if not isinstance(attempt_metadata, Mapping):
            raise JobError("job event attempt_metadata must be an object")
        # When only the integer ``attempt`` was stored (older writers or
        # truncated logs), synthesise a minimal ``attempt_metadata`` so the
        # replayed materialised job still exposes a stable expansion point.
        normalised_metadata = dict(attempt_metadata)
        if not normalised_metadata:
            normalised_metadata = {"number": int(attempt)}
        elif "number" not in normalised_metadata:
            normalised_metadata = {**normalised_metadata, "number": int(attempt)}
        return cls(
            seq=seq,
            event=event,
            job_id=job_id,
            created_at=created_at,
            status=str(status) if status is not None else "",
            spec=dict(spec),
            attempt=attempt,
            attempt_metadata=normalised_metadata,
            error=_optional_str(data.get("error")),
            run_id=_optional_str(data.get("run_id")),
            output=_optional_str(data.get("output")),
            provider_id=_optional_str(data.get("provider_id")),
            model=_optional_str(data.get("model")),
        )

    def to_dict(self) -> dict[str, Any]:
        # WU-009 contract: emit a stable top-level ``id`` alias equal to
        # ``job_id`` while still writing ``job_id`` for internal
        # compatibility with the rest of the codepath.
        attempt_metadata = dict(self.attempt_metadata) if self.attempt_metadata else {}
        # Keep ``attempt_metadata.number`` in sync with the integer
        # ``attempt`` so the two never drift on append.
        if attempt_metadata.get("number") != self.attempt:
            attempt_metadata = {**attempt_metadata, "number": int(self.attempt)}
        payload: dict[str, Any] = {
            "schema_version": JOB_SCHEMA_VERSION,
            "seq": self.seq,
            "event": self.event,
            "id": self.job_id,
            "job_id": self.job_id,
            "created_at": self.created_at,
            "status": self.status,
            "spec": dict(self.spec),
            "attempt": self.attempt,
            "attempt_metadata": attempt_metadata,
        }
        if self.error is not None:
            payload["error"] = self.error
        if self.run_id is not None:
            payload["run_id"] = self.run_id
        if self.output is not None:
            payload["output"] = self.output
        if self.provider_id is not None:
            payload["provider_id"] = self.provider_id
        if self.model is not None:
            payload["model"] = self.model
        return payload


@dataclass(frozen=True)
class Job:
    """Materialized view of a job built by replaying JSONL events."""

    job_id: str
    kind: str
    created_at: str
    spec: Mapping[str, Any]
    status: str
    attempt: int
    events: tuple[JobEvent, ...]
    attempt_metadata: Mapping[str, Any] = field(default_factory=dict)
    last_error: str | None = None
    run_id: str | None = None
    output: str | None = None
    provider_id: str | None = None
    model: str | None = None

    @property
    def is_terminal(self) -> bool:
        return self.status in JOB_TERMINAL_STATUSES

    @property
    def label(self) -> str:
        if self.kind == JOB_KIND_RECIPE:
            recipe = self.spec.get("recipe") or self.spec.get("name") or "recipe"
            return f"recipe:{recipe}"
        if self.kind == JOB_KIND_ASK:
            role = self.spec.get("role")
            return f"ask:{role}" if role else "ask"
        return self.kind

    @property
    def title(self) -> str:
        if self.kind == JOB_KIND_RECIPE:
            recipe = self.spec.get("recipe") or self.spec.get("name") or "recipe"
            return f"freellmpool job recipe {recipe}"
        return f"freellmpool job {self.kind}"

    def summary(self) -> str:
        return f"{self.job_id} {self.status:<10} {self.label}"


@dataclass(frozen=True)
class JobSpec:
    """Caller-facing spec describing a queued job.

    ``kind`` is ``"recipe"`` (the common case) or ``"ask"`` for plain
    prompt/role jobs. ``dedupe_key`` is optional; when provided and not
    empty, ``JobStore.add`` rejects re-submissions of the same key.
    """

    kind: str
    payload: Mapping[str, Any]
    dedupe_key: str | None = None


class JobStore:
    """Append-only JSONL-backed job queue."""

    def __init__(
        self,
        path: Path | str | None = None,
        *,
        clock: Callable[[], datetime] | None = None,
        id_factory: Callable[[], str] | None = None,
    ):
        self.path = (
            Path(path).expanduser() if path is not None else default_jobs_path()
        )
        self._clock = clock or (lambda: datetime.now(UTC))
        self._id_factory = id_factory or _default_job_id
        self._lock = threading.Lock()

    # ---- public API -------------------------------------------------

    def add(self, spec: JobSpec) -> Job:
        """Append a new ``queued`` event and return the materialized job."""
        kind = spec.kind
        if kind not in {JOB_KIND_RECIPE, JOB_KIND_ASK}:
            raise JobError(f"unsupported job kind: {kind!r}")
        payload = dict(spec.payload)
        dedupe_key = spec.dedupe_key
        with self._lock, self._file_lock():
            existing = self._replay_locked()
            if dedupe_key:
                for job in existing.values():
                    if job.spec.get("dedupe_key") == dedupe_key and not job.is_terminal:
                        raise DuplicateJobError(
                            f"job with dedupe_key {dedupe_key!r} is already queued or running"
                        )
                    if (
                        job.spec.get("dedupe_key") == dedupe_key
                        and job.status == JOB_STATUS_PENDING
                    ):
                        raise DuplicateJobError(
                            f"job with dedupe_key {dedupe_key!r} is already queued"
                        )
            seq = self._next_seq_locked()
            job_id = self._id_factory()
            created_at = self._iso_now()
            stored_spec = dict(payload)
            if dedupe_key:
                stored_spec["dedupe_key"] = dedupe_key
            event = JobEvent(
                seq=seq,
                event=JOB_EVENT_QUEUED,
                job_id=job_id,
                created_at=created_at,
                status=JOB_STATUS_PENDING,
                spec=stored_spec,
                attempt=0,
                attempt_metadata={"number": 0},
            )
            self._append_locked(event)
            # Replay after the append so the materialized view reflects the
            # new ``queued`` event we just wrote.
            replay = self._replay_locked()
            return self._materialize(event.job_id, replay)

    def cancel(self, job_id: str) -> Job:
        """Append a ``cancelled`` tombstone event. Idempotent."""
        with self._lock, self._file_lock():
            replay = self._replay_locked()
            job = replay.get(job_id)
            if job is None:
                raise UnknownJobError(job_id)
            if job.is_terminal:
                return job
            seq = self._next_seq_locked()
            event = JobEvent(
                seq=seq,
                event=JOB_EVENT_CANCELLED,
                job_id=job_id,
                created_at=self._iso_now(),
                status=JOB_STATUS_CANCELLED,
                spec=dict(job.spec),
                attempt=job.attempt,
                attempt_metadata={"number": int(job.attempt)},
            )
            self._append_locked(event)
            replay = self._replay_locked()
            materialized = replay.get(job_id)
            assert materialized is not None
            return materialized

    def events(self) -> list[JobEvent]:
        with self._lock:
            return list(self._events_locked())

    def jobs(self) -> list[Job]:
        """Return all jobs in append (FIFO) order.

        Job ids are random UUIDs by default, so a lexicographic sort over
        ``job_id`` would shuffle the queue. We sort by the seq of each
        job's first event (a monotonically increasing counter written at
        append time) and use ``created_at`` as a stable tiebreaker so the
        observed order matches the order callers added jobs in.
        """
        with self._lock:
            return self._jobs_locked()

    def pending(self) -> list[Job]:
        """Return jobs that are still retryable.

        A job is retryable when its last event is *not* a terminal event
        (i.e. it is still ``pending`` *or* stranded in ``started``/
        ``running`` because a previous ``jobs run`` crashed before
        appending ``completed``/``failed``/``cancelled``). The runner
        distinguishes the two cases internally: pending jobs start fresh
        on attempt 1, while stranded jobs resume with attempt+1.
        """
        return [job for job in self.jobs() if not job.is_terminal]

    def get(self, job_id: str) -> Job | None:
        return self.jobs_map().get(job_id)

    def jobs_map(self) -> dict[str, Job]:
        with self._lock:
            return dict(self._replay_locked())

    # ---- internal ---------------------------------------------------

    def _append_event_locked(
        self,
        *,
        job_id: str,
        event_type: str,
        status: str,
        spec: Mapping[str, Any],
        attempt: int,
        attempt_metadata: Mapping[str, Any] | None = None,
        **fields: Any,
    ) -> JobEvent:
        with self._file_lock():
            seq = self._next_seq_locked()
            # Default attempt_metadata always carries ``number`` so future
            # readers have a stable expansion point even when the caller
            # did not provide richer metadata.
            if attempt_metadata is None:
                attempt_metadata = {"number": int(attempt)}
            else:
                attempt_metadata = dict(attempt_metadata)
                attempt_metadata.setdefault("number", int(attempt))
            event = JobEvent(
                seq=seq,
                event=event_type,
                job_id=job_id,
                created_at=self._iso_now(),
                status=status,
                spec=dict(spec),
                attempt=attempt,
                attempt_metadata=attempt_metadata,
                **fields,
            )
            self._append_locked(event)
            return event

    def _replay_locked(self) -> dict[str, Job]:
        replay: dict[str, Job] = {}
        # Preserve the original append order alongside the materialized view
        # so ``_jobs_locked`` can return jobs in FIFO order without having
        # to re-scan the log.
        for event in self._events_locked():
            replay[event.job_id] = _materialize_event(event, replay.get(event.job_id))
        return replay

    def _jobs_locked(self) -> list[Job]:
        """Materialize and sort jobs in append order (FIFO).

        We sort by the seq of each job's *first* event because seq is
        monotonically increasing across the log and is robust to clock
        jitter, fractional seconds, and the random job_id UUIDs.
        ``created_at`` is kept as a tiebreaker so two jobs whose queued
        events somehow share a seq still land in a stable order.
        """
        replay = self._replay_locked()
        ordered = sorted(
            replay.values(),
            key=lambda job: (_first_event_seq(job), job.created_at, job.job_id),
        )
        return ordered

    def _materialize(self, job_id: str, replay: Mapping[str, Job]) -> Job:
        materialized = replay.get(job_id)
        if materialized is None:
            raise UnknownJobError(job_id)
        return materialized

    def _events_locked(self) -> Iterable[JobEvent]:
        return _read_jsonl_events(self.path)

    def _next_seq_locked(self) -> int:
        try:
            with self.path.open("r", encoding="utf-8") as fh:
                last_seq = 0
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(data, Mapping):
                        seq = data.get("seq")
                        if isinstance(seq, int):
                            last_seq = max(last_seq, seq)
                return last_seq + 1
        except FileNotFoundError:
            return 1

    def _append_locked(self, event: JobEvent) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as fh:
            # WU-009 append-safety: if the file already ends with a
            # malformed partial line that has no trailing newline (e.g. a
            # truncated write from a previous process), emitting the next
            # JSON object immediately after that fragment would create one
            # combined line that ``json.loads`` rejects as a single unit.
            # The replay path would then drop the combined malformed line
            # *and* the newly appended event, silently losing the new
            # event. Insert a newline before the next event so the new
            # event always starts on its own JSONL line. The malformed
            # fragment is left untouched (append-only) and continues to be
            # skipped on replay.
            if self.path.exists():
                try:
                    with self.path.open("rb") as tail:
                        tail.seek(-1, os.SEEK_END)
                        last_byte = tail.read(1)
                except OSError:
                    last_byte = b""
                if last_byte and last_byte != b"\n":
                    fh.write("\n")
            json.dump(event.to_dict(), fh, sort_keys=True)
            fh.write("\n")

    @contextlib.contextmanager
    def _file_lock(self) -> Any:
        if fcntl is None:
            yield
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock_path = self.path.with_suffix(self.path.suffix + ".lock")
        fh: Any
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


# ---- runner ---------------------------------------------------------


@dataclass(frozen=True)
class RunOutcome:
    """Result of one foreground ``jobs run`` invocation."""

    completed: tuple[Job, ...]
    failed: tuple[Job, ...]
    cancelled: tuple[Job, ...]
    pending: tuple[Job, ...]
    consecutive_failures: int
    halted_by_max_failures: bool

    @property
    def total_processed(self) -> int:
        return len(self.completed) + len(self.failed)

    @property
    def had_failures(self) -> bool:
        return bool(self.failed)


def run_pending_jobs(
    store: JobStore,
    *,
    pool_factory: Callable[[], Any] | None = None,
    record_store: Any | None = None,
    recipes_module: Any | None = None,
    pool_module: Any | None = None,
    dry_run: bool = False,
    max_failures: int | None = None,
    limit: int | None = None,
) -> RunOutcome:
    """Process pending queued jobs foreground-style.

    The runner is intentionally minimal: it appends a ``started`` event,
    invokes the appropriate execution path, then appends either a
    ``completed`` or ``failed`` event. Cancellation that arrived between
    replay and dispatch is honoured (the runner skips the job rather than
    running it). Reports are written for completed jobs via the WU-008
    ``RunRecord``/``write_report`` helpers.

    Stranded ``started`` events from a crashed previous run are picked
    up too: the materialized status of such a job is ``running`` (not
    terminal), so the loop re-runs it and appends a fresh ``started``
    event with an incremented attempt before doing the work. Old
    ``started`` records are never mutated — only new events are
    appended.
    """
    if max_failures is not None and max_failures < 1:
        raise JobError("--max-failures must be >= 1")
    if limit is not None and limit < 1:
        raise JobError("--limit must be >= 1")
    pool_factory = pool_factory or _default_pool_factory(pool_module)
    recipes_module = recipes_module or _import_recipes()
    record_store = record_store if record_store is not None else _default_record_store()

    completed: list[Job] = []
    failed: list[Job] = []
    cancelled: list[Job] = []
    consecutive_failures = 0
    halted_by_max_failures = False
    pending_snapshot = store.pending()

    for index, job in enumerate(pending_snapshot):
        if limit is not None and len(completed) + len(failed) >= limit:
            break
        if max_failures is not None and consecutive_failures >= max_failures:
            halted_by_max_failures = True
            break
        if dry_run:
            # Dry-run never mutates the queue.
            continue
        refreshed = store.get(job.job_id)
        if refreshed is None:
            continue
        # Honour cancellation that arrived between snapshot and dispatch
        # (the materialized view only flips to ``cancelled`` after a
        # ``cancelled`` tombstone event is appended).
        if refreshed.is_terminal and refreshed.status != JOB_STATUS_CANCELLED:
            # Another runner already finished the job (e.g. terminal
            # ``completed``/``failed`` appeared between snapshot and
            # dispatch). Skip it without recording it as cancelled.
            continue
        if refreshed.status == JOB_STATUS_CANCELLED:
            cancelled.append(refreshed)
            continue
        outcome = _execute_job(
            refreshed,
            store=store,
            pool_factory=pool_factory,
            record_store=record_store,
            recipes_module=recipes_module,
        )
        if outcome is None:
            continue
        final = store.get(job.job_id) or refreshed
        if outcome == JOB_STATUS_COMPLETED:
            completed.append(final)
            consecutive_failures = 0
        elif outcome == JOB_STATUS_FAILED:
            failed.append(final)
            consecutive_failures += 1
            if max_failures is not None and consecutive_failures >= max_failures:
                halted_by_max_failures = True
                break
        else:  # cancelled before/during execution
            cancelled.append(final)
        _ = index  # silence unused warning; index reserved for future tracing

    pending_after = tuple(
        job
        for job in store.jobs()
        if not job.is_terminal
    )

    return RunOutcome(
        completed=tuple(completed),
        failed=tuple(failed),
        cancelled=tuple(cancelled),
        pending=pending_after,
        consecutive_failures=consecutive_failures,
        halted_by_max_failures=halted_by_max_failures,
    )


def _execute_job(
    job: Job,
    *,
    store: JobStore,
    pool_factory: Callable[[], Any],
    record_store: Any,
    recipes_module: Any,
) -> str | None:
    """Run a single job and append terminal events. Returns final status."""
    attempt = job.attempt + 1
    # Stranded jobs (last event is a non-terminal ``started`` from a
    # crashed previous run) get a resumed marker in attempt_metadata so
    # operators can grep the JSONL for ``"resumed": true`` when triaging
    # crashes.
    is_resumed = bool(job.events) and job.events[-1].event == JOB_EVENT_STARTED
    attempt_metadata: dict[str, Any] = {
        "number": int(attempt),
        "resumed": is_resumed,
    }
    if is_resumed:
        attempt_metadata["previous_event_seq"] = job.events[-1].seq
    store._append_event_locked(
        job_id=job.job_id,
        event_type=JOB_EVENT_STARTED,
        status=JOB_STATUS_RUNNING,
        spec=job.spec,
        attempt=attempt,
        attempt_metadata=attempt_metadata,
    )
    # Re-check terminal status right before execution starts; honour any
    # terminal event that arrived while we were waiting for the lock above.
    # This generalizes the cancellation recheck to completed/failed races too.
    refreshed = store.get(job.job_id)
    if refreshed is None:
        return JOB_STATUS_CANCELLED
    if refreshed.is_terminal:
        return refreshed.status
    try:
        if job.kind == JOB_KIND_RECIPE:
            result = _execute_recipe_job(
                job,
                pool_factory=pool_factory,
                recipes_module=recipes_module,
            )
            # Re-check terminal status after provider/recipe execution before
            # writing any terminal ``completed`` side effects. If a terminal
            # event arrived during execution (race with another runner), return
            # its status immediately without appending a second terminal event.
            refreshed_after = store.get(job.job_id)
            if refreshed_after is not None and refreshed_after.is_terminal:
                return refreshed_after.status
            record = recipes_module.write_recipe_record(result, store=record_store)
            try:
                write_report(record, "md", store=record_store)
            except Exception:  # noqa: BLE001 - report is best-effort
                pass
            store._append_event_locked(
                job_id=job.job_id,
                event_type=JOB_EVENT_COMPLETED,
                status=JOB_STATUS_COMPLETED,
                spec=job.spec,
                attempt=attempt,
                attempt_metadata=attempt_metadata,
                run_id=record.run_id,
                output=result.output,
                provider_id=result.provider_id,
                model=result.model,
            )
            return JOB_STATUS_COMPLETED
        if job.kind == JOB_KIND_ASK:
            reply = _execute_ask_job(job, pool_factory=pool_factory)
            # Honour terminal status that arrived during ``ask`` execution.
            refreshed_after = store.get(job.job_id)
            if refreshed_after is not None and refreshed_after.is_terminal:
                return refreshed_after.status
            store._append_event_locked(
                job_id=job.job_id,
                event_type=JOB_EVENT_COMPLETED,
                status=JOB_STATUS_COMPLETED,
                spec=job.spec,
                attempt=attempt,
                attempt_metadata=attempt_metadata,
                output=reply.text,
                provider_id=reply.provider_id,
                model=reply.model,
            )
            return JOB_STATUS_COMPLETED
    except Exception as exc:  # noqa: BLE001 - record failure, keep going
        # Honour terminal status that arrived before the provider raised. Do
        # not append a ``failed`` event for a job that is already terminal.
        refreshed_after = store.get(job.job_id)
        if refreshed_after is not None and refreshed_after.is_terminal:
            return refreshed_after.status
        store._append_event_locked(
            job_id=job.job_id,
            event_type=JOB_EVENT_FAILED,
            status=JOB_STATUS_FAILED,
            spec=job.spec,
            attempt=attempt,
            attempt_metadata=attempt_metadata,
            error=_safe_error(exc),
        )
        return JOB_STATUS_FAILED
    return None  # pragma: no cover - defensive


def _execute_recipe_job(
    job: Job, *, pool_factory: Callable[[], Any], recipes_module: Any
) -> Any:
    recipe = recipes_module.get_recipe(job.spec["recipe"])
    input_text, path = recipes_module.collect_recipe_input(
        recipe,
        prompt=job.spec.get("prompt", "") or "",
        stdin="",
        input_file=job.spec.get("input"),
        path=job.spec.get("path"),
    )
    validation_output = job.spec.get("validation_output")
    validation_output_file = job.spec.get("validation_output_file")
    if validation_output_file:
        validation_output = Path(validation_output_file).read_text(
            encoding="utf-8"
        )
    pool = pool_factory()
    return recipes_module.run_recipe(
        pool,
        recipe,
        input_text=input_text,
        path=path,
        validation_output=validation_output,
        opinions=int(job.spec.get("opinions", 3)),
        synthesize=bool(job.spec.get("synthesize", False)),
        max_tokens=job.spec.get("max_tokens"),
        timeout=float(job.spec.get("timeout", 90.0)),
    )


def _execute_ask_job(job: Job, *, pool_factory: Callable[[], Any]) -> Reply:
    pool = pool_factory()
    role_name = job.spec.get("role")
    system = job.spec.get("system")
    if role_name and system is None:
        from .roles import get_role

        role = get_role(role_name)
        if role is not None:
            system = role.system_prefix
    reply = pool.ask(
        job.spec.get("prompt", "") or "",
        system=system,
        max_tokens=job.spec.get("max_tokens") or 1024,
        temperature=job.spec.get("temperature", 0.0),
        timeout=float(job.spec.get("timeout", 90.0)),
    )
    return reply


def _safe_error(exc: BaseException) -> str:
    name = type(exc).__name__
    message = str(exc).strip()
    final: str = f"{name}: {message}" if message else name
    return final


# ---- path defaults --------------------------------------------------


def default_jobs_path() -> Path:
    override = os.environ.get("FREELLMPOOL_JOBS_PATH")
    if override:
        return Path(override).expanduser()
    from .artifacts import default_data_dir

    return default_data_dir() / "jobs.jsonl"


def _default_job_id() -> str:
    return uuid.uuid4().hex


def _import_recipes() -> Any:
    from . import recipes as recipes_module

    return recipes_module


def _default_pool_factory(pool_module: Any | None) -> Callable[[], Any]:
    if pool_module is not None:

        def _make_factory() -> Callable[[], Any]:
            def _factory() -> Any:
                return pool_module.Pool.from_default_config()

            return _factory

        return _make_factory()
    from .router import Pool

    def _factory() -> Any:
        return Pool.from_default_config()

    return _factory


def _default_record_store() -> Any:
    from .artifacts import RunRecordStore

    return RunRecordStore()


# ---- helpers --------------------------------------------------------


def _first_event_seq(job: Job) -> int:
    """Return the seq of the job's earliest recorded event.

    Used as the FIFO sort key in ``_jobs_locked``. A job whose log starts
    with seq=42 will always sort before a job whose log starts with seq=43
    even when its random UUID id would have placed it elsewhere in a
    lexicographic sort.
    """
    if not job.events:
        return 0
    return min(event.seq for event in job.events)


def _is_retryable(job: Job) -> bool:
    """A job is retryable when it is not yet terminal.

    This covers both newly queued (pending) jobs and jobs whose last
    event is a stranded ``started``/``running`` event from a crashed
    previous run. The runner will append a fresh ``started`` event with
    an incremented attempt before doing the actual work.
    """
    return not job.is_terminal


def _stranded_jobs(jobs: Iterable[Job]) -> list[Job]:
    """Return jobs whose last event is a non-terminal ``started``/``running``.

    This is the crash signature: the JSONL ends with ``started`` (or any
    other non-terminal running-state event) and never reached
    ``completed``, ``failed``, or ``cancelled``. The runner re-runs these
    by appending a new ``started`` event with an incremented attempt
    before doing the real work.
    """
    stranded: list[Job] = []
    for job in jobs:
        if not job.events:
            continue
        last = job.events[-1]
        if last.event in {JOB_EVENT_STARTED} and not job.is_terminal:
            stranded.append(job)
    return stranded


def _materialize_event(event: JobEvent, prior: Job | None) -> Job:
    """Reduce an event onto the materialized job view."""
    # Terminal events (completed, failed, cancelled) freeze the materialized
    # view: once a job has reached a terminal status, later known events in the
    # append-only log must be tolerated (the log is append-only and may already
    # contain them) but must not overwrite the terminal state. Preserve the
    # first terminal event's status, attempt metadata, error, run_id, output,
    # provider_id, and model across trailing events.
    if prior is not None and prior.is_terminal:
        return Job(
            job_id=prior.job_id,
            kind=prior.kind,
            created_at=prior.created_at,
            spec=prior.spec,
            status=prior.status,
            attempt=prior.attempt,
            events=(*prior.events, event),
            attempt_metadata=dict(prior.attempt_metadata),
            last_error=prior.last_error,
            run_id=prior.run_id,
            output=prior.output,
            provider_id=prior.provider_id,
            model=prior.model,
        )
    spec = dict(event.spec) if prior is None else dict(prior.spec)
    if event.spec:
        for key, value in event.spec.items():
            spec[key] = value
    kind = spec.get("kind") or (prior.kind if prior else JOB_KIND_RECIPE)
    if "kind" not in spec and prior is not None:
        spec["kind"] = prior.kind
    status = event.status or (prior.status if prior else JOB_STATUS_PENDING)
    attempt = event.attempt or (prior.attempt if prior else 0)
    attempt_metadata = (
        dict(event.attempt_metadata)
        if event.attempt_metadata
        else (dict(prior.attempt_metadata) if prior else {"number": int(attempt)})
    )
    # Keep ``attempt_metadata.number`` aligned with the integer ``attempt``
    # so the materialized view never has them disagree.
    attempt_metadata.setdefault("number", int(attempt))
    last_error = event.error if event.error is not None else (
        prior.last_error if prior else None
    )
    run_id = event.run_id if event.run_id is not None else (
        prior.run_id if prior else None
    )
    output = event.output if event.output is not None else (
        prior.output if prior else None
    )
    provider_id = event.provider_id if event.provider_id is not None else (
        prior.provider_id if prior else None
    )
    model = event.model if event.model is not None else (
        prior.model if prior else None
    )
    created_at = prior.created_at if prior else event.created_at
    return Job(
        job_id=event.job_id,
        kind=kind,
        created_at=created_at,
        spec=spec,
        status=status,
        attempt=attempt,
        events=(*(prior.events if prior else ()), event),
        attempt_metadata=attempt_metadata,
        last_error=last_error,
        run_id=run_id,
        output=output,
        provider_id=provider_id,
        model=model,
    )


def _read_jsonl_events(path: Path) -> Iterable[JobEvent]:
    rows: list[JobEvent] = []
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
                if isinstance(data, Mapping):
                    try:
                        rows.append(JobEvent.from_dict(data))
                    except JobError:
                        continue
    except FileNotFoundError:
        return ()
    return tuple(rows)


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text else None


# ---- rendering ------------------------------------------------------


def render_jobs(jobs: Iterable[Job]) -> str:
    """Stable text table for ``freellmpool jobs list`` and ``jobs watch``."""
    rows = list(jobs)
    if not rows:
        return "No jobs in queue."
    headers = ("job id", "status", "kind", "label", "created", "attempt")
    body = [
        headers,
        *(
            (
                job.job_id,
                job.status,
                job.kind,
                job.label,
                job.created_at,
                str(job.attempt),
            )
            for job in rows
        ),
    ]
    widths = [max(len(str(row[idx])) for row in body) for idx in range(len(headers))]
    lines = []
    for idx, row in enumerate(body):
        if idx == 0:
            lines.append(
                "  ".join(str(cell).ljust(widths[i]) for i, cell in enumerate(row))
            )
            lines.append("  ".join("-" * widths[i] for i in range(len(headers))))
        else:
            lines.append(
                "  ".join(str(cell).ljust(widths[i]) for i, cell in enumerate(row))
            )
    return "\n".join(lines)


def render_run_plan(jobs: Iterable[Job], *, limit: int | None = None) -> str:
    """Pretty execution order for ``jobs run --dry-run``.

    ``jobs`` is expected to be the same snapshot ``run_pending_jobs``
    would iterate (i.e. the pending FIFO list, including stranded
    started jobs). ``limit`` mirrors ``--limit`` on ``jobs run`` and
    caps how many lines the plan prints — so a dry-run produces the
    same shape a real limited run would.
    """
    rows = list(jobs)
    if limit is not None:
        if limit < 1:
            raise JobError("--limit must be >= 1")
        rows = rows[:limit]
    if not rows:
        return "No pending jobs to run."
    lines = ["Execution plan:"]
    for idx, job in enumerate(rows, start=1):
        lines.append(f"  {idx}. {job.job_id}  {job.label}  ({job.kind})")
    return "\n".join(lines)


def render_run_summary(outcome: RunOutcome) -> str:
    lines = [
        f"completed: {len(outcome.completed)}",
        f"failed:    {len(outcome.failed)}",
        f"cancelled: {len(outcome.cancelled)}",
        f"pending:   {len(outcome.pending)}",
    ]
    if outcome.halted_by_max_failures:
        lines.append("halted: --max-failures reached")
    return "\n".join(lines)
