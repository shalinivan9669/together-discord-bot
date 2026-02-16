# Deploy to Railway

## 1) Create infrastructure
1. Create Neon Postgres project.
2. Copy Neon connection string with `sslmode=require`.
3. Create Railway project and service (worker/web service is fine because `/healthz` exists).

## 2) Configure environment variables
Set on Railway:
- `NODE_ENV=production`
- `LOG_LEVEL=info`
- `DATABASE_URL=<neon-url>`
- `DISCORD_TOKEN=<bot-token>`
- `DISCORD_APP_ID=<application-id>`
- Optional: `DISCORD_GUILD_ID` (for command deploy speed)
- Optional: `SENTRY_DSN`
- Optional: `DEFAULT_TIMEZONE=Asia/Almaty`
- Optional phase2 flags (default false)

## 3) Build/start commands
- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build`
- Start: `pnpm start`

## 4) Migrations + seed
Recommended once per environment:
- `pnpm db:migrate`
- `pnpm seed`

## 5) Deploy commands
- `pnpm discord:deploy-commands`

If `DISCORD_GUILD_ID` is set, commands deploy to one guild (fast). Otherwise global deployment can take longer.

## 6) Verify health
- Hit `GET /healthz`
- Expect `{ ok: true, db: "ok", discord: "ready", boss: "ok" }`