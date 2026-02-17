# Final Changed Files (Full Contents)

## .env.example
-----
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL=postgresql://username:password@host.neon.tech/dbname?sslmode=require
DISCORD_TOKEN=
DISCORD_APP_ID=
DISCORD_GUILD_ID=
ALLOWED_GUILD_IDS=
SENTRY_DSN=
TZ=Asia/Almaty
DEFAULT_TIMEZONE=Asia/Almaty
PHASE2_ORACLE_ENABLED=false
PHASE2_CHECKIN_ENABLED=false
PHASE2_ANON_ENABLED=false
PHASE2_REWARDS_ENABLED=false
PHASE2_SEASONS_ENABLED=false
PHASE2_RAID_ENABLED=false
SCOREBOARD_EDIT_THROTTLE_SECONDS=12
RAID_PROGRESS_EDIT_THROTTLE_SECONDS=15


-----

## docs/COMPONENTS_V2_PATTERNS.md
-----
# Components V2 Patterns

This repo uses raw Discord API Components V2 payloads through `src/discord/ui-v2/`.

## Core Principles
- Use one `Container` card for each logical surface.
- Keep public loop surfaces to one edited message.
- Use concise, scannable `TextDisplay` blocks.
- Prefer ephemeral replies for button help/details.

## Do
- Build cards via `uiCard(...)` for consistent headers and accent styling.
- Use `textBlock(...)` for all text content (automatic truncation guard).
- Use `separator()` to break dense content sections.
- Keep action rows purposeful:
  - one row for dashboard CTA groups
  - one row per select control in setup wizard
- Set `MessageFlags.IsComponentsV2` when creating/editing V2 messages.

## Don’t
- Don’t mix spammy follow-up public posts for normal state updates.
- Don’t bypass `ThrottledMessageEditor` for projection edits.
- Don’t encode unvalidated payloads directly from user input.
- Don’t place long prose into one giant text block.

## Examples

### Duel scoreboard card
```ts
const view = renderDuelScoreboard(snapshot);
await messageEditor.queueEdit({
  channelId: snapshot.publicChannelId,
  messageId: snapshot.scoreboardMessageId,
  content: view.content ?? null,
  components: view.components,
  flags: COMPONENTS_V2_FLAGS,
});
```

### Weekly oracle V2 post
```ts
const message = renderWeeklyOraclePost({ guildId, weekStartDate });
await sendComponentsV2Message(client, channelId, message);
```

### Setup wizard panel
```ts
const panel = renderSetupWizardPanel(draft);
await interaction.editReply({
  content: panel.content ?? null,
  components: panel.components as never,
  flags: COMPONENTS_V2_FLAGS,
} as never);
```

## Custom ID Pattern
- Encode every interactive control with `encodeCustomId`.
- Keep `feature/action/payload` compact.
- Validate `action` and payload shape with `zod` in handlers.

## Text Guard Pattern
- `textBlock` applies safe truncation for `TextDisplay` limits.
- Use short structured lines instead of long paragraphs.


-----

## docs/DEPLOY_RAILWAY.md
-----
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


-----

## docs/OPERATIONS.md
-----
# Operations

## Bootstrap
1. Install dependencies: `pnpm install --frozen-lockfile`
2. Run migrations: `pnpm db:migrate`
3. Seed deterministic content: `pnpm seed`
4. Deploy slash commands: `pnpm discord:deploy-commands`
5. Start app: `pnpm start`

## Health checks
Endpoint: `GET /healthz`

Response fields:
- `ok`
- `version`
- `uptime`
- `db` (`ok` / `fail`)
- `discord` (`ready` / `not_ready`)
- `boss` (`ok` / `fail`)

## Queue jobs
Registered jobs:
- `duel.round.close`
- `duel.scoreboard.refresh`
- `raid.progress.refresh`
- `pair.home.refresh`
- `monthly.hall.refresh`
- `mediator.repair.tick`
- `public.post.publish`
- `weekly.oracle.publish`
- `weekly.checkin.nudge`
- `weekly.raid.start`
- `weekly.raid.end`
- `daily.raid.offers.generate`

Recurring schedules (enabled by feature flags where applicable):
- Oracle weekly publish: Monday `10:00` (`weekly.oracle.publish`)
- Check-in weekly nudge: Wednesday `12:00` (`weekly.checkin.nudge`)
- Raid weekly start: Monday `09:00` (`weekly.raid.start`)
- Raid weekly end: Monday `09:05` (`weekly.raid.end`)
- Raid daily offers generation: daily `09:00` (`daily.raid.offers.generate`)
- Raid projection refresh: every 10 minutes (`raid.progress.refresh`)
- Monthly Hall refresh: day `1` at `10:00` (`monthly.hall.refresh`)
- Public post publish sweep: every 2 minutes (`public.post.publish`)

One-shot delayed jobs:
- Mediator repair flow ticks (`mediator.repair.tick`) are created on `/repair` start and scheduled at `+2`, `+4`, `+6` minutes.

## Logs and tracing
All interactions/jobs emit structured logs with:
- `correlation_id`
- `interaction_id`
- `job_id`
- `guild_id`
- `user_id`
- `feature`
- `action`

Use these IDs to reconstruct retries and dedupe behavior.

## Runbook: Stuck jobs
1. Filter logs by `job_id`, `feature`, `action`.
2. Verify `db`, `discord`, and `boss` in `/healthz`.
3. Confirm payload schema compatibility after deploy.
4. Inspect pg-boss queue depth via SQL/admin tooling.
5. For `public.post.publish`, inspect `scheduled_posts.status`, `last_error`, `updated_at`.
6. For `mediator.repair.tick`, inspect `mediator_repair_sessions` (`status`, `current_step`, `last_tick_at`, `completed_at`).
7. If required, restart process gracefully and let retry-safe jobs re-run.

## Runbook: Discord outage / rate limits
1. Expect projection editor retries with backoff (`messageEditor`).
2. Avoid manual posting in projection channels.
3. Verify bot token and gateway readiness.
4. After recovery, ensure queue drains and single-message projections catch up.

## Runbook: Projection backlog / staleness
1. Confirm `/healthz` reports `boss=ok`, `discord=ready`, `db=ok`.
2. Inspect queue depth for:
- `duel.scoreboard.refresh`
- `raid.progress.refresh`
- `pair.home.refresh`
- `monthly.hall.refresh`
3. Validate singleton coalescing keys are active:
- `projection:duel_scoreboard:<guild>:<duel>`
- `projection:raid_progress:<guild>:<raid|active>`
- `projection:pair_home:<guild>:<pair>`
4. Check log warnings/errors from `projection.message_editor` and `monthly_hall`.
5. If backlog persists, restart worker process; singleton + idempotent projections will self-heal.

## Runbook: Monthly Hall issues
1. Confirm `guild_settings.hall_channel_id` is set for the guild.
2. Check `monthly_hall_cards` row for current `month_key` and stored `message_id`.
3. If message was deleted manually:
- clear `message_id` for that row (or run monthly job with `monthKey` payload),
- let worker recreate a single card.
4. Confirm user privacy settings in `monthly_hall_opt_ins`; only opted-in users should appear.
5. Re-run `monthly.hall.refresh` manually for backfill month with payload `{ monthKey: "YYYY-MM" }` when needed.

## Runbook: Rate-limit policy anomalies
1. Check command-level abuse patterns in `command_rate_limits`.
2. Validate atomic upsert path:
- entries should stop incrementing once daily `limit` is reached.
3. If counts grow unexpectedly, verify only one app version is writing and that DB time is healthy.
4. Rotate affected action keys only as last resort (changes user-visible limits).

## Runbook: DB outage
1. `/healthz` will show `db=fail`.
2. Interactions/jobs fail fast and re-enter retry paths where configured.
3. Restore Neon availability.
4. Verify new rows appear again in `scheduled_posts`, `raid_claims`, `checkins`, `mediator_*`, `date_weekend_plans`.

## Graceful shutdown sequence
On `SIGTERM` / `SIGINT`:
1. Stop queue worker (`pg-boss`) from taking new jobs.
2. Close Postgres pool.
3. Destroy Discord client.
4. Stop HTTP server.

Implemented in `src/index.ts`.


-----

## docs/README.md
-----
# Together Discord Bot

Production-focused Discord bot for relationship server engagement loops.

## Scope
- Phase 1 (enabled and working): boot/runtime, `/healthz`, command deploy script, `/setup`, pair private text channels, duel rounds with modal submissions, single editable scoreboard.
- Phase 2 (implemented, default OFF by flags where applicable): weekly oracle loop, weekly check-in, anonymous moderation queue + QoTD UX, rewards helper, raid cooperative loop, seasons basic status, mediator `/say` + `/repair`, date generator `/date`.

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


-----

## package.json
-----
{
  "name": "together-discord-bot",
  "version": "0.1.0",
  "private": true,
  "description": "Interactions-first Discord bot for relationship server loops",
  "engines": {
    "node": ">=20.0.0"
  },
  "packageManager": "pnpm@10.4.1",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier -w .",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "seed": "tsx scripts/seed.ts",
    "smoke": "tsx scripts/smoke.ts",
    "discord:deploy-commands": "tsx scripts/deploy-commands.ts"
  },
  "dependencies": {
    "@discordjs/rest": "2.4.3",
    "@sentry/node": "8.35.0",
    "discord.js": "14.16.3",
    "dotenv": "16.4.5",
    "drizzle-orm": "0.36.4",
    "fastify": "4.28.1",
    "pg": "8.13.1",
    "pg-boss": "10.1.5",
    "pino": "9.4.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "22.10.1",
    "@types/pg": "8.11.10",
    "@typescript-eslint/eslint-plugin": "8.15.0",
    "@typescript-eslint/parser": "8.15.0",
    "drizzle-kit": "0.29.1",
    "eslint": "8.57.1",
    "eslint-config-prettier": "9.1.0",
    "prettier": "3.3.3",
    "tsx": "4.19.2",
    "typescript": "5.6.3",
    "vitest": "2.1.5"
  }
}


-----

## src/app/services/anonService.ts
-----
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { ANON_DAILY_PENDING_LIMIT, ANON_MAX_LENGTH } from '../../config/constants';
import { isFeatureEnabled } from '../../config/featureFlags';
import { db } from '../../infra/db/drizzle';
import { anonQuestions, guildSettings } from '../../infra/db/schema';
import { createScheduledPost } from './publicPostService';

const mascotAnswerTemplates = {
  connection: [
    'Start with one appreciation, then ask the real question directly.',
    'Keep it short: one feeling, one need, one clear ask.',
    'Choose a calm moment and ask for 10 focused minutes.'
  ],
  repair: [
    'Use this format: "I felt ___, I need ___, can we ___ tonight?"',
    'Name your part first, then ask for one next action.',
    'Aim for repair, not winning. One concrete step beats long debate.'
  ],
  boundaries: [
    'State the boundary kindly and include the reason in one sentence.',
    'Ask for transparency, not control. Keep the request specific.',
    'Boundary + reassurance works best when both are explicit.'
  ]
} as const;

type MascotBucket = keyof typeof mascotAnswerTemplates;

function hashIndex(seed: string, size: number): number {
  const digest = createHash('sha256').update(seed).digest();
  return digest.readUInt32BE(0) % size;
}

function detectMascotBucket(text: string): MascotBucket {
  const normalized = text.toLowerCase();

  if (/(boundary|jealous|trust|privacy|respect|limit)/.test(normalized)) {
    return 'boundaries';
  }

  if (/(fight|argue|repair|sorry|conflict|apolog)/.test(normalized)) {
    return 'repair';
  }

  return 'connection';
}

export function ensureAnonEnabled(): void {
  if (!isFeatureEnabled('anon')) {
    throw new Error('Anonymous questions feature is disabled');
  }
}

export async function createAnonQuestion(input: {
  guildId: string;
  authorUserId: string;
  questionText: string;
  now?: Date;
}) {
  ensureAnonEnabled();

  const normalized = input.questionText.trim();
  if (normalized.length < 2 || normalized.length > ANON_MAX_LENGTH) {
    throw new Error(`Question length must be between 2 and ${ANON_MAX_LENGTH} characters`);
  }

  const now = input.now ?? new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const pendingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(anonQuestions)
    .where(
      and(
        eq(anonQuestions.guildId, input.guildId),
        eq(anonQuestions.authorUserId, input.authorUserId),
        eq(anonQuestions.status, 'pending'),
        gte(anonQuestions.createdAt, dayAgo),
      ),
    );

  if (Number(pendingCount[0]?.count ?? 0) >= ANON_DAILY_PENDING_LIMIT) {
    throw new Error(`Daily pending limit reached (${ANON_DAILY_PENDING_LIMIT})`);
  }

  const [created] = await db
    .insert(anonQuestions)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      authorUserId: input.authorUserId,
      questionText: normalized,
      status: 'pending'
    })
    .returning();

  if (!created) {
    throw new Error('Failed to save anonymous question');
  }

  return created;
}

export async function listPendingAnonQuestions(guildId: string, limit = 5) {
  const page = await listPendingAnonQuestionsPage(guildId, {
    limit,
    offset: 0
  });
  return page.rows;
}

