# Operations

## Bootstrap
1. Install dependencies: `pnpm install --frozen-lockfile`
2. Run migrations: `pnpm db:migrate`
3. Seed deterministic content: `pnpm seed`
4. Deploy slash commands: `pnpm discord:deploy-commands`
5. Start app: `pnpm start`

## Health checks
Endpoint: `GET /healthz`

Response fields:
- `ok`
- `version`
- `uptime`
- `db` (`ok` / `fail`)
- `discord` (`ready` / `not_ready`)
- `boss` (`ok` / `fail`)

## Queue jobs
Registered jobs:
- `duel.round.close`
- `duel.scoreboard.refresh`
- `raid.progress.refresh`
- `public.post.publish`
- `weekly.horoscope.publish`
- `weekly.checkin.nudge`
- `weekly.raid.start`
- `weekly.raid.end`
- `daily.raid.offers.generate`

Recurring schedules (enabled by feature flags where applicable):
- Horoscope weekly publish: Monday `10:00` (`weekly.horoscope.publish`)
- Check-in weekly nudge: Wednesday `12:00` (`weekly.checkin.nudge`)
- Raid weekly start: Monday `09:00` (`weekly.raid.start`)
- Raid weekly end: Monday `09:05` (`weekly.raid.end`)
- Raid daily offers generation: daily `09:00` (`daily.raid.offers.generate`)
- Raid projection refresh: every 10 minutes (`raid.progress.refresh`)
- Public post publish sweep: every 2 minutes (`public.post.publish`)

## Logs and tracing
All interactions/jobs emit structured logs with:
- `correlation_id`
- `interaction_id`
- `job_id`
- `guild_id`
- `user_id`
- `feature`
- `action`

Use these IDs to reconstruct retries and dedupe behavior.

## Runbook: Stuck jobs
1. Filter logs by `job_id`, `feature`, `action`.
2. Verify `db`, `discord`, and `boss` in `/healthz`.
3. Confirm payload schema compatibility after deploy.
4. Inspect pg-boss queue depth via SQL/admin tooling.
5. For `public.post.publish`, inspect `scheduled_posts.status`, `last_error`, `updated_at`.
6. If required, restart process gracefully and let retry-safe jobs re-run.

## Runbook: Discord outage / rate limits
1. Expect projection editor retries with backoff (`messageEditor`).
2. Avoid manual posting in projection channels.
3. Verify bot token and gateway readiness.
4. After recovery, ensure queue drains and single-message projections catch up.

## Runbook: DB outage
1. `/healthz` will show `db=fail`.
2. Interactions/jobs fail fast and re-enter retry paths where configured.
3. Restore Neon availability.
4. Verify new rows appear again in `scheduled_posts`, `raid_claims`, `checkins`.

## Graceful shutdown sequence
On `SIGTERM` / `SIGINT`:
1. Stop queue worker (`pg-boss`) from taking new jobs.
2. Close Postgres pool.
3. Destroy Discord client.
4. Stop HTTP server.

Implemented in `src/index.ts`.
