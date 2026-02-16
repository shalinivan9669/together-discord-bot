# Agent Guide

## PR checklist
- [ ] Interaction handlers ACK quickly (`deferReply` / `showModal`).
- [ ] No message-content ingestion.
- [ ] DB writes are idempotent under retries/double-click.
- [ ] Public scoreboard/raid progress use single-message edits.
- [ ] Feature flags default OFF for Phase 2.
- [ ] Structured logs include correlation IDs.
- [ ] Migrations and seeds are repeatable.

## Phase 2 done checklist
- [ ] `public.post.publish` is fully implemented (no stub logging path).
- [ ] `weekly.horoscope.publish` creates idempotent weekly posts.
- [ ] `weekly.checkin.nudge` creates idempotent weekly nudges.
- [ ] `weekly.raid.start` / `weekly.raid.end` are implemented and idempotent.
- [ ] `daily.raid.offers.generate` persists deterministic offers.
- [ ] `/horoscope` flow works with claim modal and week-level dedupe.
- [ ] `/checkin start` works in pair room and dedupes by week.
- [ ] `/anon ask` -> queue -> approve/reject -> publish works.
- [ ] `/raid start|quests|progress` and claim-confirm loop work.
- [ ] Rewards helper writes idempotent `rewards_ledger` entries.

## Idempotency checklist
- Use unique constraints first.
- Use transactions for multi-table writes.
- Use advisory locks for race-prone starts/confirms.
- Use deterministic idempotency keys for weekly and claim flows.

## Migration rules
- Never edit already-applied SQL migration files in deployed environments.
- Add forward-only migrations only.
- Keep Drizzle schema and SQL migrations aligned.
- Ensure seed scripts remain rerunnable.

## Operational safety checklist
- Always defer interaction paths that can exceed 3 seconds.
- Never read raw message content as command input.
- Use DB constraints + transactions for dedupe.
- Keep public projections as edit-only single messages.
- Avoid manual spam posting in public channels.
- Ensure scheduled jobs are retry-safe and idempotent.
- Include correlation IDs in logs/jobs.
- Keep secrets out of logs.
- Keep migrations and seeds repeatable.