export async function listPendingAnonQuestionsPage(
  guildId: string,
  input: {
    limit?: number;
    offset?: number;
  },
): Promise<{
  rows: Array<typeof anonQuestions.$inferSelect>;
  total: number;
  limit: number;
  offset: number;
}> {
  const limit = Math.min(10, Math.max(1, input.limit ?? 5));
  const offset = Math.max(0, input.offset ?? 0);

  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(anonQuestions)
    .where(and(eq(anonQuestions.guildId, guildId), eq(anonQuestions.status, 'pending')));

  const rows = await db
    .select()
    .from(anonQuestions)
    .where(and(eq(anonQuestions.guildId, guildId), eq(anonQuestions.status, 'pending')))
    .orderBy(desc(anonQuestions.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    rows,
    total: Number(countRows[0]?.count ?? 0),
    limit,
    offset
  };
}

export async function getAnonQuestionById(guildId: string, questionId: string) {
  const rows = await db
    .select()
    .from(anonQuestions)
    .where(and(eq(anonQuestions.guildId, guildId), eq(anonQuestions.id, questionId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function buildAnonMascotAnswer(input: {
  guildId: string;
  questionId: string;
}) {
  ensureAnonEnabled();

  const row = await getAnonQuestionById(input.guildId, input.questionId);
  if (!row) {
    throw new Error('Question not found');
  }

  if (row.status !== 'approved' && row.status !== 'published') {
    throw new Error('Question is not published yet');
  }

  const bucket = detectMascotBucket(row.questionText);
  const templates = mascotAnswerTemplates[bucket];
  const selected = templates[hashIndex(`${row.id}:${row.questionText}`, templates.length)] ?? templates[0];

  return {
    questionId: row.id,
    answer: `Mascot says: ${selected}`
  };
}

export async function rejectAnonQuestion(input: {
  guildId: string;
  questionId: string;
  moderatorUserId: string;
}) {
  ensureAnonEnabled();

  const updated = await db
    .update(anonQuestions)
    .set({
      status: 'rejected',
      approvedBy: input.moderatorUserId,
      approvedAt: new Date()
    })
    .where(
      and(
        eq(anonQuestions.guildId, input.guildId),
        eq(anonQuestions.id, input.questionId),
        eq(anonQuestions.status, 'pending'),
      ),
    )
    .returning();

  return { changed: Boolean(updated[0]), row: updated[0] ?? null };
}

export async function approveAnonQuestion(input: {
  guildId: string;
  questionId: string;
  moderatorUserId: string;
}) {
  ensureAnonEnabled();

  const settingsRows = await db
    .select({
      questionsChannelId: guildSettings.questionsChannelId
    })
    .from(guildSettings)
    .where(and(eq(guildSettings.guildId, input.guildId), isNotNull(guildSettings.questionsChannelId)))
    .limit(1);
  const questionsChannelId = settingsRows[0]?.questionsChannelId;
  if (!questionsChannelId) {
    throw new Error('Questions channel is not configured');
  }

  const updated = await db
    .update(anonQuestions)
    .set({
      status: 'approved',
      approvedBy: input.moderatorUserId,
      approvedAt: new Date()
    })
    .where(
      and(
        eq(anonQuestions.guildId, input.guildId),
        eq(anonQuestions.id, input.questionId),
        eq(anonQuestions.status, 'pending'),
      ),
    )
    .returning();

  const row = updated[0];
  if (!row) {
    const existing = await db
      .select()
      .from(anonQuestions)
      .where(and(eq(anonQuestions.guildId, input.guildId), eq(anonQuestions.id, input.questionId)))
      .limit(1);

    return {
      changed: false,
      scheduledPostId: null as string | null,
      row: existing[0] ?? null
    };
  }

  const scheduled = await createScheduledPost({
    guildId: input.guildId,
    type: 'anon_question',
    targetChannelId: questionsChannelId,
    payloadJson: {
      questionId: row.id,
      questionText: row.questionText,
      guildId: row.guildId,
      authorUserId: row.authorUserId
    },
    idempotencyKey: `anon:publish:${row.id}`,
    scheduledFor: new Date()
  });

  return {
    changed: true,
    scheduledPostId: scheduled.id,
    row
  };
}


-----

## src/app/services/oracleService.ts
-----
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { isFeatureEnabled } from '../../config/featureFlags';
import { startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import { contentOracleArchetypes, guildSettings, oracleClaims, oracleWeeks } from '../../infra/db/schema';

export const ORACLE_MODES = ['soft', 'neutral', 'hard'] as const;
export type OracleMode = (typeof ORACLE_MODES)[number];

export const ORACLE_CONTEXTS = [
  'conflict',
  'ok',
  'boredom',
  'distance',
  'fatigue',
  'jealousy'
] as const;
export type OracleContext = (typeof ORACLE_CONTEXTS)[number];

const variantSchema = z.object({
  risk: z.string(),
  step: z.string(),
  keyPhrase: z.string(),
  taboo: z.string(),
  miniChallenge: z.string()
});

type Variant = z.infer<typeof variantSchema>;

function normalizeMode(value: string): OracleMode | null {
  const normalized = value.trim().toLowerCase();
  return ORACLE_MODES.find((mode) => mode === normalized) ?? null;
}

function normalizeContext(value: string): OracleContext | null {
  const normalized = value.trim().toLowerCase();
  return ORACLE_CONTEXTS.find((context) => context === normalized) ?? null;
}

function hashNumber(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0);
}

function pickDeterministic<T>(list: readonly T[], key: string): T {
  const idx = hashNumber(key) % list.length;
  return list[idx]!;
}

function readVariant(
  variantsJson: unknown,
  mode: OracleMode,
  context: OracleContext,
): Variant {
  const variants = z.record(z.string(), z.record(z.string(), variantSchema)).parse(variantsJson);
  const modeMap = variants[mode];
  if (!modeMap) {
    throw new Error(`Oracle mode "${mode}" not found in archetype variants`);
  }

  const variant = modeMap[context];
  if (!variant) {
    throw new Error(`Oracle context "${context}" not found in archetype variants`);
  }

  return variant;
}

function buildClaimText(params: {
  archetypeTitle: string;
  weekStartDate: string;
  mode: OracleMode;
  context: OracleContext;
  variant: Variant;
}): string {
  return [
    `## Weekly Oracle: ${params.archetypeTitle}`,
    `Week: \`${params.weekStartDate}\``,
    `Mode: **${params.mode}**`,
    `Context: **${params.context}**`,
    '',
    `Risk: ${params.variant.risk}`,
    `Action step: ${params.variant.step}`,
    `Key phrase: "${params.variant.keyPhrase}"`,
    `Avoid: ${params.variant.taboo}`,
    `Mini challenge: ${params.variant.miniChallenge}`
  ].join('\n');
}

export function ensureOracleEnabled(): void {
  if (!isFeatureEnabled('oracle')) {
    throw new Error('Oracle feature is disabled');
  }
}

export function parseOracleMode(input: string): OracleMode | null {
  return normalizeMode(input);
}

export function parseOracleContext(input: string): OracleContext | null {
  return normalizeContext(input);
}

export async function ensureOracleWeek(guildId: string, weekStartDate: string) {
  const existingWeek = await db
    .select()
    .from(oracleWeeks)
    .where(and(eq(oracleWeeks.guildId, guildId), eq(oracleWeeks.weekStartDate, weekStartDate)))
    .limit(1);

  if (existingWeek[0]) {
    return existingWeek[0];
  }

  const archetypes = await db
    .select({
      key: contentOracleArchetypes.key,
      title: contentOracleArchetypes.title
    })
    .from(contentOracleArchetypes)
    .where(eq(contentOracleArchetypes.active, true));

  if (archetypes.length === 0) {
    throw new Error('No active oracle archetypes seeded');
  }

  const selected = pickDeterministic(archetypes, `${guildId}:${weekStartDate}`);
  const seed = hashNumber(`${guildId}:${weekStartDate}:${selected.key}`);

  await db
    .insert(oracleWeeks)
    .values({
      id: randomUUID(),
      guildId,
      weekStartDate,
      archetypeKey: selected.key,
      seed
    })
    .onConflictDoNothing({
      target: [oracleWeeks.guildId, oracleWeeks.weekStartDate]
    });

  const afterInsert = await db
    .select()
    .from(oracleWeeks)
    .where(and(eq(oracleWeeks.guildId, guildId), eq(oracleWeeks.weekStartDate, weekStartDate)))
    .limit(1);

  if (!afterInsert[0]) {
    throw new Error('Failed to ensure oracle week row');
  }

  return afterInsert[0];
}

export async function scheduleWeeklyOraclePosts(now: Date = new Date()): Promise<number> {
  ensureOracleEnabled();
  const weekStartDate = startOfWeekIso(now);

  const guilds = await db
    .select({
      guildId: guildSettings.guildId
    })
    .from(guildSettings)
    .where(isNotNull(guildSettings.oracleChannelId));

  let preparedCount = 0;

  for (const guild of guilds) {
    await ensureOracleWeek(guild.guildId, weekStartDate);
    preparedCount += 1;
  }

  return preparedCount;
}

export async function claimOracle(input: {
  guildId: string;
  userId: string;
  pairId: string | null;
  mode: OracleMode;
  context: OracleContext;
  now?: Date;
}) {
  ensureOracleEnabled();
  const now = input.now ?? new Date();
  const weekStartDate = startOfWeekIso(now);

  const existingClaim = await db
    .select()
    .from(oracleClaims)
    .where(
      and(
        eq(oracleClaims.guildId, input.guildId),
        eq(oracleClaims.weekStartDate, weekStartDate),
        eq(oracleClaims.userId, input.userId),
      ),
    )
    .limit(1);

  if (existingClaim[0] && existingClaim[0].claimText) {
    return {
      claim: existingClaim[0],
      created: false,
      text: existingClaim[0].claimText,
      weekStartDate
    };
  }

  const week = await ensureOracleWeek(input.guildId, weekStartDate);
  const archetypeRows = await db
    .select()
    .from(contentOracleArchetypes)
    .where(eq(contentOracleArchetypes.key, week.archetypeKey))
    .limit(1);

  const archetype = archetypeRows[0];
  if (!archetype) {
    throw new Error(`Archetype "${week.archetypeKey}" not found`);
  }

  const variant = readVariant(archetype.variantsJson, input.mode, input.context);
  const claimText = buildClaimText({
    archetypeTitle: archetype.title,
    weekStartDate,
    mode: input.mode,
    context: input.context,
    variant
  });

  const inserted = await db
    .insert(oracleClaims)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      weekStartDate,
      userId: input.userId,
      pairId: input.pairId,
      deliveredTo: 'pending',
      mode: input.mode,
      context: input.context,
      claimText
    })
    .onConflictDoNothing({
      target: [oracleClaims.guildId, oracleClaims.weekStartDate, oracleClaims.userId]
    })
    .returning();

  if (inserted[0]) {
    return {
      claim: inserted[0],
      created: true,
      text: claimText,
      weekStartDate
    };
  }

  const afterConflict = await db
    .select()
    .from(oracleClaims)
    .where(
      and(
        eq(oracleClaims.guildId, input.guildId),
        eq(oracleClaims.weekStartDate, weekStartDate),
        eq(oracleClaims.userId, input.userId),
      ),
    )
    .limit(1);

  if (!afterConflict[0]) {
    throw new Error('Oracle claim dedupe conflict but row not found');
  }

  return {
    claim: afterConflict[0],
    created: false,
    text: afterConflict[0].claimText ?? claimText,
    weekStartDate
  };
}

export async function markOracleClaimDelivery(claimId: string, deliveredTo: 'dm' | 'pair' | 'ephemeral') {
  await db
    .update(oracleClaims)
    .set({
      deliveredTo
    })
    .where(eq(oracleClaims.id, claimId));
}


-----

## src/app/services/raidService.ts
-----
import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type PgBoss from 'pg-boss';
import {
  RAID_DAILY_OFFERS_COUNT,
  RAID_DAILY_PAIR_CAP_POINTS,
  RAID_DEFAULT_GOAL_POINTS,
} from '../../config/constants';
import { isFeatureEnabled } from '../../config/featureFlags';
import { requestRaidProgressRefresh } from '../projections/raidProjection';
import { requestPairHomeRefresh } from '../projections/pairHomeProjection';
import { addDays, dateOnly, startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import {
  guildSettings,
  pairs,
  raidClaims,
  raidDailyOffers,
  raidPairDailyTotals,
  raidQuests,
  raids,
} from '../../infra/db/schema';
import { getPairForUser } from '../../infra/db/queries/pairs';
import { awardPairReward } from './rewardsService';

export function ensureRaidEnabled(): void {
  if (!isFeatureEnabled('raid')) {
    throw new Error('Raid feature is disabled');
  }
}

function hashNumber(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0);
}

function weekStartDateUtc(date: Date): string {
  return startOfWeekIso(date);
}

function weekEndAtUtc(weekStartDate: string): Date {
  return addDays(new Date(`${weekStartDate}T00:00:00.000Z`), 7);
}

export async function getActiveRaidForGuild(guildId: string) {
  const rows = await db
    .select()
    .from(raids)
    .where(and(eq(raids.guildId, guildId), eq(raids.status, 'active')))
    .orderBy(desc(raids.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

async function requestPairHomeRefreshForGuild(input: {
  guildId: string;
  boss: PgBoss;
  correlationId: string;
  reason: string;
}) {
  const activePairs = await db
    .select({ id: pairs.id })
    .from(pairs)
    .where(and(eq(pairs.guildId, input.guildId), eq(pairs.status, 'active')));

  for (const pair of activePairs) {
    await requestPairHomeRefresh(input.boss, {
      guildId: input.guildId,
      pairId: pair.id,
      reason: input.reason,
      correlationId: input.correlationId
    });
  }
}

async function ensureDailyOffersForRaid(raidId: string, dayDate: string): Promise<string[]> {
  const existingRows = await db
    .select()
    .from(raidDailyOffers)
    .where(and(eq(raidDailyOffers.raidId, raidId), eq(raidDailyOffers.dayDate, dayDate)))
    .limit(1);

  if (existingRows[0]) {
    const parsed = existingRows[0].questKeysJson;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string');
    }
  }

  const activeQuests = await db
    .select({
      key: raidQuests.key
    })
    .from(raidQuests)
    .where(eq(raidQuests.active, true));

  if (activeQuests.length === 0) {
    throw new Error('No active raid quests seeded');
  }

  const selected = [...activeQuests]
    .sort((a, b) => {
      const left = hashNumber(`${raidId}:${dayDate}:${a.key}`);
      const right = hashNumber(`${raidId}:${dayDate}:${b.key}`);
      if (left !== right) {
        return left - right;
      }
      return a.key.localeCompare(b.key);
    })
    .slice(0, Math.min(RAID_DAILY_OFFERS_COUNT, activeQuests.length))
    .map((row) => row.key);

  await db
    .insert(raidDailyOffers)
    .values({
      id: randomUUID(),
      raidId,
      dayDate,
      questKeysJson: selected
    })
    .onConflictDoNothing({
      target: [raidDailyOffers.raidId, raidDailyOffers.dayDate]
    });

  const afterInsertRows = await db
    .select()
    .from(raidDailyOffers)
    .where(and(eq(raidDailyOffers.raidId, raidId), eq(raidDailyOffers.dayDate, dayDate)))
    .limit(1);

  const afterInsert = afterInsertRows[0];
  if (!afterInsert) {
    throw new Error('Failed to create raid daily offers');
  }

  if (!Array.isArray(afterInsert.questKeysJson)) {
    throw new Error('Invalid raid daily offer payload');
  }

  return afterInsert.questKeysJson.filter((value): value is string => typeof value === 'string');
}

export async function generateDailyRaidOffers(now: Date = new Date()): Promise<number> {
  ensureRaidEnabled();
  const day = dateOnly(now);

  const activeRaids = await db
    .select()
    .from(raids)
    .where(and(eq(raids.status, 'active'), lte(raids.createdAt, now)));

  let generated = 0;

  for (const raid of activeRaids) {
    const beforeRows = await db
      .select({ id: raidDailyOffers.id })
      .from(raidDailyOffers)
      .where(and(eq(raidDailyOffers.raidId, raid.id), eq(raidDailyOffers.dayDate, day)))
      .limit(1);

    await ensureDailyOffersForRaid(raid.id, day);

    if (!beforeRows[0]) {
      generated += 1;
    }
  }

  return generated;
}

export async function startRaid(input: {
  guildId: string;
  publicChannelId: string;
  goalPoints?: number;
  createProgressMessage: (content: string) => Promise<string>;
  boss: PgBoss;
  correlationId: string;
  interactionId?: string;
  userId?: string;
  now?: Date;
}) {
  ensureRaidEnabled();

  const now = input.now ?? new Date();
  const weekStartDate = weekStartDateUtc(now);
  const weekEndAt = weekEndAtUtc(weekStartDate);
  const goalPoints = input.goalPoints && input.goalPoints > 0 ? input.goalPoints : RAID_DEFAULT_GOAL_POINTS;

  const txResult = await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${input.guildId}), hashtext('raid.week.start')) as locked`,
    );

    if (!lockResult.rows[0]?.locked) {
      throw new Error('Raid start is already in progress');
    }

    const existing = await tx
      .select()
      .from(raids)
      .where(and(eq(raids.guildId, input.guildId), eq(raids.status, 'active')))
      .orderBy(desc(raids.createdAt))
      .limit(1);

    if (existing[0]) {
      return { raid: existing[0], created: false };
    }

    await tx
      .update(raids)
      .set({ status: 'ended' })
      .where(and(eq(raids.guildId, input.guildId), eq(raids.weekStartDate, weekStartDate), eq(raids.status, 'active')));

    const inserted = await tx
      .insert(raids)
      .values({
        id: randomUUID(),
        guildId: input.guildId,
        status: 'active',
        weekStartDate,
        weekEndAt,
        goalPoints,
        progressPoints: 0,
        publicChannelId: input.publicChannelId
      })
      .onConflictDoNothing({
        target: [raids.guildId, raids.weekStartDate]
      })
      .returning();

    if (inserted[0]) {
      return { raid: inserted[0], created: true };
    }

    const afterConflict = await tx
      .select()
      .from(raids)
      .where(and(eq(raids.guildId, input.guildId), eq(raids.weekStartDate, weekStartDate)))
      .limit(1);

    if (!afterConflict[0]) {
      throw new Error('Raid conflict but row not found');
    }

    return { raid: afterConflict[0], created: false };
  });

  if (!txResult.created) {
    return txResult;
  }

  const progressMessageId = await input.createProgressMessage('Initializing raid progress...');

  await db
    .update(raids)
    .set({ progressMessageId })
    .where(eq(raids.id, txResult.raid.id));

  await ensureDailyOffersForRaid(txResult.raid.id, dateOnly(now));

  await requestRaidProgressRefresh(input.boss, {
    guildId: input.guildId,
    raidId: txResult.raid.id,
    reason: 'raid_start',
    correlationId: input.correlationId
  });

  await requestPairHomeRefreshForGuild({
    guildId: input.guildId,
    boss: input.boss,
    correlationId: input.correlationId,
    reason: 'raid_started'
  });

  return {
    raid: {
      ...txResult.raid,
      progressMessageId
    },
    created: true
  };
}

export async function startWeeklyRaidsForConfiguredGuilds(input: {
  createProgressMessage: (params: { guildId: string; channelId: string; content: string }) => Promise<string>;
  boss: PgBoss;
  correlationId: string;
  now?: Date;
}) {
  ensureRaidEnabled();
  const now = input.now ?? new Date();

  const guildRows = await db
    .select({
      guildId: guildSettings.guildId,
      raidChannelId: guildSettings.raidChannelId
    })
    .from(guildSettings)
    .where(isNotNull(guildSettings.raidChannelId));

  let created = 0;

  for (const guild of guildRows) {
    const channelId = guild.raidChannelId;
    if (!channelId) {
      continue;
    }

    const result = await startRaid({
      guildId: guild.guildId,
      publicChannelId: channelId,
      goalPoints: RAID_DEFAULT_GOAL_POINTS,
      createProgressMessage: (content) =>
        input.createProgressMessage({
          guildId: guild.guildId,
          channelId,
          content
        }),
      boss: input.boss,
      correlationId: input.correlationId,
      now
    });

    if (result.created) {
      created += 1;
    }
  }

  return created;
}

export async function endExpiredRaids(
  now: Date = new Date(),
  input?: {
    boss: PgBoss;
    correlationId: string;
  },
): Promise<number> {
  ensureRaidEnabled();

  const ended = await db
    .update(raids)
    .set({ status: 'ended' })
    .where(and(eq(raids.status, 'active'), lte(raids.weekEndAt, now)))
    .returning({ id: raids.id, guildId: raids.guildId });

  if (input && ended.length > 0) {
    const guildIds = [...new Set(ended.map((raid) => raid.guildId))];

    for (const guildId of guildIds) {
      await requestPairHomeRefreshForGuild({
        guildId,
        boss: input.boss,
        correlationId: input.correlationId,
        reason: 'raid_ended'
      });
    }
  }

  return ended.length;
}

export async function getTodayRaidOffers(guildId: string, now: Date = new Date()) {
  ensureRaidEnabled();

  const activeRaid = await getActiveRaidForGuild(guildId);
  if (!activeRaid) {
    throw new Error('No active raid found');
  }

  const dayDate = dateOnly(now);
  const offerKeys = await ensureDailyOffersForRaid(activeRaid.id, dayDate);
  if (offerKeys.length === 0) {
    return { raid: activeRaid, dayDate, offers: [] as Array<typeof raidQuests.$inferSelect> };
  }

  const allQuests = await db
    .select()
    .from(raidQuests)
    .where(eq(raidQuests.active, true));

  const byKey = new Map(allQuests.map((quest) => [quest.key, quest]));
  const offers = offerKeys.map((key) => byKey.get(key)).filter((value): value is typeof raidQuests.$inferSelect => Boolean(value));

  return { raid: activeRaid, dayDate, offers };
}

export async function claimRaidQuest(input: {
  guildId: string;
  userId: string;
  questKey: string;
  sendConfirmMessage: (params: {
    claimId: string;
    pairId: string;
    pairPrivateChannelId: string;
    claimerUserId: string;
    questKey: string;
    points: number;
  }) => Promise<void>;
  now?: Date;
}) {
  ensureRaidEnabled();

  const now = input.now ?? new Date();
  const dayDate = dateOnly(now);

  const raid = await getActiveRaidForGuild(input.guildId);
  if (!raid) {
    throw new Error('No active raid found');
  }

  const pair = await getPairForUser(input.guildId, input.userId);
  if (!pair) {
    throw new Error('Pair room not found for this user');
  }

  const offerKeys = await ensureDailyOffersForRaid(raid.id, dayDate);
  if (!offerKeys.includes(input.questKey)) {
    throw new Error('Quest is not in today offers');
  }

  const questRows = await db
    .select()
    .from(raidQuests)
    .where(and(eq(raidQuests.key, input.questKey), eq(raidQuests.active, true)))
    .limit(1);

  const quest = questRows[0];
  if (!quest) {
    throw new Error('Quest not found');
  }

  const inserted = await db
    .insert(raidClaims)
    .values({
      id: randomUUID(),
      raidId: raid.id,
      dayDate,
      pairId: pair.id,
      questKey: quest.key,
      status: 'pending_confirm',
      basePoints: quest.points,
      bonusPoints: 0,
      requestedByUserId: input.userId
    })
    .onConflictDoNothing({
      target: [raidClaims.raidId, raidClaims.dayDate, raidClaims.pairId, raidClaims.questKey]
    })
    .returning();

  const claim = inserted[0]
    ? inserted[0]
    : (
        await db
          .select()
          .from(raidClaims)
          .where(
            and(
              eq(raidClaims.raidId, raid.id),
              eq(raidClaims.dayDate, dayDate),
              eq(raidClaims.pairId, pair.id),
              eq(raidClaims.questKey, quest.key),
            ),
          )
          .limit(1)
      )[0];

  if (!claim) {
    throw new Error('Failed to create raid claim');
  }

  if (inserted[0]) {
    await input.sendConfirmMessage({
      claimId: claim.id,
      pairId: pair.id,
      pairPrivateChannelId: pair.privateChannelId,
      claimerUserId: input.userId,
      questKey: claim.questKey,
      points: claim.basePoints + claim.bonusPoints
    });
  }

  return { claim, created: Boolean(inserted[0]), pair, raid };
}

export async function confirmRaidClaim(input: {
  guildId: string;
  claimId: string;
  confirmerUserId: string;
  boss: PgBoss;
  correlationId: string;
}) {
  ensureRaidEnabled();

  const txResult = await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${input.guildId}), hashtext(${input.claimId})) as locked`,
    );

    if (!lockResult.rows[0]?.locked) {
      return { changed: false, appliedPoints: 0, reason: 'locked' as const, raidId: null, pair: null };
    }

    const claimRows = await tx
      .select()
      .from(raidClaims)
      .where(eq(raidClaims.id, input.claimId))
      .limit(1);
    const claim = claimRows[0];
    if (!claim) {
      throw new Error('Claim not found');
    }

    const raidRows = await tx
      .select()
      .from(raids)
      .where(and(eq(raids.id, claim.raidId), eq(raids.guildId, input.guildId)))
      .limit(1);
    const raid = raidRows[0];
    if (!raid) {
      throw new Error('Raid not found');
    }

    const pairRows = await tx
      .select()
      .from(pairs)
      .where(and(eq(pairs.id, claim.pairId), eq(pairs.guildId, input.guildId), eq(pairs.status, 'active')))
      .limit(1);
    const pair = pairRows[0];
    if (!pair) {
      throw new Error('Pair not found for claim');
    }

    if (pair.user1Id !== input.confirmerUserId && pair.user2Id !== input.confirmerUserId) {
      throw new Error('Only pair members can confirm');
    }

    if (claim.requestedByUserId && input.confirmerUserId === claim.requestedByUserId) {
      return { changed: false, appliedPoints: 0, reason: 'same_user' as const, raidId: raid.id, pair };
    }

    if (claim.status === 'confirmed' || claim.status === 'capped') {
      return { changed: false, appliedPoints: 0, reason: 'already_confirmed' as const, raidId: raid.id, pair };
    }

    const totalRows = await tx
      .select()
      .from(raidPairDailyTotals)
      .where(
        and(
          eq(raidPairDailyTotals.raidId, claim.raidId),
          eq(raidPairDailyTotals.dayDate, claim.dayDate),
          eq(raidPairDailyTotals.pairId, claim.pairId),
        ),
      )
      .limit(1);

    const currentTotal = totalRows[0]?.pointsTotal ?? 0;
    const claimPoints = claim.basePoints + claim.bonusPoints;
    const remaining = Math.max(0, RAID_DAILY_PAIR_CAP_POINTS - currentTotal);
    const appliedPoints = Math.max(0, Math.min(remaining, claimPoints));

    if (appliedPoints > 0) {
      await tx
        .insert(raidPairDailyTotals)
        .values({
          raidId: claim.raidId,
          dayDate: claim.dayDate,
          pairId: claim.pairId,
          pointsTotal: currentTotal + appliedPoints
        })
        .onConflictDoUpdate({
          target: [raidPairDailyTotals.raidId, raidPairDailyTotals.dayDate, raidPairDailyTotals.pairId],
          set: {
            pointsTotal: currentTotal + appliedPoints
          }
        });

      await tx
        .update(raids)
        .set({
          progressPoints: raid.progressPoints + appliedPoints
        })
        .where(eq(raids.id, raid.id));
    }

    await tx
      .update(raidClaims)
      .set({
        status: appliedPoints > 0 ? 'confirmed' : 'capped',
        confirmedByUserId: input.confirmerUserId,
        confirmedAt: new Date()
      })
      .where(eq(raidClaims.id, claim.id));

    return {
      changed: true,
      appliedPoints,
      reason: appliedPoints > 0 ? ('confirmed' as const) : ('capped' as const),
      raidId: raid.id,
      pair
    };
  });

  if (!txResult.raidId || !txResult.pair) {
    return txResult;
  }

  if (txResult.appliedPoints > 0) {
    await awardPairReward({
      guildId: input.guildId,
      pairId: txResult.pair.id,
      userIds: [txResult.pair.user1Id, txResult.pair.user2Id],
      kind: 'raid',
      amount: txResult.appliedPoints,
      key: `raid:${input.claimId}`,
      sourceType: 'raid_claim',
      sourceId: input.claimId
    });
  }

  await requestRaidProgressRefresh(input.boss, {
    guildId: input.guildId,
    raidId: txResult.raidId,
    reason: 'claim_confirm',
    correlationId: input.correlationId
  });

  await requestPairHomeRefresh(input.boss, {
    guildId: input.guildId,
    pairId: txResult.pair.id,
    reason: 'raid_claim_confirmed',
    correlationId: input.correlationId,
    userId: input.confirmerUserId
  });

  return txResult;
}

