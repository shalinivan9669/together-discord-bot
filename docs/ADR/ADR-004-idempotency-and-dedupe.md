# ADR-004: Idempotency and Dedupe

## Status
Accepted

## Context
Discord interactions and worker jobs may retry or duplicate.

## Decision
Combine:
- unique DB constraints,
- transactions,
- advisory locks,
- deterministic idempotency keys,
- optional `op_dedup` table.

## Consequences
- Safe retries and double-click handling.
- Reduced race conditions in weekly and round starts.