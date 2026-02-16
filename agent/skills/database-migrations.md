# Database Migrations Skill

## Do
- Add forward-only SQL migration files.
- Keep `drizzle` schema in sync with migrations.
- Validate unique constraints for dedupe-critical flows.
- Keep seeds idempotent with upsert semantics.
- Add unique/dedupe constraints for interaction saves (`date_weekend_plans`) and use status columns for scheduled-flow sessions (`mediator_repair_sessions`).

## Don't
- Don't edit already-applied migration files in deployed environments.

## Example
- Pair uniqueness: `UNIQUE(guild_id,user_low,user_high)`.