export type RaidProgressPair = {
  pairId: string;
  user1Id: string;
  user2Id: string;
  points: number;
};

export type RaidProgressSnapshot = {
  raidId: string;
  guildId: string;
  status: string;
  weekStartDate: string;
  weekEndAt: Date;
  goalPoints: number;
  progressPoints: number;
  participantsCount: number;
  publicChannelId: string;
  progressMessageId: string | null;
  todayOffers: Array<{ key: string; text: string; points: number }>;
  topPairs: RaidProgressPair[];
  updatedAt: Date;
};

export async function getRaidProgressSnapshot(input: { raidId?: string; guildId?: string; now?: Date }) {
  ensureRaidEnabled();
  const now = input.now ?? new Date();

  let raid: typeof raids.$inferSelect | null = null;
  if (input.raidId) {
    const rows = await db.select().from(raids).where(eq(raids.id, input.raidId)).limit(1);
    raid = rows[0] ?? null;
  } else if (input.guildId) {
    raid = await getActiveRaidForGuild(input.guildId);
  }

  if (!raid) {
    return null;
  }

  const dayDate = dateOnly(now);
  const offerKeys = await ensureDailyOffersForRaid(raid.id, dayDate);

  const offerRows = offerKeys.length
    ? await db.select().from(raidQuests).where(eq(raidQuests.active, true)).orderBy(asc(raidQuests.key))
    : [];
  const offerMap = new Map(offerRows.map((row) => [row.key, row]));
  const todayOffers = offerKeys
    .map((key) => offerMap.get(key))
    .filter((row): row is typeof raidQuests.$inferSelect => Boolean(row))
    .map((row) => ({
      key: row.key,
      text: row.text,
      points: row.points
    }));

  const totals = await db
    .select({
      pairId: raidPairDailyTotals.pairId,
      points: sql<number>`coalesce(sum(${raidPairDailyTotals.pointsTotal}), 0)`
    })
    .from(raidPairDailyTotals)
    .where(eq(raidPairDailyTotals.raidId, raid.id))
    .groupBy(raidPairDailyTotals.pairId);

  const pairRows = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.guildId, raid.guildId), eq(pairs.status, 'active')));
  const pairMap = new Map(pairRows.map((row) => [row.id, row]));

  const topPairs = totals
    .map((total) => {
      const pair = pairMap.get(total.pairId);
      if (!pair) {
        return null;
      }

      return {
        pairId: pair.id,
        user1Id: pair.user1Id,
        user2Id: pair.user2Id,
        points: Number(total.points ?? 0)
      } satisfies RaidProgressPair;
    })
    .filter((value): value is RaidProgressPair => Boolean(value))
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      return a.pairId.localeCompare(b.pairId);
    });

  return {
    raidId: raid.id,
    guildId: raid.guildId,
    status: raid.status,
    weekStartDate: raid.weekStartDate,
    weekEndAt: raid.weekEndAt,
    goalPoints: raid.goalPoints,
    progressPoints: raid.progressPoints,
    participantsCount: pairRows.length,
    publicChannelId: raid.publicChannelId,
    progressMessageId: raid.progressMessageId ?? null,
    todayOffers,
    topPairs,
    updatedAt: new Date()
  } satisfies RaidProgressSnapshot;
}

export async function getRaidContributionForUser(input: {
  guildId: string;
  userId: string;
  now?: Date;
}): Promise<{
  raidId: string;
  pairId: string;
  todayPoints: number;
  weekPoints: number;
  dayDate: string;
} | null> {
  ensureRaidEnabled();
  const now = input.now ?? new Date();
  const raid = await getActiveRaidForGuild(input.guildId);
  if (!raid) {
    return null;
  }

  const pair = await getPairForUser(input.guildId, input.userId);
  if (!pair) {
    return null;
  }

  const dayDate = dateOnly(now);
  const todayRows = await db
    .select({ pointsTotal: raidPairDailyTotals.pointsTotal })
    .from(raidPairDailyTotals)
    .where(
      and(
        eq(raidPairDailyTotals.raidId, raid.id),
        eq(raidPairDailyTotals.pairId, pair.id),
        eq(raidPairDailyTotals.dayDate, dayDate),
      ),
    )
    .limit(1);

  const weekRows = await db
    .select({
      points: sql<number>`coalesce(sum(${raidPairDailyTotals.pointsTotal}), 0)`
    })
    .from(raidPairDailyTotals)
    .where(and(eq(raidPairDailyTotals.raidId, raid.id), eq(raidPairDailyTotals.pairId, pair.id)));

  return {
    raidId: raid.id,
    pairId: pair.id,
    dayDate,
    todayPoints: todayRows[0]?.pointsTotal ?? 0,
    weekPoints: Number(weekRows[0]?.points ?? 0)
  };
}

export async function getRaidTodayPointsForPair(input: {
  raidId: string;
  pairId: string;
  dayDate: string;
}): Promise<number> {
  const rows = await db
    .select({ pointsTotal: raidPairDailyTotals.pointsTotal })
    .from(raidPairDailyTotals)
    .where(
      and(
        eq(raidPairDailyTotals.raidId, input.raidId),
        eq(raidPairDailyTotals.pairId, input.pairId),
        eq(raidPairDailyTotals.dayDate, input.dayDate),
      ),
    )
    .limit(1);

  return rows[0]?.pointsTotal ?? 0;
}


-----

## src/config/env.ts
-----
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .default('false');

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}, z.string().min(1).optional());

const optionalUrlString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}, z.string().url().optional());

const optionalGuildIdCsv = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const ids = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return ids.length > 0 ? ids : undefined;
}, z.array(z.string().regex(/^\d{17,20}$/)).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().url(),
  DISCORD_TOKEN: optionalNonEmptyString,
  DISCORD_APP_ID: optionalNonEmptyString,
  DISCORD_GUILD_ID: optionalNonEmptyString,
  ALLOWED_GUILD_IDS: optionalGuildIdCsv,
  SENTRY_DSN: optionalUrlString,
  TZ: z.string().default('Asia/Almaty'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Almaty'),
  PHASE2_ORACLE_ENABLED: booleanFromString,
  PHASE2_CHECKIN_ENABLED: booleanFromString,
  PHASE2_ANON_ENABLED: booleanFromString,
  PHASE2_REWARDS_ENABLED: booleanFromString,
  PHASE2_SEASONS_ENABLED: booleanFromString,
  PHASE2_RAID_ENABLED: booleanFromString,
  SCOREBOARD_EDIT_THROTTLE_SECONDS: z.coerce.number().int().min(5).max(60).default(12),
  RAID_PROGRESS_EDIT_THROTTLE_SECONDS: z.coerce.number().int().min(5).max(60).default(15)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const flattened = parsed.error.flatten();
  throw new Error(`Invalid environment variables: ${JSON.stringify(flattened.fieldErrors)}`);
}

export const env = parsed.data;
export type Env = typeof env;

export function assertRuntimeDiscordEnv(config: Env): asserts config is Env & {
  DISCORD_TOKEN: string;
  DISCORD_APP_ID: string;
} {
  if (!config.DISCORD_TOKEN || !config.DISCORD_APP_ID) {
    throw new Error('DISCORD_TOKEN and DISCORD_APP_ID are required for runtime bot process');
  }
}


-----

## src/discord/client.ts
-----
import { Client, Events, GatewayIntentBits, type Guild, type Interaction } from 'discord.js';
import type PgBoss from 'pg-boss';
import { handleChatInputCommand } from './commands';
import type { CommandContext } from './commands/types';
import { routeInteractionComponent } from './interactions/router';
import { logger } from '../lib/logger';

type CreateDiscordClientParams = {
  token: string;
  boss: PgBoss;
  allowedGuildIds?: readonly string[];
};

export type DiscordRuntime = {
  client: Client;
  login: () => Promise<void>;
  destroy: () => Promise<void>;
  isReady: () => boolean;
  guildCount: () => number;
};

export function createDiscordRuntime(params: CreateDiscordClientParams): DiscordRuntime {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });
  const allowedGuildIds = params.allowedGuildIds && params.allowedGuildIds.length > 0
    ? new Set(params.allowedGuildIds)
    : null;

  let ready = false;

  async function leaveGuildIfDisallowed(guild: Guild, reason: 'startup' | 'guild_join'): Promise<void> {
    if (!allowedGuildIds || allowedGuildIds.has(guild.id)) {
      return;
    }

    logger.warn(
      {
        feature: 'discord.allowlist',
        action: 'leave_guild',
        guild_id: guild.id,
        guild_name: guild.name,
        reason
      },
      'Guild is not in allowlist; leaving',
    );

    try {
      await guild.leave();
    } catch (error) {
      logger.error(
        {
          feature: 'discord.allowlist',
          action: 'leave_guild_failed',
          guild_id: guild.id,
          guild_name: guild.name,
          reason,
          error
        },
        'Failed to leave disallowed guild',
      );
    }
  }

  client.once(Events.ClientReady, async (c) => {
    ready = true;
    logger.info({ feature: 'discord', bot_user_id: c.user.id, guild_count: c.guilds.cache.size }, 'Discord ready');

    if (!allowedGuildIds) {
      return;
    }

    await Promise.all(
      c.guilds.cache.map(async (guild) => leaveGuildIfDisallowed(guild, 'startup')),
    );
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    ready = false;
    logger.warn({ feature: 'discord', shard_id: shardId, code: event.code }, 'Discord shard disconnected');
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    ready = true;
    logger.info({ feature: 'discord', shard_id: shardId, replayed_events: replayedEvents }, 'Discord shard resumed');
  });

  client.on(Events.GuildCreate, async (guild) => {
    await leaveGuildIfDisallowed(guild, 'guild_join');
  });

  const commandContext: CommandContext = {
    client,
    boss: params.boss
  };

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(commandContext, interaction);
      return;
    }

    if (
      interaction.isButton()
      || interaction.isModalSubmit()
      || interaction.isStringSelectMenu()
      || interaction.isChannelSelectMenu()
      || interaction.isRoleSelectMenu()
    ) {
      await routeInteractionComponent(
        {
          client,
          boss: params.boss
        },
        interaction,
      );
    }
  });

  return {
    client,
    async login() {
      await client.login(params.token);
    },
    async destroy() {
      await client.destroy();
      ready = false;
    },
    isReady() {
      return ready;
    },
    guildCount() {
      return client.guilds.cache.size;
    }
  };
}


-----

## src/discord/commands/anon.ts
-----
import {
  SlashCommandBuilder,
} from 'discord.js';
import { ensureAnonEnabled } from '../../app/services/anonService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { buildAnonAskModal } from '../interactions/components';
import { buildAnonQueueView } from '../interactions/anonQueueView';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

export const anonCommand: CommandModule = {
  name: 'anon',
  data: new SlashCommandBuilder()
    .setName('anon')
    .setDescription('Anonymous questions')
    .addSubcommand((sub) => sub.setName('ask').setDescription('Submit anonymous question'))
    .addSubcommand((sub) => sub.setName('queue').setDescription('Moderation queue (admin/mod)')),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);
    const sub = interaction.options.getSubcommand();
    const correlationId = createCorrelationId();

    try {
      ensureAnonEnabled();
    } catch (error) {
      await interaction.reply({
        ephemeral: true,
        content: error instanceof Error ? error.message : 'Anonymous questions are disabled.'
      });
      return;
    }

    if (sub === 'ask') {
      const modal = buildAnonAskModal(interaction.guildId);

      logInteraction({
        interaction,
        feature: 'anon',
        action: 'ask_open_modal',
        correlationId
      });

      await interaction.showModal(modal as never);
      return;
    }

    const settings = await getGuildSettings(interaction.guildId);
    assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);
    await interaction.deferReply({ ephemeral: true });

    const queue = await buildAnonQueueView(interaction.guildId, 0, 3);

    logInteraction({
      interaction,
      feature: 'anon',
      action: 'queue_view',
      correlationId
    });

    await interaction.editReply({
      content: queue.content,
      components: queue.components as never
    });
  }
};


-----

## src/discord/commands/oracle.ts
-----
import { SlashCommandBuilder } from 'discord.js';
import {
  ensureOracleEnabled,
} from '../../app/services/oracleService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { JobNames } from '../../infra/queue/jobs';
import { createCorrelationId } from '../../lib/correlation';
import { startOfWeekIso } from '../../lib/time';
import { logInteraction } from '../interactionLog';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

export const oracleCommand: CommandModule = {
  name: 'oracle',
  data: new SlashCommandBuilder()
    .setName('oracle')
    .setDescription('Weekly oracle controls')
    .addSubcommand((sub) => sub.setName('status').setDescription('Show oracle status'))
    .addSubcommand((sub) =>
      sub.setName('publish-now').setDescription('Force schedule + publish due oracle posts (admin/mod)'),
    ),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ ephemeral: true });

    try {
      ensureOracleEnabled();
    } catch (error) {
      await interaction.editReply(error instanceof Error ? error.message : 'Oracle is disabled.');
      return;
    }

    const correlationId = createCorrelationId();
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const settings = await getGuildSettings(interaction.guildId);
      const week = startOfWeekIso(new Date());

      logInteraction({
        interaction,
        feature: 'oracle',
        action: 'status',
        correlationId
      });

      await interaction.editReply(
        `Oracle is enabled.\n` +
          `Current week: \`${week}\`\n` +
          `Configured channel: ${settings?.oracleChannelId ? `<#${settings.oracleChannelId}>` : 'not set'}\n` +
          'Weekly publish: Monday 10:00 (scheduler).',
      );
      return;
    }

    if (sub === 'publish-now') {
      const settings = await getGuildSettings(interaction.guildId);
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

      await ctx.boss.send(JobNames.WeeklyOraclePublish, {
        correlationId,
        interactionId: interaction.id,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        feature: 'oracle',
        action: 'publish_now',
        weekStartDate: startOfWeekIso(new Date())
      });

      logInteraction({
        interaction,
        feature: 'oracle',
        action: 'publish_now',
        correlationId
      });

      await interaction.editReply('Weekly oracle refresh job queued.');
      return;
    }

    await interaction.editReply('Unknown oracle subcommand.');
  }
};


-----

## src/discord/commands/raid.ts
-----
import { SlashCommandBuilder, type MessageCreateOptions } from 'discord.js';
import {
  ensureRaidEnabled,
  getRaidProgressSnapshot,
  getTodayRaidOffers,
  startRaid,
} from '../../app/services/raidService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { buildRaidClaimButton } from '../interactions/components';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import { renderRaidProgressText } from '../projections/raidProgressRenderer';
import { sendComponentsV2Message, textBlock, uiCard } from '../ui-v2';
import type { CommandModule } from './types';

function canSend(channel: unknown): channel is {
  id: string;
  send: (options: string | MessageCreateOptions) => Promise<{ id: string }>;
} {
  if (!channel || typeof channel !== 'object') {
    return false;
  }

  return 'id' in channel && typeof channel.id === 'string' && 'send' in channel && typeof channel.send === 'function';
}

