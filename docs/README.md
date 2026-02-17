# Together Discord Bot

Production-focused Discord bot for relationship server engagement loops.

## Scope
- Runtime: Discord gateway, `/healthz`, queue workers, scheduled jobs.
- Core: pair private rooms, duel rounds/scoreboard, mediator, date ideas.
- Activities: weekly horoscope, weekly check-in nudges, anon moderation queue, raids.
- Projections: monthly hall card, scheduled public post publishing.
- Ops: `/setup start` wizard and `/admin` diagnostics/toggles.

## Stack
- Node.js 20+, TypeScript
- discord.js v14 (Gateway + Interactions)
- Postgres + Drizzle ORM
- pg-boss queue/scheduler
- Fastify `/healthz`
- Pino logs, optional Sentry

## Entry points
- Runtime: `src/index.ts`
- Commands deploy: `scripts/deploy-commands.ts`
- Seed content: `scripts/seed.ts`

## Key principles
- Postgres is source of truth; Discord is a projection layer.
- Interactions are ACKed quickly.
- Feature toggles and guild config are DB-driven (multi-guild safe).
- Recurring schedules are DB-driven (`scheduler_settings`) and toggleable at runtime.
- Admin status includes explicit permission diagnostics.
