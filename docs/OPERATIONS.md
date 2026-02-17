# Operations

## Bootstrap

1. Install dependencies: `pnpm install --frozen-lockfile`
2. Run migrations: `pnpm db:migrate`
3. Seed deterministic content: `pnpm seed`
4. Deploy slash commands: `pnpm commands:deploy`
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
- `pair.home.refresh`
- `monthly.hall.refresh`
- `mediator.repair.tick`
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
- Monthly Hall refresh: day `1` at `10:00` (`monthly.hall.refresh`)
- Public post publish sweep: every 2 minutes (`public.post.publish`)

## Admin controls

- `/admin status`
- `/admin feature set <name> <on|off>`
- `/admin feature enable-all`
- `/admin feature disable-all`
- `/admin config set locale <ru|en>`
- `/admin config get locale`
- `/admin schedule <name> <on|off>`

Language policy:

- User-facing Discord responses default to Russian (`ru`).
- Guild locale can be switched per guild via `/admin config set locale`.

One-shot delayed jobs:

- Mediator repair flow ticks (`mediator.repair.tick`) are created on `/repair` start and scheduled at `+2`, `+4`, `+6` minutes.

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
6. For `mediator.repair.tick`, inspect `mediator_repair_sessions` (`status`, `current_step`, `last_tick_at`, `completed_at`).
7. If required, restart process gracefully and let retry-safe jobs re-run.

## Runbook: Discord outage / rate limits

1. Expect projection editor retries with backoff (`messageEditor`).
2. Avoid manual posting in projection channels.
3. Verify bot token and gateway readiness.
4. After recovery, ensure queue drains and single-message projections catch up.

## Runbook: Projection backlog / staleness

1. Confirm `/healthz` reports `boss=ok`, `discord=ready`, `db=ok`.
2. Inspect queue depth for:

- `duel.scoreboard.refresh`
- `raid.progress.refresh`
- `pair.home.refresh`
- `monthly.hall.refresh`

3. Validate singleton coalescing keys are active:

- `projection:duel_scoreboard:<guild>:<duel>`
- `projection:raid_progress:<guild>:<raid|active>`
- `projection:pair_home:<guild>:<pair>`

4. Check log warnings/errors from `projection.message_editor` and `monthly_hall`.
5. If backlog persists, restart worker process; singleton + idempotent projections will self-heal.

## Runbook: Monthly Hall issues

1. Confirm `guild_settings.hall_channel_id` is set for the guild.
2. Check `monthly_hall_cards` row for current `month_key` and stored `message_id`.
3. If message was deleted manually:

- clear `message_id` for that row (or run monthly job with `monthKey` payload),
- let worker recreate a single card.

4. Confirm user privacy settings in `monthly_hall_opt_ins`; only opted-in users should appear.
5. Re-run `monthly.hall.refresh` manually for backfill month with payload `{ monthKey: "YYYY-MM" }` when needed.

## Runbook: Rate-limit policy anomalies

1. Check command-level abuse patterns in `command_rate_limits`.
2. Validate atomic upsert path:

- entries should stop incrementing once daily `limit` is reached.

3. If counts grow unexpectedly, verify only one app version is writing and that DB time is healthy.
4. Rotate affected action keys only as last resort (changes user-visible limits).

## Runbook: DB outage

1. `/healthz` will show `db=fail`.
2. Interactions/jobs fail fast and re-enter retry paths where configured.
3. Restore Neon availability.
4. Verify new rows appear again in `scheduled_posts`, `raid_claims`, `checkins`, `mediator_*`, `date_weekend_plans`.

## Graceful shutdown sequence

On `SIGTERM` / `SIGINT`:

1. Stop queue worker (`pg-boss`) from taking new jobs.
2. Close Postgres pool.
3. Destroy Discord client.
4. Stop HTTP server.

Implemented in `src/index.ts`.