export const raidCommand: CommandModule = {
  name: 'raid',
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Server cooperative raid')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start raid')
        .addChannelOption((opt) => opt.setName('channel').setDescription('Public progress channel').setRequired(false))
        .addIntegerOption((opt) => opt.setName('goal').setDescription('Goal points').setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName('quests').setDescription('Show today quests'))
    .addSubcommand((sub) => sub.setName('progress').setDescription('Show raid progress')),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ ephemeral: true });

    try {
      ensureRaidEnabled();
    } catch (error) {
      await interaction.editReply(error instanceof Error ? error.message : 'Raid is disabled.');
      return;
    }

    const correlationId = createCorrelationId();
    const settings = await getGuildSettings(interaction.guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

      const selectedChannel = interaction.options.getChannel('channel', false);
      const channelId = selectedChannel?.id ?? settings?.raidChannelId ?? null;
      if (!channelId) {
        await interaction.editReply('Raid public channel is not configured. Run `/setup` and select a raid channel.');
        return;
      }

      const channel = await interaction.client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !canSend(channel)) {
        await interaction.editReply('Raid channel must be a text channel.');
        return;
      }

      const goal = interaction.options.getInteger('goal', false) ?? undefined;
      const result = await startRaid({
        guildId: interaction.guildId,
        publicChannelId: channel.id,
        goalPoints: goal,
        createProgressMessage: async (content) => {
          const sent = await sendComponentsV2Message(interaction.client, channel.id, {
            components: [
              uiCard({
                title: 'Cooperative Raid Progress',
                status: 'initializing',
                accentColor: 0x1e6f9f,
                components: [textBlock(content)]
              })
            ]
          });
          return sent.id;
        },
        boss: ctx.boss,
        correlationId,
        interactionId: interaction.id,
        userId: interaction.user.id
      });

      logInteraction({
        interaction,
        feature: 'raid',
        action: 'start',
        correlationId,
      });

      await interaction.editReply(
        result.created
          ? `Raid started in <#${result.raid.publicChannelId}>.`
          : `Active raid already exists in <#${result.raid.publicChannelId}>.`,
      );
      return;
    }

    if (sub === 'quests') {
      const data = await getTodayRaidOffers(interaction.guildId);
      if (data.offers.length === 0) {
        await interaction.editReply('No raid offers found for today.');
        return;
      }

      const lines = data.offers.map(
        (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} pts\n${offer.text}`,
      );

      logInteraction({
        interaction,
        feature: 'raid',
        action: 'quests',
        correlationId
      });

      await interaction.editReply({
        content: `Today offers (\`${data.dayDate}\`):\n\n${lines.join('\n\n')}`,
        components: data.offers.map((offer) => buildRaidClaimButton(offer.key)) as never
      });
      return;
    }

    if (sub === 'progress') {
      const snapshot = await getRaidProgressSnapshot({ guildId: interaction.guildId });
      if (!snapshot) {
        await interaction.editReply('No active raid found.');
        return;
      }

      logInteraction({
        interaction,
        feature: 'raid',
        action: 'progress',
        correlationId
      });

      await interaction.editReply(renderRaidProgressText(snapshot));
      return;
    }

    await interaction.editReply('Unknown raid subcommand.');
  }
};


-----

## src/discord/interactions/components.ts
-----
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import {
  dateBudgetValues,
  dateEnergyValues,
  dateTimeValues,
  type DateBudget,
  type DateEnergy,
  type DateTimeWindow,
} from '../../domain/date';
import { encodeCustomId } from './customId';

type SayTone = 'soft' | 'direct' | 'short';
type OracleMode = 'soft' | 'neutral' | 'hard';
type OracleContext = 'conflict' | 'ok' | 'boredom' | 'distance' | 'fatigue' | 'jealousy';

function datePayload(filters: { energy: DateEnergy; budget: DateBudget; timeWindow: DateTimeWindow }) {
  return {
    e: filters.energy,
    b: filters.budget,
    t: filters.timeWindow
  };
}

