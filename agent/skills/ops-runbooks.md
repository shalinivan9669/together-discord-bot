# Ops Runbooks Skill

## Do
- Check `/healthz` first.
- Correlate failures with `correlation_id`, `interaction_id`, `job_id`.
- Pause/restart safely with graceful shutdown path.
- Verify queue depth and retry behavior.

## Don't
- Don't bypass projection jobs with manual spam posts.
- Don't expose secrets while debugging.

## Operational Safety Checklist
- Always defer interactions.
- Never read message content.
- Use DB constraints + tx for dedupe.
- Edit-only public projection messages.
- No spam posting.
- Scheduled jobs idempotent.
- correlation_id everywhere.
- No secrets in logs.
- Repeatable migrations + seeds.
- Phase 2 flags OFF by default.