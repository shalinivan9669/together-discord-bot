# Raid Loop Skill

## Do
- Keep raid week unique per guild.
- Use claim uniqueness per day/pair/quest.
- Route progress updates through one editable message.
- Apply anti-farm limits with daily totals table.

## Don't
- Don't allow unbounded repeated claims.

## Example
- `UNIQUE(raid_id, day_date, pair_id, quest_key)` on `raid_claims`.