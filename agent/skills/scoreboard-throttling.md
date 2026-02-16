# Scoreboard Throttling Skill

## Do
- Keep one public scoreboard message ID per duel.
- Queue refresh jobs with singleton keys.
- Throttle edits per message key.
- Recompute content from DB each refresh.

## Don't
- Don't post a new message for each submission.
- Don't trust Discord message content as source of truth.

## Example
- `duel.scoreboard.refresh` uses `singletonKey=duel-scoreboard:<guild>:<duel>`.