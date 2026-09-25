# Gentle-AI Review Specification

## Purpose

In-harness enforcement of Gentle AI review discipline (RDD v2) as verbatim state transitions, independent of the external binary version.

## Requirements

### Requirement: RDD v2 Verbatim Enforcement

The system MUST enforce RDD v2 transitions verbatim: `status` output followed by `START` followed by the exact `next_transition` value. Any deviation MUST be rejected, not advisory.

#### Scenario: Verbatim sequence accepted

- GIVEN a review emitting `status`, then `START`, then the exact `next_transition` string
- WHEN the transition is validated
- THEN it is accepted and logged

#### Scenario: Paraphrased transition rejected

- GIVEN a review that paraphrases or reorders the `next_transition` value
- WHEN validation runs
- THEN it is rejected with an error naming the expected verbatim value

### Requirement: Status START Handshake

The system MUST require the `START` marker between `status` and `next_transition`. Missing or duplicated `START` markers MUST fail validation.

#### Scenario: Missing START fails

- GIVEN a review that emits `next_transition` without a preceding `START`
- WHEN validation runs
- THEN it fails with a missing-marker error

### Requirement: Harness-Side Audit Trail

Every enforced review decision MUST append an auditable entry recording input hash, emitted sequence, verdict, and timestamp. The log MUST NOT contain secrets.

#### Scenario: Audit entry written

- GIVEN a review transition is accepted or rejected
- WHEN enforcement completes
- THEN an audit entry with verdict and timestamp exists without secret content
