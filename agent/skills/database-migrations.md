# Database Migrations Skill

## Do
- Add forward-only SQL migration files.
- Keep `drizzle` schema in sync with migrations.
- Validate unique constraints for dedupe-critical flows.
- Keep seeds idempotent with upsert semantics.

## Don't
- Don't edit already-applied migration files in deployed environments.

## Example
- Pair uniqueness: `UNIQUE(guild_id,user_low,user_high)`.