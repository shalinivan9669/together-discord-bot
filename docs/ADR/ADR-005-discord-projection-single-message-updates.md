# ADR-005: Single-Message Public Projections

## Status
Accepted

## Context
Public channels should not be spammed by update events.

## Decision
Scoreboard and raid progress are represented as one persistent message each, updated via edits.
Projection refreshes are queued, coalesced, and throttled.

## Consequences
- Cleaner UX.
- Better rate-limit control.
- Requires robust projection recompute from DB source of truth.