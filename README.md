# Together Discord Bot

Discord bot for pair rooms, horoscope, anon questions, raids, weekly check-ins, hall refresh and scheduled public posts.

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
pnpm discord:deploy-commands
pnpm start
```

After bot is online:

1. Run `/setup start`
2. Pick pair category + channels + optional anon mod role + timezone
3. Press **Complete Setup**
4. Run `/admin status` to verify feature/schedule/permission state

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
- `Read Message History`
- `Manage Messages` (used by some projection flows)
- `Manage Channels` (pair category only, for room creation)

## Admin Commands

- `/admin status` - full status (features, schedules, config IDs, permission diagnostics)
- `/admin feature <name> <on|off>`
- `/admin schedule <name> <on|off>`
- `/setup start` - setup wizard

Feature names:
- `horoscope`, `anon`, `raid`, `checkin`, `hall`, `public_post`

Schedule names:
- `weekly.horoscope.publish`
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
- `ALLOWED_GUILD_IDS`
- `LOG_LEVEL`
- `NODE_ENV`
- `SENTRY_DSN`
- `DEFAULT_TIMEZONE` (default: `Asia/Almaty`)

Legacy phase flags still exist in env schema, but runtime feature control is now guild-config based through `/setup` and `/admin feature`.
