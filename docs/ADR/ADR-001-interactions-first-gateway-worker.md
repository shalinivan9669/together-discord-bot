# ADR-001: Interactions-First Gateway Worker

## Status
Accepted

## Context
Discord bots must ACK interactions within 3 seconds and avoid message content dependency.

## Decision
Use gateway + interactions only. Inputs come from slash commands, buttons, selects, and modals.

## Consequences
- Predictable moderation surface.
- Lower privilege footprint.
- Requires careful defer/queue pattern for heavy operations.