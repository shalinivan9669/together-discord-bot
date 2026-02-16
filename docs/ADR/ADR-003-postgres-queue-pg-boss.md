# ADR-003: Postgres Queue via pg-boss

## Status
Accepted

## Context
Need queueing/scheduling without Redis for low-cost operations.

## Decision
Use pg-boss with Neon Postgres.

## Consequences
- Single datastore, simpler ops.
- Queue durability tied to Postgres health.
- Requires queue migration/bootstrap at startup.