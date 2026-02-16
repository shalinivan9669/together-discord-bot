# Operations

## Health checks
Endpoint: `GET /healthz`
Returns:
- `ok`
- `version`
- `uptime`
- `db` (`ok`/`fail`)
- `discord` (`ready`/`not_ready`)
- `boss` (`ok`/`fail`)

## Logs
Structured JSON via pino. Every interaction/job includes IDs for correlation and replay analysis.

## Runbook: Stuck jobs
1. Check logs for repeated job failures by `job_id` and `feature`.
2. Verify DB and Discord connectivity.
3. Confirm payload schema compatibility.
4. Use pg-boss admin SQL/query tooling to inspect queue depth.
5. If needed, pause traffic and restart process to drain gracefully.

## Runbook: Discord outage / rate limits
1. Expect projection edits to retry with backoff.
2. Avoid manual spam posts; wait for projection queue catch-up.
3. Confirm bot token is valid and gateway session resumes.

## Runbook: DB outage
1. `/healthz` will show `db=fail`.
2. Commands/jobs should fail fast and retry via pg-boss where applicable.
3. Restore Neon availability.
4. Verify queue + projection processing recovery.

## Graceful shutdown sequence
On SIGTERM/SIGINT:
1. Stop queue worker (`pg-boss`) to stop accepting jobs.
2. Close Postgres pool.
3. Destroy Discord client.
4. Stop HTTP server.

This sequence is implemented in `src/index.ts`.