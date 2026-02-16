import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar
} from 'drizzle-orm/pg-core';

export const guildSettings = pgTable('guild_settings', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Almaty'),
  horoscopeChannelId: varchar('horoscope_channel_id', { length: 32 }),
  questionsChannelId: varchar('questions_channel_id', { length: 32 }),
  raidChannelId: varchar('raid_channel_id', { length: 32 }),
  duelPublicChannelId: varchar('duel_public_channel_id', { length: 32 }),
  moderatorRoleId: varchar('moderator_role_id', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable('users', {
  userId: varchar('user_id', { length: 32 }).primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const pairs = pgTable(
  'pairs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    user1Id: varchar('user1_id', { length: 32 }).notNull(),
    user2Id: varchar('user2_id', { length: 32 }).notNull(),
    userLow: varchar('user_low', { length: 32 }).notNull(),
    userHigh: varchar('user_high', { length: 32 }).notNull(),
    privateChannelId: varchar('private_channel_id', { length: 32 }).notNull(),
    pairHomeMessageId: varchar('pair_home_message_id', { length: 32 }),
    pairHomePinnedAt: timestamp('pair_home_pinned_at', { withTimezone: true }),
    pairHomePinAttemptedAt: timestamp('pair_home_pin_attempted_at', { withTimezone: true }),
    status: varchar('status', { length: 24 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    guildUsersUnique: unique('pairs_guild_user_low_user_high_uq').on(
      table.guildId,
      table.userLow,
      table.userHigh,
    )
  }),
);

export const duels = pgTable('duels', {
  id: varchar('id', { length: 36 }).primaryKey(),
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('active'),
  publicChannelId: varchar('public_channel_id', { length: 32 }).notNull(),
  scoreboardMessageId: varchar('scoreboard_message_id', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const duelRounds = pgTable(
  'duel_rounds',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    duelId: varchar('duel_id', { length: 36 }).notNull(),
    roundNo: integer('round_no').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true })
  },
  (table) => ({
    duelRoundUnique: unique('duel_rounds_duel_round_no_uq').on(table.duelId, table.roundNo)
  }),
);

export const duelSubmissions = pgTable(
  'duel_submissions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    roundId: varchar('round_id', { length: 36 }).notNull(),
    pairId: varchar('pair_id', { length: 36 }).notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    roundPairUnique: unique('duel_submissions_round_pair_uq').on(table.roundId, table.pairId)
  }),
);

export const scheduledPosts = pgTable('scheduled_posts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  targetChannelId: varchar('target_channel_id', { length: 32 }).notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('pending'),
  idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  publishedMessageId: varchar('published_message_id', { length: 32 }),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const opDedup = pgTable('op_dedup', {
  operationKey: varchar('operation_key', { length: 200 }).primaryKey(),
  payloadHash: varchar('payload_hash', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const commandRateLimits = pgTable(
  'command_rate_limits',
  {
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    actionKey: varchar('action_key', { length: 64 }).notNull(),
    dayDate: text('day_date').notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({
      name: 'command_rate_limits_pk',
      columns: [table.guildId, table.userId, table.actionKey, table.dayDate]
    })
  }),
);

export const contentHoroscopeArchetypes = pgTable('content_horoscope_archetypes', {
  key: varchar('key', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 100 }).notNull(),
  variantsJson: jsonb('variants_json').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const horoscopeWeeks = pgTable(
  'horoscope_weeks',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    weekStartDate: text('week_start_date').notNull(),
    archetypeKey: varchar('archetype_key', { length: 64 }).notNull(),
    seed: integer('seed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueWeek: unique('horoscope_weeks_guild_week_uq').on(table.guildId, table.weekStartDate)
  }),
);

export const horoscopeClaims = pgTable(
  'horoscope_claims',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    weekStartDate: text('week_start_date').notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    pairId: varchar('pair_id', { length: 36 }),
    deliveredTo: varchar('delivered_to', { length: 32 }).notNull(),
    mode: varchar('mode', { length: 16 }),
    context: varchar('context', { length: 24 }),
    claimText: varchar('claim_text', { length: 600 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueClaim: unique('horoscope_claims_guild_week_user_uq').on(
      table.guildId,
      table.weekStartDate,
      table.userId,
    )
  }),
);

export const agreementsLibrary = pgTable('agreements_library', {
  key: varchar('key', { length: 64 }).primaryKey(),
  text: varchar('text', { length: 240 }).notNull(),
  tagsJson: jsonb('tags_json').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const checkins = pgTable(
  'checkins',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    pairId: varchar('pair_id', { length: 36 }).notNull(),
    weekStartDate: text('week_start_date').notNull(),
    scoresJson: jsonb('scores_json').notNull(),
    agreementKey: varchar('agreement_key', { length: 64 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('submitted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueCheckin: unique('checkins_pair_week_uq').on(table.pairId, table.weekStartDate)
  }),
);

export const anonQuestions = pgTable('anon_questions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  authorUserId: varchar('author_user_id', { length: 32 }).notNull(),
  questionText: varchar('question_text', { length: 400 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('pending'),
  publishedMessageId: varchar('published_message_id', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  approvedBy: varchar('approved_by', { length: 32 }),
  approvedAt: timestamp('approved_at', { withTimezone: true })
});

export const rewardsLedger = pgTable(
  'rewards_ledger',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    pairId: varchar('pair_id', { length: 36 }),
    kind: varchar('kind', { length: 24 }).notNull(),
    amount: integer('amount').notNull(),
    key: varchar('key', { length: 64 }).notNull(),
    sourceType: varchar('source_type', { length: 64 }).notNull(),
    sourceId: varchar('source_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueAward: unique('rewards_ledger_dedupe_uq').on(
      table.kind,
      table.key,
      table.sourceType,
      table.sourceId,
      table.userId,
    )
  }),
);

export const progressState = pgTable(
  'progress_state',
  {
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    pairId: varchar('pair_id', { length: 36 }),
    level: integer('level').notNull().default(1),
    unlocksJson: jsonb('unlocks_json').notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueProgress: unique('progress_state_guild_user_uq').on(table.guildId, table.userId)
  }),
);

export const seasons = pgTable(
  'seasons',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    seasonKey: varchar('season_key', { length: 64 }).notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('planned'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueSeason: unique('seasons_guild_season_uq').on(table.guildId, table.seasonKey)
  }),
);

export const weeklyCapsules = pgTable(
  'weekly_capsules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    weekStartDate: text('week_start_date').notNull(),
    seed: integer('seed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueCapsuleWeek: unique('weekly_capsules_guild_week_uq').on(table.guildId, table.weekStartDate)
  }),
);

export const raids = pgTable(
  'raids',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('active'),
    weekStartDate: text('week_start_date').notNull(),
    weekEndAt: timestamp('week_end_at', { withTimezone: true }).notNull(),
    goalPoints: integer('goal_points').notNull(),
    progressPoints: integer('progress_points').notNull().default(0),
    publicChannelId: varchar('public_channel_id', { length: 32 }).notNull(),
    progressMessageId: varchar('progress_message_id', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueRaidWeek: unique('raids_guild_week_uq').on(table.guildId, table.weekStartDate)
  }),
);

export const raidQuests = pgTable('raid_quests', {
  id: varchar('id', { length: 36 }).primaryKey(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  category: varchar('category', { length: 64 }).notNull(),
  difficulty: varchar('difficulty', { length: 16 }).notNull(),
  points: integer('points').notNull(),
  text: varchar('text', { length: 240 }).notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const raidDailyOffers = pgTable(
  'raid_daily_offers',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    raidId: varchar('raid_id', { length: 36 }).notNull(),
    dayDate: text('day_date').notNull(),
    questKeysJson: jsonb('quest_keys_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueOfferDay: unique('raid_daily_offers_raid_day_uq').on(table.raidId, table.dayDate)
  }),
);

export const raidClaims = pgTable(
  'raid_claims',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    raidId: varchar('raid_id', { length: 36 }).notNull(),
    dayDate: text('day_date').notNull(),
    pairId: varchar('pair_id', { length: 36 }).notNull(),
    questKey: varchar('quest_key', { length: 64 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('pending_confirm'),
    basePoints: integer('base_points').notNull(),
    bonusPoints: integer('bonus_points').notNull().default(0),
    requestedByUserId: varchar('requested_by_user_id', { length: 32 }),
    confirmedByUserId: varchar('confirmed_by_user_id', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true })
  },
  (table) => ({
    uniqueClaim: unique('raid_claims_raid_day_pair_quest_uq').on(
      table.raidId,
      table.dayDate,
      table.pairId,
      table.questKey,
    )
  }),
);

export const raidPairDailyTotals = pgTable(
  'raid_pair_daily_totals',
  {
    raidId: varchar('raid_id', { length: 36 }).notNull(),
    dayDate: text('day_date').notNull(),
    pairId: varchar('pair_id', { length: 36 }).notNull(),
    pointsTotal: integer('points_total').notNull().default(0)
  },
  (table) => ({
    uniqueTotal: unique('raid_pair_daily_totals_raid_day_pair_uq').on(
      table.raidId,
      table.dayDate,
      table.pairId,
    )
  }),
);

export const eventOutbox = pgTable('event_outbox', {
  id: varchar('id', { length: 36 }).primaryKey(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true })
});

export const sequenceNumbers = pgTable('sequence_numbers', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: bigint('value', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
