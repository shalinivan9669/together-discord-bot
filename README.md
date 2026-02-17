# Together Discord Bot

Discord bot for pair rooms, oracle, anon questions, raids, weekly check-ins, hall refresh and scheduled public posts.

## Quick Setup (5 minutes)

1. Create Postgres DB (Neon/Railway/Postgres-compatible).
2. Create Discord app + bot, invite bot to your server with required permissions (see below).
3. Set env vars.
4. Run migrations and deploy slash commands.
5. Start bot, then run `/setup start` in your server.

### Commands to run

```bash
pnpm install
pnpm db:migrate
pnpm commands:deploy
pnpm start
```

After bot is online:

1. Run `/setup start`
2. Bot posts a persistent setup panel in the current channel
3. Pick pair category + channels + optional anon mod role + timezone
4. Wait until **Complete Setup** button becomes enabled
5. Press **Complete Setup**
6. Run `/admin status` and `/admin doctor` to verify feature/schedule/permission state

## Required Discord Permissions

Server level:

- `View Channels`
- `Send Messages`
- `Embed Links`
- `Read Message History`
- `Manage Channels` (required for `/pair create`)

Configured category/channel level (pair category + target channels):

- `View Channels`
- `Send Messages`
- `Embed Links`
- `Attach Files`
- `Read Message History`
- `Manage Messages` (used by some projection flows)
- `Manage Channels` (pair category only, for room creation)

## Admin Commands

- `/admin status` - full status (by default in Russian: features, schedules, config IDs, permission diagnostics, next setup actions)
- `/admin doctor` - deep diagnostics (DB config, permissions, feature/config mismatches, scheduler sanity, actionable hints)
- `/admin feature set <name> <on|off>`
- `/admin feature enable-all`
- `/admin feature disable-all`
- `/admin schedule <name> <on|off>`
- `/setup start` - setup wizard

Feature names:

- `oracle`, `anon`, `raid`, `checkin`, `hall`, `public_post`

Schedule names:

- `weekly.oracle.publish`
- `weekly.checkin.nudge`
- `weekly.raid.start`
- `weekly.raid.end`
- `daily.raid.offers.generate`
- `raid.progress.refresh`
- `monthly.hall.refresh`
- `public.post.publish`

## Minimal Env Variables

Required:

- `DATABASE_URL`
- `DISCORD_TOKEN`
- `DISCORD_APP_ID`

Common optional:

- `DISCORD_GUILD_ID` (for guild-scoped command deploy)
- `COMMAND_DEPLOY_MODE` (`guild` or `global`; if omitted, deploy script uses guild mode when `DISCORD_GUILD_ID` exists)
- `ALLOWED_GUILD_IDS`
- `LOG_LEVEL`
- `NODE_ENV`
- `SENTRY_DSN`
- `DEFAULT_TIMEZONE` (default: `Asia/Almaty`)

Legacy phase flags still exist in env schema, but runtime feature control is now guild-config based through `/setup` and `/admin feature set`.

## Railway Start Command

Set Railway Start Command to:

```bash
pnpm db:migrate && pnpm seed && pnpm commands:deploy && pnpm start
```

This keeps command registration deterministic on each redeploy. With `DISCORD_GUILD_ID` set, new slash command updates appear in that guild within seconds. Without it, deployment is global and Discord propagation can take up to about an hour.

