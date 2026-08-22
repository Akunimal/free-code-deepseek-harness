# Agent Note: Ignore Route Reasoning Defaults for Non-Reasoning Models

Status: implemented

## Problem

The pi-ai adapter supports per-model reasoning declarations, but a legacy profile can still retain the route-level `reasoning` field. A hand-declared pool model without reasoning metadata must not inherit that field: the adapter would otherwise reject a normal request with `UNSUPPORTED_REASONING_EFFORT` before provider I/O. This is common after moving a heterogeneous free pool from one route-wide default to per-model declarations.

## Decision

`PiAiAdapter.stream()` applies the profile reasoning default only when the resolved model advertises reasoning capability. An explicit request effort still goes through the normal exact-model validation and remains an error when unsupported. This keeps strict validation for caller-selected values while making stale route defaults harmless for non-reasoning models.

The FreeCode shell also migrates its persisted pool settings: non-DeepSeek models are declared with `reasoningEfforts: false`, DeepSeek models keep the supported effort map, and obsolete provider/default effort fields are removed.

## Verification

The adapter regression uses a hand-declared `x-preview-f` with a legacy `reasoning: high` route setting and verifies a successful request without `reasoning_effort`. Shell seeder and refresher regressions cover persisted migration and mixed-model declarations.
