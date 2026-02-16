# Architecture

## Layers
1. `discord/*`: Adapter layer for gateway events, slash commands, buttons, modals, projection edits.
2. `app/*`: Usecases, services, policies, projection requests.
3. `domain/*`: Pure logic and identifiers. No `discord.js` imports.
4. `infra/*`: Postgres, Drizzle schema/queries, queue, sentry.

## Process model
Single process runs:
- Discord gateway client
- pg-boss worker/scheduler
- Fastify health server

This keeps cost and ops predictable on Railway.

## Runtime flow
1. Validate env (`src/config/env.ts`).
2. Init Sentry (optional).
3. Start pg-boss, register handlers, register schedules.
4. Login Discord client.
5. Start Fastify `/healthz`.
6. Graceful shutdown handles SIGTERM/SIGINT.

## Interaction flow
- Commands and components are interactions-first.
- No message-content ingestion.
- Every command/component logs structured JSON fields:
  - `guild_id`, `user_id`, `pair_id`, `correlation_id`, `interaction_id`, `feature`, `job_id`

## Projection model
- Scoreboard and raid progress use single-message updates.
- Requests are coalesced by pg-boss singleton keys.
- `ThrottledMessageEditor` enforces per-message edit throttle and retry.

## Idempotency model
- Primary dedupe via DB constraints.
- Advisory locks for race-prone operations (`duel.round.start`, `duel.round.close`, scheduled weekly starts).
- Optional operation table `op_dedup` for one-off dedupe keys.