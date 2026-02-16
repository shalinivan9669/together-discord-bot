# Security

## Secrets
- Never commit secrets.
- `.env` is gitignored.
- Use `.env.example` for required keys.
- Logger redacts common secret paths.

## Input controls
- All env vars validated with zod.
- Interaction payloads and custom IDs are parsed/validated.
- Text input length constrained (modals/options).

## Abuse controls
- No message-content reading.
- Daily DB-backed counters available (`command_rate_limits`).
- Unique constraints prevent duplicate submissions/claims.

## Authorization
- Setup and duel admin flows require admin or configured moderator role.
- Pair rooms isolate access through channel permission overwrites.

## Data model hardening
- Idempotency primarily via unique constraints.
- Advisory locks protect concurrency-sensitive starts/closes.
- Outbox table supports deduped public posting.