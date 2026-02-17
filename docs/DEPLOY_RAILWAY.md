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
- Optional: `COMMAND_DEPLOY_MODE=<guild|global>` (override auto mode)
- Optional: `SENTRY_DSN`
- Optional: `DEFAULT_TIMEZONE=Asia/Almaty`
- Optional phase2 flags (default false)

## 3) Build/start commands

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build`
- Start: `pnpm db:migrate && pnpm seed && pnpm commands:deploy && pnpm start`

## 4) Command deployment behavior

- `pnpm commands:deploy` always does full replacement from `src/discord/commandDefinitions.ts`.
- Default mode: guild when `DISCORD_GUILD_ID` is set, otherwise global.
- Override mode with `COMMAND_DEPLOY_MODE=guild` or `COMMAND_DEPLOY_MODE=global`.
- Global mode is slower to propagate (Discord can take up to ~1 hour).

## 5) Verify health

- Hit `GET /healthz`
- Expect `{ ok: true, db: "ok", discord: "ready", boss: "ok" }`
