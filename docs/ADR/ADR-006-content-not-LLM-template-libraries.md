# ADR-006: Content Libraries Over LLM Generation

## Status
Accepted

## Context
Weekly loops need deterministic, reviewable, and moderation-safe content.

## Decision
Use seeded content libraries in Postgres for horoscope archetypes, agreements, and quests.
No runtime LLM generation in MVP.

## Consequences
- Deterministic outputs and easier moderation.
- Content updates happen via seed/migration workflows.