# Idempotency Skill

## Do
- Use DB unique constraints as first-line dedupe.
- Wrap multi-write flows in transactions.
- Build deterministic keys: `feature:guild:pair:week:quest`.
- Use advisory locks for start/close race points.

## Don't
- Don't dedupe only in memory.
- Don't treat retries as failures by default.

## Example
- Duel submission: `UNIQUE(round_id, pair_id)` + on-conflict-do-nothing returns existing success.