export function buildDuelSubmitButton(params: { duelId: string; roundId: string; pairId: string }) {
  const customId = encodeCustomId({
    feature: 'duel',
    action: 'open_submit_modal',
    payload: {
      duelId: params.duelId,
      roundId: params.roundId,
      pairId: params.pairId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('Submit answer').setStyle(ButtonStyle.Primary),
  );
}

export function buildDuelSubmissionModal(params: { duelId: string; roundId: string; pairId: string }) {
  const customId = encodeCustomId({
    feature: 'duel',
    action: 'submit_modal',
    payload: {
      duelId: params.duelId,
      roundId: params.roundId,
      pairId: params.pairId
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle('Round submission');

  const answer = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel('Your round answer')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(400)
    .setRequired(true)
    .setPlaceholder('Write your submission here...');

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(answer));
  return modal;
}

const oracleModes: readonly OracleMode[] = ['soft', 'neutral', 'hard'];
const oracleContexts: readonly OracleContext[] = ['conflict', 'ok', 'boredom', 'distance', 'fatigue', 'jealousy'];

export function buildOracleClaimPicker(params: {
  guildId: string;
  weekStartDate: string;
  mode: OracleMode;
  context: OracleContext;
}) {
  const modeSelectId = encodeCustomId({
    feature: 'oracle',
    action: 'pick_mode',
    payload: {
      g: params.guildId,
      w: params.weekStartDate,
      m: params.mode,
      c: params.context
    }
  });

  const contextSelectId = encodeCustomId({
    feature: 'oracle',
    action: 'pick_context',
    payload: {
      g: params.guildId,
      w: params.weekStartDate,
      m: params.mode,
      c: params.context
    }
  });

  const claimButtonId = encodeCustomId({
    feature: 'oracle',
    action: 'claim_submit',
    payload: {
      g: params.guildId,
      w: params.weekStartDate,
      m: params.mode,
      c: params.context
    }
  });

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(modeSelectId)
        .setPlaceholder('Select mode')
        .addOptions(
          oracleModes.map((mode) => ({
            label: mode,
            value: mode,
            default: mode === params.mode
          })),
        ),
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(contextSelectId)
        .setPlaceholder('Select context')
        .addOptions(
          oracleContexts.map((context) => ({
            label: context,
            value: context,
            default: context === params.context
          })),
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(claimButtonId).setLabel('Get privately').setStyle(ButtonStyle.Primary),
    )
  ];
}

export function buildCheckinAgreementSelect(options: Array<{ key: string; text: string }>) {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'agreement_select',
    payload: {}
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select this week agreement')
    .addOptions(
      options.map((item) => ({
        label: item.text.slice(0, 100),
        description: item.key,
        value: item.key
      })),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildCheckinSubmitModal(agreementKey: string) {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'submit_modal',
    payload: {
      a: agreementKey
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle('Weekly check-in');

  const fields = [
    { id: 's1', label: 'Communication quality (1-10)' },
    { id: 's2', label: 'Emotional support (1-10)' },
    { id: 's3', label: 'Shared time quality (1-10)' },
    { id: 's4', label: 'Conflict repair (1-10)' },
    { id: 's5', label: 'Overall week (1-10)' }
  ] as const;

  for (const field of fields) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(2)
          .setPlaceholder('8'),
      ),
    );
  }

  return modal;
}

export function buildCheckinShareButton(checkinId: string) {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'share_agreement',
    payload: {
      c: checkinId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('Share agreement publicly')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildAnonAskModal(guildId: string) {
  const modal = new ModalBuilder()
    .setTitle('Anonymous question')
    .setCustomId(
      encodeCustomId({
        feature: 'anon',
        action: 'ask_modal',
        payload: { g: guildId }
      }),
    )
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('question')
          .setLabel('Your anonymous question')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(400)
          .setRequired(true),
      ),
    );

  return modal;
}

export function buildAnonModerationButtons(questionId: string) {
  const approveId = encodeCustomId({
    feature: 'anon',
    action: 'approve',
    payload: {
      q: questionId
    }
  });

  const rejectId = encodeCustomId({
    feature: 'anon',
    action: 'reject',
    payload: {
      q: questionId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(approveId).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(rejectId).setLabel('Reject').setStyle(ButtonStyle.Danger),
  );
}

export function buildAnonQueuePaginationButtons(params: {
  page: number;
  totalPages: number;
}) {
  const prevPage = Math.max(0, params.page - 1);
  const nextPage = Math.min(Math.max(0, params.totalPages - 1), params.page + 1);

  const prevId = encodeCustomId({
    feature: 'anon_queue',
    action: 'page',
    payload: { p: String(prevPage) }
  });

  const nextId = encodeCustomId({
    feature: 'anon_queue',
    action: 'page',
    payload: { p: String(nextPage) }
  });

  const markerId = encodeCustomId({
    feature: 'anon_queue',
    action: 'noop',
    payload: { p: String(params.page) }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(prevId)
      .setLabel('Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(params.page <= 0),
    new ButtonBuilder()
      .setCustomId(markerId)
      .setLabel(`Page ${params.page + 1}/${Math.max(1, params.totalPages)}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(params.page >= Math.max(0, params.totalPages - 1)),
  );
}

export function buildAnonPublishedButtons(questionId: string) {
  const mascotAnswerId = encodeCustomId({
    feature: 'anon_qotd',
    action: 'mascot_answer',
    payload: {
      q: questionId
    }
  });

  const proposeId = encodeCustomId({
    feature: 'anon_qotd',
    action: 'propose_question',
    payload: {
      q: questionId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(mascotAnswerId).setLabel('Mascot answer').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(proposeId).setLabel('Propose question').setStyle(ButtonStyle.Primary),
  );
}

export function buildMediatorSayModal(guildId: string) {
  const customId = encodeCustomId({
    feature: 'mediator',
    action: 'say_submit',
    payload: {
      g: guildId
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle('Mediator /say');

  const message = new TextInputBuilder()
    .setCustomId('source')
    .setLabel('What do you want to say?')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(320)
    .setRequired(true)
    .setPlaceholder('Example: I felt ignored when plans changed at the last minute.');

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(message));
  return modal;
}

export function buildMediatorSayToneButtons(params: {
  sessionId: string;
  selectedTone: SayTone;
  canSendToPairRoom: boolean;
  alreadySent: boolean;
}) {
  const toneButton = (tone: SayTone, label: string) =>
    new ButtonBuilder()
      .setCustomId(
        encodeCustomId({
          feature: 'mediator',
          action: `say_tone_${tone}`,
          payload: {
            s: params.sessionId
          }
        }),
      )
      .setLabel(label)
      .setStyle(params.selectedTone === tone ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const sendId = encodeCustomId({
    feature: 'mediator',
    action: 'say_send_pair',
    payload: {
      s: params.sessionId
    }
  });

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      toneButton('soft', 'Soft'),
      toneButton('direct', 'Direct'),
      toneButton('short', 'Short'),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(sendId)
        .setLabel('Send to pair room')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!params.canSendToPairRoom || params.alreadySent),
    )
  ];
}

export function buildDateGeneratorPicker(filters: {
  energy: DateEnergy;
  budget: DateBudget;
  timeWindow: DateTimeWindow;
}) {
  const energySelectId = encodeCustomId({
    feature: 'date',
    action: 'pick_energy',
    payload: datePayload(filters)
  });

  const budgetSelectId = encodeCustomId({
    feature: 'date',
    action: 'pick_budget',
    payload: datePayload(filters)
  });

  const timeSelectId = encodeCustomId({
    feature: 'date',
    action: 'pick_time',
    payload: datePayload(filters)
  });

  const generateId = encodeCustomId({
    feature: 'date',
    action: 'generate_ideas',
    payload: datePayload(filters)
  });

  const energyOptions: Record<DateEnergy, string> = {
    low: 'Low energy',
    medium: 'Medium energy',
    high: 'High energy'
  };

  const budgetOptions: Record<DateBudget, string> = {
    free: 'Free',
    moderate: 'Moderate',
    splurge: 'Splurge'
  };

  const timeOptions: Record<DateTimeWindow, string> = {
    quick: 'Quick (30-45m)',
    evening: 'Evening (1-2h)',
    halfday: 'Half-day'
  };

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(energySelectId)
        .setPlaceholder('Select energy')
        .addOptions(
          dateEnergyValues.map((value) => ({
            label: energyOptions[value],
            value,
            default: value === filters.energy
          })),
        ),
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(budgetSelectId)
        .setPlaceholder('Select budget')
        .addOptions(
          dateBudgetValues.map((value) => ({
            label: budgetOptions[value],
            value,
            default: value === filters.budget
          })),
        ),
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(timeSelectId)
        .setPlaceholder('Select time')
        .addOptions(
          dateTimeValues.map((value) => ({
            label: timeOptions[value],
            value,
            default: value === filters.timeWindow
          })),
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(generateId).setLabel('Generate 3 ideas').setStyle(ButtonStyle.Primary),
    )
  ];
}

export function buildRaidClaimButton(questKey: string) {
  const customId = encodeCustomId({
    feature: 'raid',
    action: 'claim',
    payload: {
      q: questKey
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('Claim').setStyle(ButtonStyle.Primary),
  );
}

export function buildRaidConfirmButton(claimId: string) {
  const customId = encodeCustomId({
    feature: 'raid',
    action: 'confirm',
    payload: {
      c: claimId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('Partner confirm').setStyle(ButtonStyle.Success),
  );
}


-----

## src/discord/interactions/router.ts
-----
import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  Client,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction
} from 'discord.js';
import { createHash } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import type PgBoss from 'pg-boss';
import { z } from 'zod';
import { rememberOperation } from '../../infra/db/queries/dedupe';
import { consumeDailyQuota } from '../../app/policies/rateLimitPolicy';
import { requestPublicPostPublish } from '../../app/projections/publicPostProjection';
import { requestPairHomeRefresh } from '../../app/projections/pairHomeProjection';
import { buildDateIdeas, saveDateIdeasForWeekend } from '../../app/services/dateService';
import {
  createMediatorSaySession,
  getMediatorSaySelectedText,
  getMediatorSaySessionForUser,
  markMediatorSaySentToPair,
  renderMediatorSayReply,
  setMediatorSayTone,
} from '../../app/services/mediatorService';
import {
  getPairForCheckinChannel,
  listActiveAgreements,
  scheduleCheckinAgreementShare,
  submitWeeklyCheckin,
} from '../../app/services/checkinService';
import { getPairHomeSnapshot } from '../../app/services/pairHomeService';
import { getDuelContributionForUser } from '../../app/services/duelService';
import { duelSubmitUsecase } from '../../app/usecases/duelUsecases';
import { createCorrelationId } from '../../lib/correlation';
import { logger } from '../../lib/logger';
import { dateOnly } from '../../lib/time';
import { logInteraction } from '../interactionLog';
import {
  buildAnonAskModal,
  buildCheckinAgreementSelect,
  buildCheckinShareButton,
  buildCheckinSubmitModal,
  buildDateGeneratorPicker,
  buildDuelSubmissionModal,
  buildOracleClaimPicker,
  buildMediatorSayToneButtons,
  buildRaidClaimButton,
  buildRaidConfirmButton
} from './components';
import { buildAnonQueueView } from './anonQueueView';
import { decodeCustomId } from './customId';
import {
  approveAnonQuestion,
  buildAnonMascotAnswer,
  createAnonQuestion,
  rejectAnonQuestion
} from '../../app/services/anonService';
import {
  claimOracle,
  markOracleClaimDelivery,
  parseOracleContext,
  parseOracleMode
} from '../../app/services/oracleService';
import { getPairForUser } from '../../infra/db/queries/pairs';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { claimRaidQuest, confirmRaidClaim, getRaidContributionForUser, getTodayRaidOffers } from '../../app/services/raidService';
import { renderDateIdeasResult } from '../projections/dateIdeasRenderer';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';
import { parseDateBudget, parseDateEnergy, parseDateTimeWindow, type DateFilters } from '../../domain/date';
import { handleSetupWizardComponent } from './setupWizard';
import { ANON_MASCOT_DAILY_LIMIT, ANON_PROPOSE_DAILY_LIMIT } from '../../config/constants';

export type InteractionContext = {
  client: Client;
  boss: PgBoss;
};

function isAdminOrConfiguredModeratorForComponent(
  interaction:
    | ButtonInteraction
    | ModalSubmitInteraction
    | StringSelectMenuInteraction
    | ChannelSelectMenuInteraction
    | RoleSelectMenuInteraction,
  moderatorRoleId?: string | null,
): boolean {
  if (!interaction.inCachedGuild()) {
    return false;
  }

  if (interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (!moderatorRoleId) {
    return false;
  }

  return interaction.member.roles.cache.has(moderatorRoleId);
}

const duelBoardPayloadSchema = z.object({ d: z.string().min(1) });
const raidBoardPayloadSchema = z.object({ r: z.string().min(1) });
const pairHomePayloadSchema = z.object({ p: z.string().uuid() });
const mediatorSessionPayloadSchema = z.object({ s: z.string().uuid() });
const datePayloadSchema = z.object({
  e: z.string().min(1),
  b: z.string().min(1),
  t: z.string().min(1)
});
const anonQuestionPayloadSchema = z.object({ q: z.string().uuid() });
const oraclePickerPayloadSchema = z.object({
  g: z.string().min(1),
  w: z.string().min(1),
  m: z.string().optional(),
  c: z.string().optional()
});
const anonQueuePayloadSchema = z.object({
  p: z.string().optional()
});

function parseDateFilters(payload: Record<string, string>): DateFilters | null {
  const parsed = datePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const energy = parseDateEnergy(parsed.data.e);
  const budget = parseDateBudget(parsed.data.b);
  const timeWindow = parseDateTimeWindow(parsed.data.t);

  if (!energy || !budget || !timeWindow) {
    return null;
  }

  return {
    energy,
    budget,
    timeWindow
  };
}

function formatDatePickerSummary(filters: DateFilters): string {
  return `Energy: **${filters.energy}** | Budget: **${filters.budget}** | Time: **${filters.timeWindow}**`;
}

function parseSayToneOrDefault(value: string): 'soft' | 'direct' | 'short' {
  if (value === 'direct') {
    return 'direct';
  }

  if (value === 'short') {
    return 'short';
  }

  return 'soft';
}

function parseOracleSelection(payload: Record<string, string>): {
  guildId: string;
  weekStartDate: string;
  mode: 'soft' | 'neutral' | 'hard';
  context: 'conflict' | 'ok' | 'boredom' | 'distance' | 'fatigue' | 'jealousy';
} | null {
  const parsed = oraclePickerPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const mode = parseOracleMode(parsed.data.m ?? 'soft');
  const context = parseOracleContext(parsed.data.c ?? 'ok');
  if (!mode || !context) {
    return null;
  }

  return {
    guildId: parsed.data.g,
    weekStartDate: parsed.data.w,
    mode,
    context
  };
}

async function handleButton(ctx: InteractionContext, interaction: ButtonInteraction): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const correlationId = createCorrelationId();

  if (decoded.feature === 'setup_wizard') {
    const handled = await handleSetupWizardComponent(ctx, interaction, decoded);
    if (handled) {
      return;
    }
  }

  if (decoded.feature === 'anon_queue' && decoded.action === 'noop') {
    await interaction.deferUpdate();
    return;
  }

  if (decoded.feature === 'anon_queue' && decoded.action === 'page') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const settings = await getGuildSettings(interaction.guildId);
    if (!isAdminOrConfiguredModeratorForComponent(interaction, settings?.moderatorRoleId ?? null)) {
      await interaction.reply({ ephemeral: true, content: 'Admin or configured moderator role is required.' });
      return;
    }

    const parsedPayload = anonQueuePayloadSchema.safeParse(decoded.payload);
    if (!parsedPayload.success) {
      await interaction.reply({ ephemeral: true, content: 'Malformed moderation queue payload.' });
      return;
    }

    const requestedPageRaw = parsedPayload.data.p ?? '0';
    const requestedPage = Number.parseInt(requestedPageRaw, 10);
    const page = Number.isFinite(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
    const queue = await buildAnonQueueView(interaction.guildId, page, 3);

    await interaction.update({
      content: queue.content,
      components: queue.components as never
    });
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'rules') {
    duelBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      ephemeral: true,
      content:
        'Rules: one submission per pair per active round. A moderator starts and closes rounds. ' +
        'Pair totals rank by points first and pair id as deterministic tiebreaker.',
    });
    return;
  }

  if (decoded.feature === 'duel_board' && (decoded.action === 'participate' || decoded.action === 'how')) {
    duelBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      ephemeral: true,
      content:
        'How to participate: join your pair room, wait for a round start message, press Submit answer, ' +
        'then complete the modal once before the timer ends.',
    });
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'my_contribution') {
    duelBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const contribution = await getDuelContributionForUser({
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!contribution) {
      await interaction.editReply('No active duel contribution found for your pair yet.');
      return;
    }

    await interaction.editReply(
      `My duel contribution: **${contribution.submissions}** submission(s), ` +
      `**${contribution.points}** point(s) total.`,
    );
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'open_room') {
    duelBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    await interaction.reply({
      ephemeral: true,
      content: pair ? `Your pair room: <#${pair.privateChannelId}>` : 'You do not have an active pair room yet.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'rules') {
    raidBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      ephemeral: true,
      content:
        'Raid rules: claim one of today quests, then your partner confirms in the pair room. ' +
        'Daily pair cap applies automatically.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'how') {
    raidBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      ephemeral: true,
      content:
        'How it works: open your pair room, pick one today quest, claim it, then ask your partner to confirm. ' +
        'Progress and contribution update automatically.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'open_room') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    await interaction.reply({
      ephemeral: true,
      content: pair ? `Your pair room: <#${pair.privateChannelId}>` : 'You do not have an active pair room yet.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'take_quests') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const data = await getTodayRaidOffers(interaction.guildId);
    if (data.offers.length === 0) {
      await interaction.editReply('No raid offers found for today.');
      return;
    }

    const lines = data.offers.map(
      (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} pts\n${offer.text}`,
    );

    await interaction.editReply({
      content: `Today offers (\`${data.dayDate}\`):\n\n${lines.join('\n\n')}`,
      components: data.offers.map((offer) => buildRaidClaimButton(offer.key)) as never
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'my_contribution') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const contribution = await getRaidContributionForUser({
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!contribution) {
      await interaction.editReply('No active raid contribution found for your pair yet.');
      return;
    }

    await interaction.editReply(
      `My contribution (${contribution.dayDate}): **${contribution.todayPoints}** today, ` +
      `**${contribution.weekPoints}** this raid week.`,
    );
    return;
  }

  if (decoded.feature === 'mediator' && decoded.action.startsWith('say_tone_')) {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const payload = mediatorSessionPayloadSchema.parse(decoded.payload);
    const tone = decoded.action.replace('say_tone_', '');

    const session = await setMediatorSayTone({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      sessionId: payload.s,
      tone
    });

    if (!session) {
      await interaction.reply({ ephemeral: true, content: 'Session expired. Run `/say` again.' });
      return;
    }

    await interaction.update({
      content: renderMediatorSayReply(session),
      components: buildMediatorSayToneButtons({
        sessionId: session.id,
        selectedTone: parseSayToneOrDefault(session.selectedTone),
        canSendToPairRoom: Boolean(session.pairId),
        alreadySent: Boolean(session.sentToPairAt)
      }) as never
    });
    return;
  }

  if (decoded.feature === 'mediator' && decoded.action === 'say_send_pair') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const payload = mediatorSessionPayloadSchema.parse(decoded.payload);
    await interaction.deferUpdate();

    const existingSession = await getMediatorSaySessionForUser({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      sessionId: payload.s
    });
    if (!existingSession) {
      await interaction.followUp({ ephemeral: true, content: 'Session expired. Run `/say` again.' });
      return;
    }

    if (!existingSession.pairId) {
      await interaction.followUp({ ephemeral: true, content: 'No active pair room found for this account.' });
      await interaction.editReply({
        content: renderMediatorSayReply(existingSession),
        components: buildMediatorSayToneButtons({
          sessionId: existingSession.id,
          selectedTone: parseSayToneOrDefault(existingSession.selectedTone),
          canSendToPairRoom: false,
          alreadySent: Boolean(existingSession.sentToPairAt)
        }) as never
      });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (!pair || pair.id !== existingSession.pairId) {
      await interaction.followUp({ ephemeral: true, content: 'Pair room is not available anymore.' });
      await interaction.editReply({
        content: renderMediatorSayReply(existingSession),
        components: buildMediatorSayToneButtons({
          sessionId: existingSession.id,
          selectedTone: parseSayToneOrDefault(existingSession.selectedTone),
          canSendToPairRoom: false,
          alreadySent: Boolean(existingSession.sentToPairAt)
        }) as never
      });
      return;
    }

    const pairChannel = await interaction.client.channels.fetch(pair.privateChannelId);
    if (!pairChannel?.isTextBased() || !('send' in pairChannel) || typeof pairChannel.send !== 'function') {
      await interaction.followUp({ ephemeral: true, content: 'Pair room channel is not sendable.' });
      await interaction.editReply({
        content: renderMediatorSayReply(existingSession),
        components: buildMediatorSayToneButtons({
          sessionId: existingSession.id,
          selectedTone: parseSayToneOrDefault(existingSession.selectedTone),
          canSendToPairRoom: false,
          alreadySent: Boolean(existingSession.sentToPairAt)
        }) as never
      });
      return;
    }

    const marked = await markMediatorSaySentToPair({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      sessionId: existingSession.id
    });

    const session = marked.session;
    if (!session) {
      await interaction.followUp({ ephemeral: true, content: 'Session not found.' });
      return;
    }

    if (marked.changed) {
      await pairChannel.send({
        content: `<@${interaction.user.id}> drafted this with /say:\n\n${getMediatorSaySelectedText(session)}`
      });
      await interaction.followUp({ ephemeral: true, content: 'Sent to your pair room.' });
    } else {
      await interaction.followUp({ ephemeral: true, content: 'Already sent to pair room earlier.' });
    }

    await interaction.editReply({
      content: renderMediatorSayReply(session),
      components: buildMediatorSayToneButtons({
        sessionId: session.id,
        selectedTone: parseSayToneOrDefault(session.selectedTone),
        canSendToPairRoom: Boolean(session.pairId),
        alreadySent: Boolean(session.sentToPairAt)
      }) as never
    });
    return;
  }

  if (decoded.feature === 'date' && decoded.action === 'generate_ideas') {
    const filters = parseDateFilters(decoded.payload);
    if (!filters) {
      await interaction.reply({ ephemeral: true, content: 'Malformed date generator payload.' });
      return;
    }

    await interaction.deferUpdate();

    const ideas = buildDateIdeas(filters);
    const view = renderDateIdeasResult({
      filters,
      ideas
    });

    await interaction.editReply({
      content: null,
      components: view.components as never,
      flags: COMPONENTS_V2_FLAGS
    } as never);
    return;
  }

  if (decoded.feature === 'date' && decoded.action === 'save_weekend') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const filters = parseDateFilters(decoded.payload);
    if (!filters) {
      await interaction.reply({ ephemeral: true, content: 'Malformed date save payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const ideas = buildDateIdeas(filters);
    const saved = await saveDateIdeasForWeekend({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      pairId: pair?.id ?? null,
      filters,
      ideas
    });
    const weekendDate = saved.row?.weekendDate ?? 'current';

    await interaction.editReply(
      saved.created
        ? `Saved for weekend (${weekendDate}).`
        : `Already saved for weekend (${weekendDate}).`,
    );
    return;
  }

  if (decoded.feature === 'anon_qotd' && decoded.action === 'propose_question') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const modal = buildAnonAskModal(interaction.guildId);
    await interaction.showModal(modal as never);
    return;
  }

  if (decoded.feature === 'anon_qotd' && decoded.action === 'mascot_answer') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const payload = anonQuestionPayloadSchema.parse(decoded.payload);
    await interaction.deferReply({ ephemeral: true });

    const quota = await consumeDailyQuota({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      actionKey: 'anon_mascot_answer',
      limit: ANON_MASCOT_DAILY_LIMIT
    });
    if (!quota.allowed) {
      await interaction.editReply('Mascot answer daily limit reached. Try again tomorrow.');
      return;
    }

    const opDate = dateOnly(new Date());
    const dedupeKey = `anon:mascot:${interaction.guildId}:${payload.q}:${interaction.user.id}:${opDate}`;
    const firstRun = await rememberOperation(dedupeKey, {
      questionId: payload.q,
      userId: interaction.user.id
    });

    const answer = await buildAnonMascotAnswer({
      guildId: interaction.guildId,
      questionId: payload.q
    });

    await interaction.editReply(firstRun ? answer.answer : `${answer.answer}\n(Already generated today.)`);
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'checkin') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const pair = await getPairForCheckinChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });

    if (!pair || pair.id !== payload.p) {
      await interaction.editReply('Run check-in from your pair room panel only.');
      return;
    }

    const agreements = await listActiveAgreements(25);
    if (agreements.length === 0) {
      await interaction.editReply('No active agreements found. Run seed script first.');
      return;
    }

    await interaction.editReply({
      content: 'Select one weekly agreement, then fill the 5-score modal.',
      components: [
        buildCheckinAgreementSelect(agreements.map((agreement) => ({ key: agreement.key, text: agreement.text }))) as never
      ]
    });
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'raid') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (!pair || pair.id !== payload.p) {
      await interaction.reply({ ephemeral: true, content: 'This panel action is only for your active pair.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const data = await getTodayRaidOffers(interaction.guildId);
    if (data.offers.length === 0) {
      await interaction.editReply('No raid offers found for today.');
      return;
    }

    const lines = data.offers.map(
      (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} pts\n${offer.text}`,
    );

    await interaction.editReply({
      content: `Today offers (\`${data.dayDate}\`):\n\n${lines.join('\n\n')}`,
      components: data.offers.map((offer) => buildRaidClaimButton(offer.key)) as never
    });
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'duel_info') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    const snapshot = await getPairHomeSnapshot(payload.p);
    if (!snapshot) {
      await interaction.reply({ ephemeral: true, content: 'Pair panel is not available.' });
      return;
    }

    if (snapshot.user1Id !== interaction.user.id && snapshot.user2Id !== interaction.user.id) {
      await interaction.reply({ ephemeral: true, content: 'This panel action is only for pair members.' });
      return;
    }

    const text = !snapshot.duel.active
      ? 'No active duel right now.'
      : !snapshot.duel.roundNo
        ? 'Duel is active but no round is running right now.'
        : `Round #${snapshot.duel.roundNo} is active${snapshot.duel.roundEndsAt
          ? ` and ends <t:${Math.floor(snapshot.duel.roundEndsAt.getTime() / 1000)}:R>`
          : ''}.`;
    await interaction.reply({ ephemeral: true, content: text });
    return;
  }

  if (decoded.feature === 'duel' && decoded.action === 'open_submit_modal') {
    const duelId = decoded.payload.duelId;
    const roundId = decoded.payload.roundId;
    const pairId = decoded.payload.pairId;

    if (!duelId || !roundId || !pairId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed duel payload.' });
      return;
    }

    const modal = buildDuelSubmissionModal({ duelId, roundId, pairId });
    await interaction.showModal(modal as never);

    logInteraction({
      interaction,
      feature: 'duel',
      action: 'open_submit_modal',
      correlationId,
      pairId
    });
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'claim_open') {
    const selection = parseOracleSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({ ephemeral: true, content: 'Malformed oracle payload.' });
      return;
    }

    await interaction.reply({
      ephemeral: true,
      content: 'Pick your mode and context, then press **Get privately**.',
      components: buildOracleClaimPicker({
        guildId: selection.guildId,
        weekStartDate: selection.weekStartDate,
        mode: selection.mode,
        context: selection.context
      }) as never
    });
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'claim_submit') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const selection = parseOracleSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({ ephemeral: true, content: 'Malformed oracle selection.' });
      return;
    }

    await interaction.deferUpdate();

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const claimed = await claimOracle({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      pairId: pair?.id ?? null,
      mode: selection.mode,
      context: selection.context
    });

    let delivered: 'dm' | 'pair' | 'ephemeral' = 'ephemeral';

    try {
      await interaction.user.send(claimed.text);
      delivered = 'dm';
    } catch {
      if (pair) {
        const channel = await interaction.client.channels.fetch(pair.privateChannelId);
        if (channel?.isTextBased() && 'send' in channel && typeof channel.send === 'function') {
          await channel.send({
            content: `<@${interaction.user.id}> weekly oracle:\n\n${claimed.text}`
          });
          delivered = 'pair';
        }
      }
    }

    await markOracleClaimDelivery(claimed.claim.id, delivered);

    const deliveryText = delivered === 'dm'
      ? 'Delivered to your DM.'
      : delivered === 'pair'
        ? 'DM unavailable, delivered to your pair room.'
        : `DM and pair-room fallback unavailable, showing here:\n\n${claimed.text}`;

    await interaction.editReply({
      content: claimed.created
        ? `Oracle claimed. ${deliveryText}`
        : `You already claimed this week. ${deliveryText}`,
      components: []
    });
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'about') {
    await interaction.reply({
      ephemeral: true,
      content:
        'Weekly oracle is deterministic and built from seeded templates. ' +
        'No runtime LLM generation is used in production loops.',
    });
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'start_pair_ritual') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (pair) {
      await requestPairHomeRefresh(ctx.boss, {
        guildId: interaction.guildId,
        pairId: pair.id,
        reason: 'oracle_ritual_open',
        interactionId: interaction.id,
        userId: interaction.user.id,
        correlationId
      });
    }

    await interaction.reply({
      ephemeral: true,
      content: pair
        ? `Open your pair panel in <#${pair.privateChannelId}> and start the ritual there.`
        : 'Create a pair room first with `/pair create`, then start the ritual there.',
    });
    return;
  }

  if (decoded.feature === 'checkin' && decoded.action === 'share_agreement') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const checkinId = decoded.payload.c;
    if (!checkinId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed check-in payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const shared = await scheduleCheckinAgreementShare({
      guildId: interaction.guildId,
      checkinId,
      requesterUserId: interaction.user.id
    });

    await requestPublicPostPublish(ctx.boss, {
      guildId: interaction.guildId,
      scheduledPostId: shared.scheduledPostId,
      reason: 'checkin_share',
      interactionId: interaction.id,
      userId: interaction.user.id,
      correlationId
    });

    await interaction.editReply(
      shared.created
        ? 'Agreement queued for public posting.'
        : 'Agreement share was already queued earlier.',
    );
    return;
  }

  if (decoded.feature === 'anon' && (decoded.action === 'approve' || decoded.action === 'reject')) {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const questionId = decoded.payload.q;
    if (!questionId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed anon moderation payload.' });
      return;
    }

    await interaction.deferUpdate();
    const settings = await getGuildSettings(interaction.guildId);
    if (!isAdminOrConfiguredModeratorForComponent(interaction, settings?.moderatorRoleId ?? null)) {
      await interaction.followUp({ ephemeral: true, content: 'Admin or configured moderator role is required.' });
      return;
    }

    let feedback = 'Question already moderated.';

    if (decoded.action === 'approve') {
      const approved = await approveAnonQuestion({
        guildId: interaction.guildId,
        questionId,
        moderatorUserId: interaction.user.id
      });

      if (approved.changed && approved.scheduledPostId) {
        await requestPublicPostPublish(ctx.boss, {
          guildId: interaction.guildId,
          scheduledPostId: approved.scheduledPostId,
          reason: 'anon_approve',
          interactionId: interaction.id,
          userId: interaction.user.id,
          correlationId
        });
      }

      feedback = approved.changed
        ? 'Question approved and queued for publishing.'
        : 'Question already moderated.';
    } else {
      const rejected = await rejectAnonQuestion({
        guildId: interaction.guildId,
        questionId,
        moderatorUserId: interaction.user.id
      });

      feedback = rejected.changed ? 'Question rejected.' : 'Question already moderated.';
    }

    const queue = await buildAnonQueueView(interaction.guildId, 0, 3);
    await interaction.editReply({
      content: queue.content,
      components: queue.components as never
    });
    await interaction.followUp({ ephemeral: true, content: feedback });

    return;
  }

  if (decoded.feature === 'raid' && decoded.action === 'claim') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const questKey = decoded.payload.q;
    if (!questKey) {
      await interaction.reply({ ephemeral: true, content: 'Malformed raid claim payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await claimRaidQuest({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      questKey,
      sendConfirmMessage: async (params) => {
        const channel = await interaction.client.channels.fetch(params.pairPrivateChannelId);
        if (!channel?.isTextBased() || !('send' in channel) || typeof channel.send !== 'function') {
          throw new Error('Pair room channel is not sendable');
        }

        await channel.send({
          content:
            `<@${params.claimerUserId}> claimed **${params.questKey}** for ${params.points} points.\n` +
            'Partner, press confirm when completed.',
          components: [buildRaidConfirmButton(params.claimId) as never]
        });
      }
    });

    await interaction.editReply(
      result.created
        ? `Claim created for **${questKey}**. Confirmation sent to your pair room.`
        : `Claim for **${questKey}** already exists today.`,
    );
    return;
  }

  if (decoded.feature === 'raid' && decoded.action === 'confirm') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const claimId = decoded.payload.c;
    if (!claimId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed raid confirm payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await confirmRaidClaim({
      guildId: interaction.guildId,
      claimId,
      confirmerUserId: interaction.user.id,
      boss: ctx.boss,
      correlationId
    });

    if (!result.changed && result.reason === 'same_user') {
      await interaction.editReply('The same user who claimed cannot confirm. Ask your partner to confirm.');
      return;
    }

    if (!result.changed && result.reason === 'already_confirmed') {
      await interaction.editReply('This claim was already confirmed.');
      return;
    }

    if (!result.changed) {
      await interaction.editReply('Claim confirmation is already in progress. Try again shortly.');
      return;
    }

    await interaction.editReply(
      result.appliedPoints > 0
        ? `Claim confirmed. +${result.appliedPoints} raid points applied.`
        : 'Daily cap reached for this pair. Claim marked as capped.',
    );
    return;
  }

  await interaction.reply({ ephemeral: true, content: 'Unsupported action.' });
}

function parseCheckinScores(interaction: ModalSubmitInteraction): [number, number, number, number, number] {
  const raw = ['s1', 's2', 's3', 's4', 's5'].map((field) => interaction.fields.getTextInputValue(field).trim());
  const values = raw.map((value) => Number.parseInt(value, 10));

  if (values.some((value) => Number.isNaN(value))) {
    throw new Error('Each score must be an integer.');
  }

  return values as [number, number, number, number, number];
}

async function handleModal(ctx: InteractionContext, interaction: ModalSubmitInteraction): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const correlationId = createCorrelationId();

  if (decoded.feature === 'duel' && decoded.action === 'submit_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const duelId = decoded.payload.duelId;
    const roundId = decoded.payload.roundId;
    const pairId = decoded.payload.pairId;

    if (!duelId || !roundId || !pairId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed duel submission payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const answer = interaction.fields.getTextInputValue('answer');
    const result = await duelSubmitUsecase({
      guildId: interaction.guildId,
      duelId,
      roundId,
      pairId,
      answer,
      userId: interaction.user.id,
      correlationId,
      interactionId: interaction.id,
      boss: ctx.boss
    });

    logInteraction({
      interaction,
      feature: 'duel',
      action: 'submit_modal',
      correlationId,
      pairId,
      jobId: null
    });

    await interaction.editReply(
      result.accepted
        ? 'Submission accepted. Scoreboard will refresh shortly.'
        : 'You already submitted for this round. Keeping your first submission.',
    );
    return;
  }

  if (decoded.feature === 'mediator' && decoded.action === 'say_submit') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const source = interaction.fields.getTextInputValue('source');
    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const session = await createMediatorSaySession({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      pairId: pair?.id ?? null,
      sourceText: source
    });

    await interaction.editReply({
      content: renderMediatorSayReply(session),
      components: buildMediatorSayToneButtons({
        sessionId: session.id,
        selectedTone: parseSayToneOrDefault(session.selectedTone),
        canSendToPairRoom: Boolean(session.pairId),
        alreadySent: Boolean(session.sentToPairAt)
      }) as never
    });
    return;
  }

  if (decoded.feature === 'anon' && decoded.action === 'ask_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const question = interaction.fields.getTextInputValue('question').trim();

    const quota = await consumeDailyQuota({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      actionKey: 'anon_propose_question',
      limit: ANON_PROPOSE_DAILY_LIMIT
    });
    if (!quota.allowed) {
      await interaction.editReply('Question submit daily limit reached. Try again tomorrow.');
      return;
    }

    const opDate = dateOnly(new Date());
    const digest = createHash('sha256').update(question).digest('hex').slice(0, 16);
    const dedupeKey = `anon:submit:${interaction.guildId}:${interaction.user.id}:${opDate}:${digest}`;
    const firstRun = await rememberOperation(dedupeKey, { question });
    if (!firstRun) {
      await interaction.editReply('This exact question was already submitted today.');
      return;
    }

    const created = await createAnonQuestion({
      guildId: interaction.guildId,
      authorUserId: interaction.user.id,
      questionText: question
    });

    logInteraction({
      interaction,
      feature: 'anon',
      action: 'ask_submit',
      correlationId
    });

    await interaction.editReply(`Question queued for moderation. Request id: \`${created.id}\``);
    return;
  }

  if (decoded.feature === 'checkin' && decoded.action === 'submit_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const agreementKey = decoded.payload.a;
    if (!agreementKey) {
      await interaction.reply({ ephemeral: true, content: 'Malformed check-in payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    if (!interaction.channelId) {
      await interaction.editReply('Unable to resolve channel for check-in submission.');
      return;
    }

    const pair = await getPairForCheckinChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });
    if (!pair) {
      await interaction.editReply('Run check-in flow inside your pair room.');
      return;
    }

    const scores = parseCheckinScores(interaction);
    const result = await submitWeeklyCheckin({
      guildId: interaction.guildId,
      pairId: pair.id,
      userId: interaction.user.id,
      agreementKey,
      scores
    });

    logInteraction({
      interaction,
      feature: 'checkin',
      action: 'submit_modal',
      correlationId,
      pairId: pair.id
    });

    if (result.created) {
      await requestPairHomeRefresh(ctx.boss, {
        guildId: interaction.guildId,
        pairId: pair.id,
        reason: 'checkin_saved',
        interactionId: interaction.id,
        userId: interaction.user.id,
        correlationId
      });
    }

    await interaction.editReply({
      content: result.created
        ? 'Weekly check-in submitted. You can optionally share agreement publicly.'
        : 'Check-in already exists for this pair/week. Showing the existing record.',
      components: [buildCheckinShareButton(result.checkin.id) as never]
    });
    return;
  }

  await interaction.reply({ ephemeral: true, content: 'Unsupported modal action.' });
}

async function handleSelect(
  ctx: InteractionContext,
  interaction: StringSelectMenuInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction,
): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);

  if (decoded.feature === 'setup_wizard') {
    if (!interaction.isChannelSelectMenu() && !interaction.isRoleSelectMenu()) {
      await interaction.reply({ ephemeral: true, content: 'Unsupported setup wizard selector.' });
      return;
    }

    const handled = await handleSetupWizardComponent(ctx, interaction, decoded);
    if (handled) {
      return;
    }
  }

  if (decoded.feature === 'checkin' && decoded.action === 'agreement_select') {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ ephemeral: true, content: 'Unsupported check-in selector.' });
      return;
    }

    const agreementKey = interaction.values[0];

    if (!interaction.guildId || !agreementKey) {
      await interaction.reply({ ephemeral: true, content: 'Malformed check-in selection payload.' });
      return;
    }

    const modal = buildCheckinSubmitModal(agreementKey);
    await interaction.showModal(modal as never);
    return;
  }

  if (decoded.feature === 'oracle' && (decoded.action === 'pick_mode' || decoded.action === 'pick_context')) {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ ephemeral: true, content: 'Unsupported oracle selector.' });
      return;
    }

    const selection = parseOracleSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({ ephemeral: true, content: 'Malformed oracle selection payload.' });
      return;
    }

    const selected = interaction.values[0];
    if (!selected) {
      await interaction.reply({ ephemeral: true, content: 'No selection value.' });
      return;
    }

    const nextMode = decoded.action === 'pick_mode'
      ? parseOracleMode(selected)
      : selection.mode;
    const nextContext = decoded.action === 'pick_context'
      ? parseOracleContext(selected)
      : selection.context;

    if (!nextMode || !nextContext) {
      await interaction.reply({ ephemeral: true, content: 'Invalid oracle selection option.' });
      return;
    }

    await interaction.update({
      content: 'Pick your mode and context, then press **Get privately**.',
      components: buildOracleClaimPicker({
        guildId: selection.guildId,
        weekStartDate: selection.weekStartDate,
        mode: nextMode,
        context: nextContext
      }) as never
    });
    return;
  }

  if (
    decoded.feature === 'date'
    && (decoded.action === 'pick_energy' || decoded.action === 'pick_budget' || decoded.action === 'pick_time')
  ) {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ ephemeral: true, content: 'Unsupported date selector.' });
      return;
    }

    const current = parseDateFilters(decoded.payload);
    if (!current) {
      await interaction.reply({ ephemeral: true, content: 'Malformed date selector payload.' });
      return;
    }

    const selected = interaction.values[0];
    if (!selected) {
      await interaction.reply({ ephemeral: true, content: 'No selection value.' });
      return;
    }

    const next: DateFilters = {
      energy: current.energy,
      budget: current.budget,
      timeWindow: current.timeWindow
    };

    if (decoded.action === 'pick_energy') {
      const parsed = parseDateEnergy(selected);
      if (!parsed) {
        await interaction.reply({ ephemeral: true, content: 'Invalid energy option.' });
        return;
      }
      next.energy = parsed;
    }

    if (decoded.action === 'pick_budget') {
      const parsed = parseDateBudget(selected);
      if (!parsed) {
        await interaction.reply({ ephemeral: true, content: 'Invalid budget option.' });
        return;
      }
      next.budget = parsed;
    }

    if (decoded.action === 'pick_time') {
      const parsed = parseDateTimeWindow(selected);
      if (!parsed) {
        await interaction.reply({ ephemeral: true, content: 'Invalid time option.' });
        return;
      }
      next.timeWindow = parsed;
    }

    await interaction.update({
      content: [
        'Pick your constraints, then press **Generate 3 ideas**.',
        formatDatePickerSummary(next)
      ].join('\n'),
      components: buildDateGeneratorPicker(next) as never
    });
    return;
  }

  await interaction.reply({ ephemeral: true, content: 'Unsupported select action.' });
}

