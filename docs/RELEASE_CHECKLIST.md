# Release Checklist

## 0) Encoding guard (pre-commit / pre-push)

- [ ] Use editor encoding `UTF-8` without BOM for migration files.
- [ ] Optional hook command: `pnpm db:check-bom` (fail-fast) or `pnpm db:strip-bom` (auto-fix).
- [ ] Keep `.editorconfig` as `charset = utf-8` (not `utf-8-bom`).

## 1) Pre-release

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] `.env` contains all required runtime variables.

Required variables:

- `NODE_ENV=production`
- `LOG_LEVEL=info`
- `DATABASE_URL=<neon postgres url>`
- `DISCORD_TOKEN=<bot token>`
- `DISCORD_APP_ID=<application id>`
- `PHASE2_HOROSCOPE_ENABLED=true`
- `PHASE2_CHECKIN_ENABLED=true`
- `PHASE2_ANON_ENABLED=true`
- `PHASE2_REWARDS_ENABLED=true`
- `PHASE2_SEASONS_ENABLED=true`
- `PHASE2_RAID_ENABLED=true`

Optional but recommended:

- `ALLOWED_GUILD_IDS=<guild_id_1,guild_id_2>`
- `DISCORD_GUILD_ID=<single guild for fast command deploy>`
- `SENTRY_DSN=<dsn>`
- `DEFAULT_TIMEZONE=Asia/Almaty`
- `SCOREBOARD_EDIT_THROTTLE_SECONDS=12`
- `RAID_PROGRESS_EDIT_THROTTLE_SECONDS=15`

## 2) Database + seed

- [ ] `pnpm db:migrate`
- [ ] `pnpm seed`
- [ ] `pnpm smoke`

## 3) Discord command deploy

- [ ] `pnpm commands:deploy`

## 4) Start and verify runtime

- [ ] `pnpm start`
- [ ] `GET /healthz` returns `ok: true` and `db: "ok"`, `discord: "ready"`, `boss: "ok"`.
- [ ] Logs show one startup self-check summary with:
  - `discord.connected=true`
  - `discord.guild_count` > 0 (or expected)
  - `db=ok`
  - `boss=ok`
  - `schedules=[...]`

## 5) Final release gate

- [ ] No unexpected startup errors in logs.
- [ ] No repeated projection edit failures.
- [ ] In a test guild, run `/setup start` -> complete wizard -> verify `/admin status` and `/admin doctor` return `OK`/expected warnings only.
- [ ] Manual smoke path from `docs/SMOKE_TEST.md` passed.
- [ ] Server setup checklist from `docs/SERVER_SETUP_CHECKLIST.md` completed.
