# Ops Runbooks

## 1) Discord outage / gateway disconnect
Symptoms:
- `/healthz` shows `discord: "not_ready"`.
- Interaction errors or projection edits failing.

Actions:
1. Confirm Discord status page outage.
2. Check app logs for `ShardDisconnect` / `ShardResume`.
3. Wait for auto-reconnect first.
4. If not recovering, restart service.
5. After recovery, verify `/healthz` and confirm dashboards are editing again.

## 2) Neon outage / DB unavailable
Symptoms:
- `/healthz` shows `db: "fail"`.
- Queue workers fail to claim or persist rows.

Actions:
1. Check Neon status and project health.
2. Verify `DATABASE_URL` has not changed/expired.
3. Restart service after Neon is healthy.
4. Run `pnpm smoke`.
5. Confirm pending work catches up:
   - `scheduled_posts` pending rows decrease.
   - projection refresh jobs complete.

## 3) Discord rate-limit storm
Symptoms:
- Repeated `Discord API request retry scheduled` warnings.
- Projection updates lag behind.

Actions:
1. Confirm no manual spam commands are being executed repeatedly.
2. Verify only one production worker deployment is active.
3. Keep worker running; retry/backoff and projection coalescing should drain naturally.
4. If backlog keeps growing, restart service once and re-check queue depth.

## 4) pg-boss stuck jobs
Quick checks:
- `select name, state, count(*) from public.job group by name, state order by name, state;`
- `select name, cron from public.schedule order by name;`

Actions:
1. Verify `/healthz` is green.
2. Check error logs for failing job names.
3. Re-run failed jobs by sending one-off job payloads.

One-off send example (`public.post.publish`):
```powershell
pnpm tsx -e "import { randomUUID } from 'node:crypto'; import PgBoss from 'pg-boss'; import { env } from './src/config/env'; const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'public', migrate: false }); await boss.start(); await boss.send('public.post.publish', { correlationId: randomUUID(), guildId: 'ops', feature: 'public_post', action: 'publish_pending' }); await boss.stop();"
```

## 5) Re-run publish pipeline (scheduled posts)
Use when `scheduled_posts` has stale `failed`/`processing` rows.

1. Inspect rows:
- `select id, guild_id, status, scheduled_for, updated_at, last_error from scheduled_posts order by updated_at desc limit 50;`

2. Requeue stuck rows:
- `update scheduled_posts set status='pending', updated_at=now() where status in ('failed', 'processing');`

3. Trigger publish worker immediately (see one-off send example above).

## 6) Rebuild dashboards (single-message projections)
Use one-off jobs to force projection refresh.

Duel scoreboard:
```powershell
pnpm tsx -e "import { randomUUID } from 'node:crypto'; import PgBoss from 'pg-boss'; import { env } from './src/config/env'; const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'public', migrate: false }); await boss.start(); await boss.send('duel.scoreboard.refresh', { correlationId: randomUUID(), guildId: '<guild_id>', feature: 'duel', action: 'manual_refresh', duelId: '<duel_id>', reason: 'manual_ops' }); await boss.stop();"
```

Raid progress:
```powershell
pnpm tsx -e "import { randomUUID } from 'node:crypto'; import PgBoss from 'pg-boss'; import { env } from './src/config/env'; const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'public', migrate: false }); await boss.start(); await boss.send('raid.progress.refresh', { correlationId: randomUUID(), guildId: '<guild_id>', feature: 'raid', action: 'manual_refresh', raidId: '<raid_id>' }); await boss.stop();"
```

Pair Home panel:
```powershell
pnpm tsx -e "import { randomUUID } from 'node:crypto'; import PgBoss from 'pg-boss'; import { env } from './src/config/env'; const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'public', migrate: false }); await boss.start(); await boss.send('pair.home.refresh', { correlationId: randomUUID(), guildId: '<guild_id>', feature: 'pair_home', action: 'manual_refresh', pairId: '<pair_id>', reason: 'manual_ops' }); await boss.stop();"
```

Oracle dashboard (weekly cycle):
```powershell
pnpm tsx -e "import { randomUUID } from 'node:crypto'; import PgBoss from 'pg-boss'; import { env } from './src/config/env'; const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'public', migrate: false }); await boss.start(); await boss.send('weekly.oracle.publish', { correlationId: randomUUID(), guildId: '<guild_id>', feature: 'oracle', action: 'manual_publish' }); await boss.stop();"
```

Monthly hall dashboard:
```powershell
pnpm tsx -e "import { randomUUID } from 'node:crypto'; import PgBoss from 'pg-boss'; import { env } from './src/config/env'; const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'public', migrate: false }); await boss.start(); await boss.send('monthly.hall.refresh', { correlationId: randomUUID(), guildId: '<guild_id>', feature: 'monthly_hall', action: 'manual_refresh' }); await boss.stop();"
```