export async function routeInteractionComponent(
  ctx: InteractionContext,
  interaction:
    | ButtonInteraction
    | ModalSubmitInteraction
    | StringSelectMenuInteraction
    | ChannelSelectMenuInteraction
    | RoleSelectMenuInteraction,
): Promise<void> {
  try {
    if (interaction.isButton()) {
      await handleButton(ctx, interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(ctx, interaction);
      return;
    }

    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
      await handleSelect(ctx, interaction);
    }
  } catch (error) {
    logger.error({ error, interaction_id: interaction.id }, 'Interaction component routing failed');

    if (interaction.deferred) {
      await interaction.editReply('Interaction failed. Please try again.');
      return;
    }

    if (!interaction.replied) {
      await interaction.reply({ ephemeral: true, content: 'Interaction failed. Please try again.' });
    }
  }
}


-----

## src/discord/projections/pairHomeRenderer.ts
-----
import {
  actionRowButtons,
  ButtonStyle,
  ComponentType,
  separator,
  textBlock,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';
import type { PairHomeSnapshot } from '../../app/services/pairHomeService';
import { encodeCustomId } from '../interactions/customId';

type PairHomeButton = {
  type: ComponentType.Button;
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger;
  custom_id: string;
  label: string;
};

function duelSummary(snapshot: PairHomeSnapshot): string {
  if (!snapshot.duel.active) {
    return 'Duel: no active duel.';
  }

  if (!snapshot.duel.roundNo) {
    return 'Duel: active, waiting for the next round.';
  }

  const endsPart = snapshot.duel.roundEndsAt
    ? ` - ends <t:${Math.floor(snapshot.duel.roundEndsAt.getTime() / 1000)}:R>`
    : '';

  const state = snapshot.duel.submittedThisRound ? 'submitted' : 'ready to submit';
  return `Duel round #${snapshot.duel.roundNo}: **${state}**${endsPart}`;
}

function duelButton(snapshot: PairHomeSnapshot): PairHomeButton | null {
  if (!snapshot.duel.active || !snapshot.duel.roundId || !snapshot.duel.duelId) {
    return null;
  }

  if (!snapshot.duel.submittedThisRound) {
    return {
      type: ComponentType.Button,
      style: ButtonStyle.Primary,
      custom_id: encodeCustomId({
        feature: 'duel',
        action: 'open_submit_modal',
        payload: {
          duelId: snapshot.duel.duelId,
          roundId: snapshot.duel.roundId,
          pairId: snapshot.pairId
        }
      }),
      label: 'Duel submit'
    };
  }

  return {
    type: ComponentType.Button,
    style: ButtonStyle.Secondary,
    custom_id: encodeCustomId({
      feature: 'pair_home',
      action: 'duel_info',
      payload: { p: snapshot.pairId }
    }),
    label: 'Duel submit'
  };
}

export function renderPairHomePanel(snapshot: PairHomeSnapshot): ComponentsV2Message {
  const checkinId = encodeCustomId({
    feature: 'pair_home',
    action: 'checkin',
    payload: {
      p: snapshot.pairId
    }
  });

  const raidId = encodeCustomId({
    feature: 'pair_home',
    action: 'raid',
    payload: {
      p: snapshot.pairId
    }
  });

  const raidLine = snapshot.raid.active
    ? `Raid points today: **${snapshot.raid.pointsToday}/${snapshot.raid.dailyCap}**`
    : 'Raid points today: no active raid.';

  const primaryButtons: PairHomeButton[] = [
    {
      type: ComponentType.Button,
      style: ButtonStyle.Secondary,
      custom_id: checkinId,
      label: 'Check-in'
    },
    {
      type: ComponentType.Button,
      style: ButtonStyle.Secondary,
      custom_id: raidId,
      label: 'Raid quests'
    }
  ];

  const duelCta = duelButton(snapshot);
  if (duelCta) {
    primaryButtons.push(duelCta);
  }

  return {
    components: [
      uiCard({
        title: 'Pair Home Panel',
        status: `${snapshot.user1Id} + ${snapshot.user2Id}`,
        accentColor: 0x4f8a3f,
        components: [
          textBlock(
            `Check-in this week (${snapshot.weekStartDate}): **${snapshot.checkinSubmitted ? 'submitted' : 'pending'}**\n${raidLine}\n${duelSummary(snapshot)}`,
          ),
          separator(),
          textBlock(`Updated: <t:${Math.floor(snapshot.updatedAt.getTime() / 1000)}:R>`),
          actionRowButtons(primaryButtons)
        ]
      })
    ]
  };
}


-----

## src/discord/projections/raidProgressRenderer.ts
-----
import {
  actionRowButtons,
  ButtonStyle,
  ComponentType,
  separator,
  textBlock,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';
import type { RaidProgressSnapshot } from '../../app/services/raidService';
import { encodeCustomId } from '../interactions/customId';

function completionPercent(snapshot: RaidProgressSnapshot): number {
  if (snapshot.goalPoints <= 0) {
    return 0;
  }

  return Math.min(100, Math.floor((snapshot.progressPoints / snapshot.goalPoints) * 100));
}

function phaseLabel(percent: number): string {
  if (percent >= 100) {
    return 'Goal reached';
  }

  if (percent >= 75) {
    return 'Final push';
  }

  if (percent >= 40) {
    return 'Mid raid';
  }

  if (percent > 0) {
    return 'Momentum building';
  }

  return 'Kickoff';
}

function topPairsText(snapshot: RaidProgressSnapshot): string {
  const rows = snapshot.topPairs.slice(0, 5);
  if (rows.length === 0) {
    return 'Top 5 (opt-in): no confirmed claims yet.';
  }

  return [
    'Top 5 (opt-in)',
    ...rows.map(
      (pair, idx) => `${idx + 1}. <@${pair.user1Id}> + <@${pair.user2Id}> - **${pair.points}** pts`,
    )
  ].join('\n');
}

export function renderRaidProgress(snapshot: RaidProgressSnapshot): ComponentsV2Message {
  const percent = completionPercent(snapshot);

  const takeTodayId = encodeCustomId({
    feature: 'raid_board',
    action: 'take_quests',
    payload: { r: snapshot.raidId }
  });

  const contributionId = encodeCustomId({
    feature: 'raid_board',
    action: 'my_contribution',
    payload: { r: snapshot.raidId }
  });

  const rulesId = encodeCustomId({
    feature: 'raid_board',
    action: 'rules',
    payload: { r: snapshot.raidId }
  });

  return {
    components: [
      uiCard({
        title: 'Cooperative Raid Progress',
        status: snapshot.status,
        accentColor: 0x1e6f9f,
        components: [
          textBlock(
            `Goal: **${snapshot.goalPoints}** pts\nProgress: **${snapshot.progressPoints}/${snapshot.goalPoints}** (${percent}%)\nPhase: **${phaseLabel(percent)}**`,
          ),
          separator(),
          textBlock(
            `Week: \`${snapshot.weekStartDate}\` - ends <t:${Math.floor(snapshot.weekEndAt.getTime() / 1000)}:R>\nParticipants: **${snapshot.participantsCount}**`,
          ),
          separator(),
          textBlock(topPairsText(snapshot)),
          separator(),
          textBlock(`Updated: <t:${Math.floor(snapshot.updatedAt.getTime() / 1000)}:R>`),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: takeTodayId,
              label: 'Take quests'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: contributionId,
              label: 'My contribution'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: rulesId,
              label: 'Rules'
            }
          ])
        ]
      })
    ]
  };
}

export function renderRaidProgressText(snapshot: RaidProgressSnapshot): string {
  const percent = completionPercent(snapshot);
  return [
    `Raid: \`${snapshot.raidId}\``,
    `Status: **${snapshot.status}**`,
    `Progress: **${snapshot.progressPoints}/${snapshot.goalPoints}** (${percent}%)`,
    `Participants: **${snapshot.participantsCount}**`
  ].join('\n');
}


-----

## src/discord/projections/scoreboardRenderer.ts
-----
import {
  actionRowButtons,
  ButtonStyle,
  ComponentType,
  separator,
  textBlock,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';
import type { DuelScoreboardSnapshot } from '../../app/services/duelService';
import { encodeCustomId } from '../interactions/customId';

function standingsLines(snapshot: DuelScoreboardSnapshot): string {
  const top = snapshot.topPairs.slice(0, 5);
  if (top.length === 0) {
    return 'Top 5: no submissions yet.';
  }

  const rows = top.map(
    (row, idx) => `${idx + 1}. <@${row.user1Id}> + <@${row.user2Id}> - **${row.points}** pts`,
  );
  return ['Top 5', ...rows].join('\n');
}

function roundStatus(snapshot: DuelScoreboardSnapshot): string {
  if (!snapshot.roundNo) {
    return 'Round: _not started_';
  }

  const endsAt = snapshot.roundEndsAt
    ? ` - ends <t:${Math.floor(snapshot.roundEndsAt.getTime() / 1000)}:R>`
    : '';

  return `Round #${snapshot.roundNo}: **${snapshot.roundStatus}**${endsAt}`;
}

export function renderDuelScoreboard(snapshot: DuelScoreboardSnapshot): ComponentsV2Message {
  const rulesId = encodeCustomId({
    feature: 'duel_board',
    action: 'rules',
    payload: { d: snapshot.duelId }
  });

  const participateId = encodeCustomId({
    feature: 'duel_board',
    action: 'how',
    payload: { d: snapshot.duelId }
  });

  const myRoomId = encodeCustomId({
    feature: 'duel_board',
    action: 'open_room',
    payload: { d: snapshot.duelId }
  });

  return {
    components: [
      uiCard({
        title: 'Butler Duel Scoreboard',
        status: snapshot.status,
        accentColor: 0xc44536,
        components: [
          textBlock(`${roundStatus(snapshot)}\nPairs tracked: **${snapshot.totalPairs}**`),
          separator(),
          textBlock(standingsLines(snapshot)),
          separator(),
          textBlock(
            `Submissions: **${snapshot.totalSubmissions}**\nUpdated: <t:${Math.floor(snapshot.updatedAt.getTime() / 1000)}:R>`,
          ),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: rulesId,
              label: 'Rules'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: participateId,
              label: 'How to participate'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: myRoomId,
              label: 'Open my room'
            }
          ])
        ]
      })
    ]
  };
}


