# Together Discord Bot

Production-focused Discord bot for relationship server engagement loops.

## Scope
- Phase 1 (enabled and working): boot/runtime, `/healthz`, command deploy script, `/setup`, pair private text channels, duel rounds with modal submissions, single editable scoreboard.
- Phase 2 (compiled skeletons, default OFF): horoscope, check-in, anonymous questions, rewards, seasons/capsules, raid.

## Stack
- Node.js 20+, TypeScript
- discord.js v14 (Gateway + Interactions)
- Neon Postgres + Drizzle ORM
- pg-boss queue/scheduler
- Fastify `/healthz`
- Pino logs, optional Sentry

## Entry points
- Runtime: `src/index.ts`
- Commands deploy: `scripts/deploy-commands.ts`
- Seed content: `scripts/seed.ts`

## Key principles
- Postgres is source of truth; Discord is projection.
- Interactions ACK immediately.
- Public scoreboard/progress are single messages edited via throttled pipeline.
- Idempotency via unique constraints + dedupe keys + advisory locks.