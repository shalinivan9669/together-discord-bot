# ADR-002: Private Channels Over Threads

## Status
Accepted

## Context
Pair rooms require strict access control and durable linking.

## Decision
Use private text channels with explicit permission overwrites, not threads.

## Consequences
- Strong permission boundaries.
- Easy channel mention/lookup.
- Requires `Manage Channels` permission.