-----

## src/index.ts
-----
import { env, assertRuntimeDiscordEnv } from './config/env';
import { logger } from './lib/logger';
import { initSentry, captureException } from './infra/sentry/sentry';
import { createQueueRuntime } from './infra/queue/boss';
import { createDiscordRuntime } from './discord/client';
import { ThrottledMessageEditor } from './discord/projections/messageEditor';
import { createHttpRuntime } from './http/server';
import { checkDbHealth, pgPool } from './infra/db/client';

assertRuntimeDiscordEnv(env);

initSentry();

const queueRuntime = createQueueRuntime({
  databaseUrl: env.DATABASE_URL
});

const discordRuntime = createDiscordRuntime({
  token: env.DISCORD_TOKEN,
  boss: queueRuntime.boss,
  allowedGuildIds: env.ALLOWED_GUILD_IDS
});
queueRuntime.setDiscordClient(discordRuntime.client);

const messageEditor = new ThrottledMessageEditor(discordRuntime.client, env.SCOREBOARD_EDIT_THROTTLE_SECONDS);
queueRuntime.setMessageEditor(messageEditor);

const httpRuntime = createHttpRuntime({
  isDiscordReady: discordRuntime.isReady,
  isBossReady: queueRuntime.isReady
});

let shuttingDown = false;

async function runStartupSelfCheck(): Promise<void> {
  const dbOk = await checkDbHealth();
  const bossOk = queueRuntime.isReady();
  const discordConnected = discordRuntime.isReady();
  const schedules = queueRuntime
    .getScheduleStatus()
    .map((schedule) => `${schedule.name}:${schedule.enabled ? 'enabled' : 'disabled'}`);

  logger.info(
    {
      feature: 'boot.self_check',
      discord: {
        connected: discordConnected,
        guild_count: discordRuntime.guildCount()
      },
      db: dbOk ? 'ok' : 'fail',
      boss: bossOk ? 'ok' : 'fail',
      schedules
    },
    'Startup self-check',
  );

  if (!dbOk || !bossOk || !discordConnected) {
    throw new Error('Startup self-check failed');
  }
}

async function start(): Promise<void> {
  await queueRuntime.start();
  await discordRuntime.login();
  await httpRuntime.start();
  await runStartupSelfCheck();

  logger.info({ feature: 'boot', node_env: env.NODE_ENV }, 'Application started');
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ feature: 'shutdown', signal }, 'Shutdown started');

  const failures: Array<{ step: string; error: unknown }> = [];

  const runStep = async (step: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      failures.push({ step, error });
      logger.error({ feature: 'shutdown', signal, step, error }, 'Shutdown step failed');
    }
  };

  await runStep('discord.destroy', async () => {
    await discordRuntime.destroy();
  });
  await runStep('boss.stop', async () => {
    await queueRuntime.stop();
  });
  await runStep('db.pool.end', async () => {
    await pgPool.end();
  });
  await runStep('http.stop', async () => {
    await httpRuntime.stop();
  });

  if (failures.length === 0) {
    logger.info({ feature: 'shutdown', signal }, 'Shutdown complete');
    process.exit(0);
    return;
  }

  logger.error({ feature: 'shutdown', signal, failed_steps: failures.map((failure) => failure.step) }, 'Shutdown failed');
  process.exit(1);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

start().catch((error) => {
  captureException(error, { feature: 'boot' });
  logger.error({ error }, 'Boot failure');
  void shutdown('BOOT_FAILURE');
});


-----

## src/infra/db/migrations/meta/_journal.json
-----
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    {
      "idx": 0,
      "version": "7",
      "when": 1739683200000,
      "tag": "0000_init",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "7",
      "when": 1771200000000,
      "tag": "0001_phase2_runtime",
      "breakpoints": true
    },
    {
      "idx": 2,
      "version": "7",
      "when": 1771286400000,
      "tag": "0002_step1_ui_v2",
      "breakpoints": true
    },
    {
      "idx": 3,
      "version": "7",
      "when": 1771372800000,
      "tag": "0003_step2_activities",
      "breakpoints": true
    },
    {
      "idx": 4,
      "version": "7",
      "when": 1771459200000,
      "tag": "0004_step3_stability",
      "breakpoints": true
    },
    {
      "idx": 5,
      "version": "7",
      "when": 1771545600000,
      "tag": "0005_final_hardening",
      "breakpoints": true
    }
  ]
}


-----

## src/infra/queue/boss.ts
-----
import { randomUUID } from 'node:crypto';
import type { Client } from 'discord.js';
import PgBoss from 'pg-boss';
import {
  AllJobNames,
  duelRoundClosePayloadSchema,
  duelScoreboardRefreshPayloadSchema,
  genericScheduledPayloadSchema,
  type JobName,
  JobNames,
  mediatorRepairTickPayloadSchema,
  monthlyHallRefreshPayloadSchema,
  pairHomeRefreshPayloadSchema,
  publicPostPublishPayloadSchema,
  raidProgressRefreshPayloadSchema
} from './jobs';
import { JOB_RETRY_DELAY_SECONDS, JOB_RETRY_LIMIT } from '../../config/constants';
import { logger } from '../../lib/logger';
import { captureException } from '../sentry/sentry';
import { duelCloseRoundUsecase } from '../../app/usecases/duelUsecases';
import { refreshDuelScoreboardProjection } from '../../discord/projections/scoreboard';
import type { ThrottledMessageEditor } from '../../discord/projections/messageEditor';
import { refreshRaidProgressProjection } from '../../discord/projections/raidProgress';
import { refreshPairHomeProjection } from '../../discord/projections/pairHome';
import { refreshWeeklyOracleProjection } from '../../discord/projections/oracleWeekly';
import { refreshMonthlyHallProjection } from '../../discord/projections/monthlyHall';
import { sendComponentsV2Message, textBlock, uiCard } from '../../discord/ui-v2';
import { configureRecurringSchedules, type RecurringScheduleStatus } from './scheduler';
import { publishDueScheduledPosts } from '../../app/services/publicPostService';
import { scheduleWeeklyCheckinNudges } from '../../app/services/checkinService';
import {
  endExpiredRaids,
  generateDailyRaidOffers,
  startWeeklyRaidsForConfiguredGuilds
} from '../../app/services/raidService';
import { runMediatorRepairTick } from '../../app/services/mediatorService';

type QueueRuntimeParams = {
  databaseUrl: string;
};

export type QueueRuntime = {
  boss: PgBoss;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isReady: () => boolean;
  getScheduleStatus: () => RecurringScheduleStatus[];
  setMessageEditor: (editor: ThrottledMessageEditor) => void;
  setDiscordClient: (client: Client) => void;
};

type PgErrorLike = {
  code?: string;
  message?: string;
};

function isQueueExistsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const parsed = error as PgErrorLike;

  if (parsed.code === '23505') {
    return true;
  }

  const message = parsed.message?.toLowerCase() ?? '';
  return message.includes('queue') && message.includes('already exists');
}

export async function ensureQueues(boss: PgBoss, jobNames: readonly JobName[]): Promise<void> {
  logger.info(
    { feature: 'queue', action: 'ensureQueues', queue_count: jobNames.length },
    'Ensuring pg-boss queues',
  );

  for (const name of jobNames) {
    try {
      await boss.createQueue(name);
    } catch (error) {
      if (isQueueExistsError(error)) {
        continue;
      }

      throw error;
    }
  }

  logger.info({ feature: 'queue', action: 'ensureQueues' }, 'pg-boss queues ensured');
}

export function createQueueRuntime(params: QueueRuntimeParams): QueueRuntime {
  const boss = new PgBoss({
    connectionString: params.databaseUrl,
    schema: 'public',
    migrate: true,
    retryLimit: JOB_RETRY_LIMIT,
    retryDelay: JOB_RETRY_DELAY_SECONDS,
    monitorStateIntervalSeconds: 15,
    maintenanceIntervalSeconds: 60
  });

  let ready = false;
  let scheduleStatus: RecurringScheduleStatus[] = [];
  let messageEditor: ThrottledMessageEditor | null = null;
  let discordClient: Client | null = null;

  async function registerHandlers(): Promise<void> {
    await boss.work(JobNames.DuelRoundClose, async (jobs) => {
      for (const job of jobs) {
        const parsed = duelRoundClosePayloadSchema.parse(job.data);
        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            correlation_id: parsed.correlationId,
            guild_id: parsed.guildId,
            interaction_id: parsed.interactionId,
            user_id: parsed.userId,
            job_id: job.id
          },
          'job started',
        );

        await duelCloseRoundUsecase({
          guildId: parsed.guildId,
          duelId: parsed.duelId,
          roundId: parsed.roundId,
          correlationId: parsed.correlationId,
          interactionId: parsed.interactionId,
          userId: parsed.userId,
          boss,
        });

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.DuelScoreboardRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = duelScoreboardRefreshPayloadSchema.parse(job.data);
        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            correlation_id: parsed.correlationId,
            guild_id: parsed.guildId,
            interaction_id: parsed.interactionId,
            user_id: parsed.userId,
            job_id: job.id
          },
          'job started',
        );

        if (!messageEditor) {
          throw new Error('Message editor not initialized');
        }

        await refreshDuelScoreboardProjection(parsed.duelId, messageEditor);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.RaidProgressRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = raidProgressRefreshPayloadSchema.parse(job.data);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        if (!messageEditor) {
          throw new Error('Message editor not initialized');
        }

        await refreshRaidProgressProjection(messageEditor, parsed.raidId);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.PairHomeRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = pairHomeRefreshPayloadSchema.parse(job.data);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');

        if (!messageEditor) {
          throw new Error('Message editor not initialized');
        }

        if (!discordClient) {
          throw new Error('Discord client not initialized');
        }

        await refreshPairHomeProjection({
          pairId: parsed.pairId,
          messageEditor,
          client: discordClient
        });
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.MonthlyHallRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = monthlyHallRefreshPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.MonthlyHallRefresh,
            action: 'tick'
          },
        );

        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            job_id: job.id,
            month_key: parsed.monthKey ?? null
          },
          'job started',
        );

        if (!messageEditor) {
          throw new Error('Message editor not initialized for monthly hall refresh');
        }

        if (!discordClient) {
          throw new Error('Discord client not initialized for monthly hall refresh');
        }

        const refreshed = await refreshMonthlyHallProjection({
          client: discordClient,
          messageEditor,
          monthKey: parsed.monthKey
        });

        if (refreshed.failed > 0) {
          logger.warn(
            {
              feature: parsed.feature,
              action: parsed.action,
              job_id: job.id,
              processed: refreshed.processed,
              created: refreshed.created,
              updated: refreshed.updated,
              failed: refreshed.failed
            },
            'monthly hall refresh had failures',
          );
          throw new Error(`Monthly hall refresh failed for ${refreshed.failed} guild(s)`);
        }

        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            job_id: job.id,
            processed: refreshed.processed,
            created: refreshed.created,
            updated: refreshed.updated,
            failed: refreshed.failed
          },
          'job completed',
        );
      }
    });

    await boss.work(JobNames.MediatorRepairTick, async (jobs) => {
      for (const job of jobs) {
        const parsed = mediatorRepairTickPayloadSchema.parse(job.data);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');

        if (!discordClient) {
          throw new Error('Discord client not initialized for mediator repair tick');
        }

        await runMediatorRepairTick({
          guildId: parsed.guildId,
          sessionId: parsed.sessionId,
          stepNumber: parsed.stepNumber,
          client: discordClient
        });

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.PublicPostPublish, async (jobs) => {
      for (const job of jobs) {
        const parsed = publicPostPublishPayloadSchema.parse(job.data);
        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            guild_id: parsed.guildId,
            job_id: job.id,
            scheduled_post_id: parsed.scheduledPostId ?? null
          },
          'job started',
        );

        if (!discordClient) {
          throw new Error('Discord client not initialized for public post publish');
        }

        const result = await publishDueScheduledPosts({
          client: discordClient,
          scheduledPostId: parsed.scheduledPostId,
          limit: 20
        });

        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            guild_id: parsed.guildId,
            job_id: job.id,
            processed: result.processed,
            sent: result.sent,
            failed: result.failed,
            skipped: result.skipped
          },
          'job completed',
        );
      }
    });

    await boss.work(JobNames.WeeklyOraclePublish, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyOraclePublish,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');

        if (!messageEditor) {
          throw new Error('Message editor not initialized for weekly oracle publish');
        }

        if (!discordClient) {
          throw new Error('Discord client not initialized for weekly oracle publish');
        }

        const refreshed = await refreshWeeklyOracleProjection({
          client: discordClient,
          messageEditor,
          weekStartDate: parsed.weekStartDate,
          guildId: parsed.guildId === 'scheduler' ? undefined : parsed.guildId
        });

        if (refreshed.failed > 0) {
          throw new Error(`Weekly oracle refresh failed for ${refreshed.failed} guild(s)`);
        }

        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            job_id: job.id,
            processed: refreshed.processed,
            created: refreshed.created,
            updated: refreshed.updated,
            failed: refreshed.failed
          },
          'job completed',
        );
      }
    });

    await boss.work(JobNames.WeeklyCheckinNudge, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyCheckinNudge,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const created = await scheduleWeeklyCheckinNudges();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, created }, 'job completed');
      }
    });

    await boss.work(JobNames.WeeklyRaidStart, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyRaidStart,
            action: 'tick'
          },
        );

        const readyClient = discordClient;
        if (!readyClient) {
          throw new Error('Discord client not initialized for weekly raid start');
        }

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const created = await startWeeklyRaidsForConfiguredGuilds({
          boss,
          correlationId: parsed.correlationId,
          createProgressMessage: async ({ channelId, content }) => {
            const sent = await sendComponentsV2Message(readyClient, channelId, {
              components: [
                uiCard({
                  title: 'Cooperative Raid Progress',
                  status: 'initializing',
                  accentColor: 0x1e6f9f,
                  components: [textBlock(content)]
                })
              ]
            });
            return sent.id;
          }
        });
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, created }, 'job completed');
      }
    });

    await boss.work(JobNames.WeeklyRaidEnd, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyRaidEnd,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const ended = await endExpiredRaids(new Date(), {
          boss,
          correlationId: parsed.correlationId
        });
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, ended }, 'job completed');
      }
    });

    await boss.work(JobNames.DailyRaidOffersGenerate, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.DailyRaidOffersGenerate,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const generated = await generateDailyRaidOffers();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, generated }, 'job completed');
      }
    });
  }

  boss.on('error', (error) => {
    logger.error({ error, feature: 'queue' }, 'pg-boss error');
    captureException(error, { feature: 'queue' });
  });

  return {
    boss,
    setMessageEditor(editor) {
      messageEditor = editor;
    },
    setDiscordClient(client) {
      discordClient = client;
    },
    async start() {
      try {
        await boss.start();
        await ensureQueues(boss, AllJobNames);
        await registerHandlers();
        scheduleStatus = await configureRecurringSchedules(boss);
        ready = true;
        logger.info({ feature: 'queue' }, 'pg-boss started');
      } catch (error) {
        ready = false;
        scheduleStatus = [];
        captureException(error, { feature: 'queue.start' });
        throw error;
      }
    },
    async stop() {
      ready = false;
      scheduleStatus = [];
      await boss.stop();
      logger.info({ feature: 'queue' }, 'pg-boss stopped');
    },
    isReady() {
      return ready;
    },
    getScheduleStatus() {
      return [...scheduleStatus];
    }
  };
}


-----

## src/infra/queue/scheduler.ts
-----
import type PgBoss from 'pg-boss';
import type { FeatureFlagKey } from '../../config/featureFlags';
import { isFeatureEnabled } from '../../config/featureFlags';
import { logger } from '../../lib/logger';
import { type JobName, JobNames } from './jobs';

function schedulerPayload(feature: string, action: string) {
  return {
    correlationId: '00000000-0000-0000-0000-000000000000',
    guildId: 'scheduler',
    feature,
    action
  };
}

type RecurringScheduleDefinition = {
  name: JobName;
  cron: string;
  payloadFeature: string;
  payloadAction: string;
  featureFlag?: FeatureFlagKey;
};

export type RecurringScheduleStatus = {
  name: JobName;
  cron: string;
  enabled: boolean;
};

const recurringScheduleDefinitions: readonly RecurringScheduleDefinition[] = [
  {
    name: JobNames.WeeklyOraclePublish,
    cron: '0 10 * * 1',
    payloadFeature: 'oracle',
    payloadAction: 'weekly_publish',
    featureFlag: 'oracle'
  },
  {
    name: JobNames.WeeklyCheckinNudge,
    cron: '0 12 * * 3',
    payloadFeature: 'checkin',
    payloadAction: 'weekly_nudge',
    featureFlag: 'checkin'
  },
  {
    name: JobNames.WeeklyRaidStart,
    cron: '0 9 * * 1',
    payloadFeature: 'raid',
    payloadAction: 'weekly_start',
    featureFlag: 'raid'
  },
  {
    name: JobNames.WeeklyRaidEnd,
    cron: '5 9 * * 1',
    payloadFeature: 'raid',
    payloadAction: 'weekly_end',
    featureFlag: 'raid'
  },
  {
    name: JobNames.DailyRaidOffersGenerate,
    cron: '0 9 * * *',
    payloadFeature: 'raid',
    payloadAction: 'daily_offers_generate',
    featureFlag: 'raid'
  },
  {
    name: JobNames.RaidProgressRefresh,
    cron: '*/10 * * * *',
    payloadFeature: 'raid',
    payloadAction: 'progress_refresh',
    featureFlag: 'raid'
  },
  {
    name: JobNames.MonthlyHallRefresh,
    cron: '0 10 1 * *',
    payloadFeature: 'monthly_hall',
    payloadAction: 'refresh'
  },
  {
    name: JobNames.PublicPostPublish,
    cron: '*/2 * * * *',
    payloadFeature: 'public_post',
    payloadAction: 'publish_pending'
  }
] as const;

function isScheduleEnabled(definition: RecurringScheduleDefinition): boolean {
  return definition.featureFlag ? isFeatureEnabled(definition.featureFlag) : true;
}

export function listRecurringScheduleStatus(): RecurringScheduleStatus[] {
  return recurringScheduleDefinitions.map((definition) => ({
    name: definition.name,
    cron: definition.cron,
    enabled: isScheduleEnabled(definition)
  }));
}

