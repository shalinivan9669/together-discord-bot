# Agent Guide

## PR checklist
- [ ] Interaction handlers ACK quickly.
- [ ] No message-content ingestion.
- [ ] DB writes are idempotent under retries/double-click.
- [ ] Public scoreboard/progress use message edits only.
- [ ] Feature flags default OFF for phase 2 changes.
- [ ] Structured logs include correlation IDs.
- [ ] Migrations and seeds are repeatable.

## Idempotency checklist
- Use unique constraints first.
- Use transactions for multi-table writes.
- Use advisory locks for race-prone starts.
- Use deterministic idempotency keys for weekly and claim flows.

## Migration rules
- Never edit applied SQL migration files.
- Add new forward-only migration.
- Keep schema and migration aligned.
- Ensure seed script can rerun safely.

## Operational safety checklist
- Always defer interactions.
- Never read message content.
- Use DB constraints + transaction for dedupe.
- Edit single public projection messages only.
- Avoid spam posting.
- Ensure scheduled jobs are idempotent.
- Include correlation IDs in logs/jobs.
- Keep secrets out of logs.
- Keep migrations and seeds repeatable.
- Keep Phase 2 feature flags OFF by default.