export async function configureRecurringSchedules(boss: PgBoss): Promise<RecurringScheduleStatus[]> {
  const statuses = listRecurringScheduleStatus();
  const enabledNames: string[] = [];
  const disabledNames: string[] = [];

  for (const definition of recurringScheduleDefinitions) {
    if (isScheduleEnabled(definition)) {
      await boss.schedule(
        definition.name,
        definition.cron,
        schedulerPayload(definition.payloadFeature, definition.payloadAction),
      );
      enabledNames.push(definition.name);
      continue;
    }

    try {
      await boss.unschedule(definition.name);
    } catch (error) {
      logger.debug(
        {
          feature: 'queue.scheduler',
          schedule: definition.name,
          error
        },
        'Unable to unschedule disabled recurring job',
      );
    }
    disabledNames.push(definition.name);
  }

  logger.info(
    {
      feature: 'queue.scheduler',
      enabled_schedules: enabledNames,
      disabled_schedules: disabledNames
    },
    'Recurring schedules configured',
  );

  return statuses;
}


-----

## tests/app/env.test.ts
-----
import { beforeEach, describe, expect, it, vi } from 'vitest';

function setBaseEnv() {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'info';
  process.env.DATABASE_URL = 'https://example.com';
  process.env.DISCORD_TOKEN = '';
  process.env.DISCORD_APP_ID = '';
  process.env.DISCORD_GUILD_ID = '';
  process.env.ALLOWED_GUILD_IDS = '';
  process.env.SENTRY_DSN = '';
  process.env.TZ = 'Asia/Almaty';
  process.env.DEFAULT_TIMEZONE = 'Asia/Almaty';
  process.env.PHASE2_ORACLE_ENABLED = 'false';
  process.env.PHASE2_CHECKIN_ENABLED = 'false';
  process.env.PHASE2_ANON_ENABLED = 'false';
  process.env.PHASE2_REWARDS_ENABLED = 'false';
  process.env.PHASE2_SEASONS_ENABLED = 'false';
  process.env.PHASE2_RAID_ENABLED = 'false';
  process.env.SCOREBOARD_EDIT_THROTTLE_SECONDS = '12';
  process.env.RAID_PROGRESS_EDIT_THROTTLE_SECONDS = '15';
}

describe('env parsing', () => {
  beforeEach(() => {
    vi.resetModules();
    setBaseEnv();
  });

  it('parses valid environment', async () => {
    const module = await import('../../src/config/env');
    expect(module.env.NODE_ENV).toBe('test');
    expect(module.env.DEFAULT_TIMEZONE).toBe('Asia/Almaty');
    expect(module.env.DISCORD_GUILD_ID).toBeUndefined();
    expect(module.env.ALLOWED_GUILD_IDS).toBeUndefined();
    expect(module.env.SENTRY_DSN).toBeUndefined();
  });

  it('parses allowed guild csv when configured', async () => {
    process.env.ALLOWED_GUILD_IDS = '123456789012345678, 987654321098765432';
    const module = await import('../../src/config/env');
    expect(module.env.ALLOWED_GUILD_IDS).toEqual(['123456789012345678', '987654321098765432']);
  });
});


-----

## docs/OPS_RUNBOOKS.md
-----
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

Weekly oracle dashboard:
```powershell
pnpm tsx -e "import { randomUUID } from 'node:crypto'; import PgBoss from 'pg-boss'; import { env } from './src/config/env'; const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'public', migrate: false }); await boss.start(); await boss.send('weekly.oracle.publish', { correlationId: randomUUID(), guildId: '<guild_id>', feature: 'oracle', action: 'manual_publish' }); await boss.stop();"
```

Monthly hall dashboard:
```powershell
pnpm tsx -e "import { randomUUID } from 'node:crypto'; import PgBoss from 'pg-boss'; import { env } from './src/config/env'; const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'public', migrate: false }); await boss.start(); await boss.send('monthly.hall.refresh', { correlationId: randomUUID(), guildId: '<guild_id>', feature: 'monthly_hall', action: 'manual_refresh' }); await boss.stop();"
```


-----

## docs/RELEASE_CHECKLIST.md
-----
# Release Checklist

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
- `PHASE2_ORACLE_ENABLED=true`
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
- [ ] `pnpm discord:deploy-commands`

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
- [ ] Manual smoke path from `docs/SMOKE_TEST.md` passed.
- [ ] Server setup checklist from `docs/SERVER_SETUP_CHECKLIST.md` completed.


-----

## docs/SERVER_SETUP_CHECKLIST.md
-----
# Server Setup Checklist

## 1) Invite and intents
- [ ] Invite with scopes: `bot` + `applications.commands`.
- [ ] Bot intents in Discord Developer Portal: enable `Guilds` only.
- [ ] `Message Content` intent is disabled.

Invite URL template:
`https://discord.com/oauth2/authorize?client_id=<DISCORD_APP_ID>&scope=bot%20applications.commands&permissions=241629797440`

## 2) Required bot permissions
- [ ] View Channels
- [ ] Send Messages
- [ ] Read Message History
- [ ] Manage Channels
- [ ] Embed Links
- [ ] Use Application Commands

## 3) Role and channel safety
- [ ] Bot role is above any role restrictions that must not block posting in configured channels.
- [ ] Optional moderator role exists (if you want `/anon queue` and `/pair create` delegation).
- [ ] Moderator role is not higher than server admins.

## 4) Create channels before `/setup`
- [ ] Duel public channel
- [ ] Weekly oracle channel
- [ ] Anonymous questions channel
- [ ] Raid public channel
- [ ] Monthly hall channel

## 5) Run setup wizard
- [ ] Run `/setup` as admin.
- [ ] Pick channels via Channel Select menus (no manual IDs).
- [ ] Pick optional moderator role via Role Select.
- [ ] Press `Save`.
- [ ] Press `Test Post` and confirm a post appears in one configured channel.

## 6) Minimal feature wiring check
- [ ] `/pair create @user` creates private pair room.
- [ ] Pair room has exactly one Pair Home panel message.
- [ ] Public dashboards exist as single editable messages (duel, raid, oracle, monthly hall).
- [ ] `/anon queue` is accessible only to admin/mod role.

## 7) First-run safety
- [ ] If `ALLOWED_GUILD_IDS` is set, confirm this guild ID is included.
- [ ] Verify startup self-check log appears after boot.
- [ ] Verify `/healthz` is green before onboarding users.


-----

## docs/SMOKE_TEST.md
-----
# Smoke Test

Run this after deploy, in one test guild, with two human test accounts (`UserA`, `UserB`) and one admin/mod account.

## 0) Runtime smoke
1. `pnpm smoke`
Expected:
- Environment schema prints OK.
- Database connection prints OK.
- pg-boss ping prints OK.
- Schedule list prints runtime `enabled`/`disabled` and DB `present`/`missing`.

2. `GET /healthz`
Expected:
- `ok: true`
- `db: "ok"`
- `discord: "ready"`
- `boss: "ok"`

## 1) Discord command smoke (ordered)
1. `/setup`
Expected:
- Ephemeral Setup Wizard card with Channel Select and Role Select controls.

2. In `/setup` panel, select all required channels and optional moderator role, then press `Save` and `Test Post`.
Expected:
- `Guild settings saved.`
- `Test post queued...` and a post appears in configured channel.

3. `/pair create user:@UserB` (run by admin/mod)
Expected:
- Private pair room created (or reused).
- Exactly one Pair Home panel message appears in the pair room.

4. In pair room, `/pair room` from `UserA` and `UserB`.
Expected:
- Both get the same room reference.

5. `/duel start public_channel:#duel-channel`
Expected:
- Duel scoreboard message exists as one public dashboard message.

6. `/duel round start duration_minutes:10`
Expected:
- Pair room gets duel round notification with submit button.
- Pair Home panel updates and shows `Duel submit` button.

7. `UserA` clicks `Duel submit` from Pair Home and submits modal.
Expected:
- Ephemeral confirmation.
- Scoreboard message edits in place (no new message).

8. `/raid start channel:#raid-channel`
Expected:
- Raid progress dashboard message exists as one public dashboard message.
- Pair Home panel refreshes with raid daily points line.

9. In raid dashboard, click `Take quests`, claim one quest, then partner confirms in pair room.
Expected:
- Confirmation succeeds.
- Raid dashboard edits in place.
- Pair Home panel edits in place with updated raid points.

10. `/oracle publish-now` (admin/mod)
Expected:
- Weekly oracle dashboard exists as one message in oracle channel.
- Re-running command edits same message (no extra post).

11. In weekly oracle dashboard, click `Get privately`.
Expected:
- Ephemeral picker with Mode + Context selects.
- After submit, delivery message indicates DM or pair-room fallback.

12. `/checkin start` inside pair room.
Expected:
- Agreement select appears.
- Submit modal accepts 5 scores.
- Pair Home panel edits in place to submitted check-in status.

13. `/anon ask` from normal user, then `/anon queue` from admin/mod.
Expected:
- Queue is pageable (`Prev`/`Next`) and admin-only.
- Approve/reject updates queue message cleanly and returns ephemeral moderation feedback.

14. `/hall status`, then `/hall optin category:all`, then `/hall status`.
Expected:
- Opt-in status reflects updates correctly.

## Pass criteria
- No interaction timeout errors.
- No dashboard spam (single-message edit behavior preserved).
- No permission bypass for admin/mod-only flows.
- `/healthz` remains healthy throughout.


-----

## scripts/smoke.ts
-----
import PgBoss from 'pg-boss';
import { env } from '../src/config/env';
import { checkDbHealth, pgPool } from '../src/infra/db/client';
import { listRecurringScheduleStatus } from '../src/infra/queue/scheduler';

type ScheduleRow = {
  name: string;
  cron: string;
};

async function loadPersistedSchedules(): Promise<{ table: string; rows: ScheduleRow[] }> {
  const candidates = ['public.schedule', 'pgboss.schedule'];

  for (const table of candidates) {
    try {
      const result = await pgPool.query<ScheduleRow>(`select name, cron from ${table} order by name`);
      return {
        table,
        rows: result.rows
      };
    } catch {
      // Try the next candidate schema.
    }
  }

  return {
    table: 'not_found',
    rows: []
  };
}

async function main(): Promise<void> {
  console.log('1) Environment schema: OK');
  console.log(`   NODE_ENV=${env.NODE_ENV}`);

  const dbOk = await checkDbHealth();
  if (!dbOk) {
    throw new Error('Database health check failed');
  }
  console.log('2) Database connection: OK');

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'public',
    migrate: false
  });

  await boss.start();
  console.log('3) pg-boss ping: OK (start/stop successful)');
  await boss.stop();

  const configured = listRecurringScheduleStatus();
  const persisted = await loadPersistedSchedules();
  const persistedByName = new Map(persisted.rows.map((row) => [row.name, row]));

  console.log('4) Recurring schedule status:');
  console.log(`   persisted_table=${persisted.table}`);

  for (const schedule of configured) {
    const persistedRow = persistedByName.get(schedule.name);
    const runtime = schedule.enabled ? 'enabled' : 'disabled';
    const dbState = persistedRow ? 'present' : 'missing';
    const cron = persistedRow?.cron ?? schedule.cron;
    console.log(`   - ${schedule.name} | runtime=${runtime} | db=${dbState} | cron=${cron}`);
  }

  await pgPool.end();
}

main().catch(async (error) => {
  console.error('Smoke script failed:', error);
  try {
    await pgPool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});


-----

## src/discord/interactions/anonQueueView.ts
-----
import { listPendingAnonQuestionsPage } from '../../app/services/anonService';
import { buildAnonModerationButtons, buildAnonQueuePaginationButtons } from './components';

const DEFAULT_PAGE_SIZE = 3;

export type AnonQueueView = {
  content: string;
  components: Array<ReturnType<typeof buildAnonModerationButtons> | ReturnType<typeof buildAnonQueuePaginationButtons>>;
  page: number;
  totalPages: number;
  total: number;
};

export async function buildAnonQueueView(guildId: string, page: number, pageSize = DEFAULT_PAGE_SIZE): Promise<AnonQueueView> {
  const safePageSize = Math.max(1, Math.min(5, pageSize));
  const requestedPage = Math.max(0, page);

  const firstPass = await listPendingAnonQuestionsPage(guildId, {
    limit: safePageSize,
    offset: requestedPage * safePageSize
  });

  if (firstPass.total === 0) {
    return {
      content: 'No pending anonymous questions.',
      components: [],
      page: 0,
      totalPages: 1,
      total: 0
    };
  }

  const totalPages = Math.max(1, Math.ceil(firstPass.total / safePageSize));
  const pageIndex = Math.min(requestedPage, totalPages - 1);

  const pageResult = pageIndex === requestedPage
    ? firstPass
    : await listPendingAnonQuestionsPage(guildId, {
        limit: safePageSize,
        offset: pageIndex * safePageSize
      });

  const lines = pageResult.rows.map((row, idx) => {
    const itemNo = pageIndex * safePageSize + idx + 1;
    return `${itemNo}. \`${row.id}\`\n${row.questionText}`;
  });

  const components: Array<ReturnType<typeof buildAnonModerationButtons> | ReturnType<typeof buildAnonQueuePaginationButtons>> =
    pageResult.rows.map((row) => buildAnonModerationButtons(row.id));

  if (totalPages > 1) {
    components.push(
      buildAnonQueuePaginationButtons({
        page: pageIndex,
        totalPages
      }),
    );
  }

  return {
    content: `Pending questions (${pageResult.total})\n\n${lines.join('\n\n')}`,
    components,
    page: pageIndex,
    totalPages,
    total: pageResult.total
  };
}


-----

## src/discord/projections/oracleWeekly.ts
-----
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Client } from 'discord.js';
import { ensureOracleWeek } from '../../app/services/oracleService';
import { startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import { guildSettings } from '../../infra/db/schema';
import { logger } from '../../lib/logger';
import { renderWeeklyOraclePost } from './oracleWeeklyRenderer';
import type { ThrottledMessageEditor } from './messageEditor';
import { COMPONENTS_V2_FLAGS, sendComponentsV2Message } from '../ui-v2';
import { getDiscordErrorStatus, withDiscordApiRetry } from './discordApiRetry';
import { Routes } from '../ui-v2/api';

export type WeeklyOracleRefreshStats = {
  processed: number;
  created: number;
  updated: number;
  failed: number;
};

async function clearOracleMessageId(guildId: string): Promise<void> {
  await db.execute(sql`
    update guild_settings
    set oracle_message_id = null, updated_at = now()
    where guild_id = ${guildId}
  `);
}

async function setOracleMessageIdIfUnset(input: {
  guildId: string;
  messageId: string;
}): Promise<boolean> {
  const updated = await db.execute<{ guild_id: string }>(sql`
    update guild_settings
    set oracle_message_id = ${input.messageId}, updated_at = now()
    where guild_id = ${input.guildId}
      and oracle_message_id is null
    returning guild_id
  `);

  return updated.rows.length > 0;
}

async function deleteMessageBestEffort(client: Client, channelId: string, messageId: string): Promise<void> {
  try {
    await withDiscordApiRetry({
      feature: 'oracle_weekly',
      action: 'delete_duplicate',
      maxAttempts: 3,
      baseDelayMs: 300,
      context: {
        channel_id: channelId,
        message_id: messageId
      },
      execute: async () => {
        await client.rest.delete(Routes.channelMessage(channelId, messageId));
      }
    });
  } catch {
    logger.warn(
      {
        feature: 'oracle_weekly',
        channel_id: channelId,
        message_id: messageId
      },
      'Failed to delete duplicate weekly oracle message',
    );
  }
}

export async function refreshWeeklyOracleProjection(input: {
  client: Client;
  messageEditor: ThrottledMessageEditor;
  weekStartDate?: string;
  guildId?: string;
  now?: Date;
}): Promise<WeeklyOracleRefreshStats> {
  const weekStartDate = input.weekStartDate ?? startOfWeekIso(input.now ?? new Date());

  const rows = input.guildId
    ? await db
        .select({
          guildId: guildSettings.guildId,
          oracleChannelId: guildSettings.oracleChannelId,
          oracleMessageId: sql<string | null>`oracle_message_id`
        })
        .from(guildSettings)
        .where(and(eq(guildSettings.guildId, input.guildId), isNotNull(guildSettings.oracleChannelId)))
    : await db
        .select({
          guildId: guildSettings.guildId,
          oracleChannelId: guildSettings.oracleChannelId,
          oracleMessageId: sql<string | null>`oracle_message_id`
        })
        .from(guildSettings)
        .where(isNotNull(guildSettings.oracleChannelId));

  let processed = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    const channelId = row.oracleChannelId;
    if (!channelId) {
      continue;
    }

    processed += 1;

    try {
      await ensureOracleWeek(row.guildId, weekStartDate);
      const view = renderWeeklyOraclePost({
        guildId: row.guildId,
        weekStartDate
      });

      if (row.oracleMessageId) {
        try {
          await input.messageEditor.queueEdit({
            channelId,
            messageId: row.oracleMessageId,
            content: view.content ?? null,
            components: view.components,
            flags: COMPONENTS_V2_FLAGS
          });
          updated += 1;
          continue;
        } catch (error) {
          if (getDiscordErrorStatus(error) !== 404) {
            throw error;
          }

          await clearOracleMessageId(row.guildId);
        }
      }

      const createdMessage = await sendComponentsV2Message(input.client, channelId, view);
      const claimed = await setOracleMessageIdIfUnset({
        guildId: row.guildId,
        messageId: createdMessage.id
      });

      if (claimed) {
        created += 1;
        continue;
      }

      const latestRows = await db
        .select({
          oracleMessageId: sql<string | null>`oracle_message_id`,
          oracleChannelId: guildSettings.oracleChannelId
        })
        .from(guildSettings)
        .where(eq(guildSettings.guildId, row.guildId))
        .limit(1);

      const latest = latestRows[0];
      if (latest?.oracleMessageId) {
        await input.messageEditor.queueEdit({
          channelId: latest.oracleChannelId ?? channelId,
          messageId: latest.oracleMessageId,
          content: view.content ?? null,
          components: view.components,
          flags: COMPONENTS_V2_FLAGS
        });
        updated += 1;
      } else {
        created += 1;
      }

      if (latest?.oracleMessageId !== createdMessage.id) {
        await deleteMessageBestEffort(input.client, channelId, createdMessage.id);
      }
    } catch (error) {
      failed += 1;
      logger.error(
        {
          feature: 'oracle_weekly',
          guild_id: row.guildId,
          week_start_date: weekStartDate,
          error
        },
        'Weekly oracle projection refresh failed',
      );
    }
  }

  return {
    processed,
    created,
    updated,
    failed
  };
}


-----

## src/infra/db/migrations/0005_final_hardening.sql
-----
ALTER TABLE "guild_settings"
  ADD COLUMN IF NOT EXISTS "oracle_message_id" varchar(32);

CREATE INDEX IF NOT EXISTS "pairs_guild_created_idx"
  ON "pairs" ("guild_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "raid_claims_raid_day_status_idx"
  ON "raid_claims" ("raid_id", "day_date", "status");

CREATE INDEX IF NOT EXISTS "checkins_week_pair_idx"
  ON "checkins" ("week_start_date", "pair_id");

CREATE INDEX IF NOT EXISTS "scheduled_posts_due_status_idx"
  ON "scheduled_posts" ("status", "scheduled_for")
  WHERE "status" IN ('pending', 'processing');


-----

