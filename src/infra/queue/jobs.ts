import { z } from 'zod';

export const JobNames = {
  DuelRoundClose: 'duel.round.close',
  DuelScoreboardRefresh: 'duel.scoreboard.refresh',
  RaidProgressRefresh: 'raid.progress.refresh',
  PairHomeRefresh: 'pair.home.refresh',
  MonthlyHallRefresh: 'monthly.hall.refresh',
  MediatorRepairTick: 'mediator.repair.tick',
  PublicPostPublish: 'public.post.publish',
  OracleWeeklyPublish: 'oracle.weekly.publish',
  OraclePublish: 'oracle.publish',
  AstroTickDaily: 'astro.tick.daily',
  AstroPublish: 'astro.publish',
  WeeklyCheckinNudge: 'weekly.checkin.nudge',
  WeeklyRaidStart: 'weekly.raid.start',
  WeeklyRaidEnd: 'weekly.raid.end',
  DailyRaidOffersGenerate: 'daily.raid.offers.generate'
} as const;

export type JobName = (typeof JobNames)[keyof typeof JobNames];

export const AllJobNames = Object.values(JobNames) as readonly JobName[];

export const baseJobSchema = z.object({
  correlationId: z.string().uuid(),
  interactionId: z.string().optional(),
  guildId: z.string(),
  userId: z.string().optional(),
  feature: z.string(),
  action: z.string()
});

export const duelRoundClosePayloadSchema = baseJobSchema.extend({
  duelId: z.string(),
  roundId: z.string(),
  roundNo: z.number().int().positive()
});

export const duelScoreboardRefreshPayloadSchema = baseJobSchema.extend({
  duelId: z.string(),
  reason: z.string().default('unknown')
});

export const raidProgressRefreshPayloadSchema = baseJobSchema.extend({
  raidId: z.string().optional()
});

export const pairHomeRefreshPayloadSchema = baseJobSchema.extend({
  pairId: z.string(),
  reason: z.string().default('unknown')
});

export const monthlyHallRefreshPayloadSchema = baseJobSchema.extend({
  monthKey: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
});

export const mediatorRepairTickPayloadSchema = baseJobSchema.extend({
  sessionId: z.string(),
  stepNumber: z.number().int().positive()
});

export const publicPostPublishPayloadSchema = baseJobSchema.extend({
  scheduledPostId: z.string().optional()
});

export const genericScheduledPayloadSchema = baseJobSchema.extend({
  weekStartDate: z.string().optional(),
  runAtIso: z.string().optional(),
  dedupeKey: z.string().optional(),
  isTest: z.boolean().optional()
});

export type DuelRoundClosePayload = z.infer<typeof duelRoundClosePayloadSchema>;
export type DuelScoreboardRefreshPayload = z.infer<typeof duelScoreboardRefreshPayloadSchema>;
export type RaidProgressRefreshPayload = z.infer<typeof raidProgressRefreshPayloadSchema>;
export type PairHomeRefreshPayload = z.infer<typeof pairHomeRefreshPayloadSchema>;
export type MonthlyHallRefreshPayload = z.infer<typeof monthlyHallRefreshPayloadSchema>;
export type MediatorRepairTickPayload = z.infer<typeof mediatorRepairTickPayloadSchema>;
export type PublicPostPublishPayload = z.infer<typeof publicPostPublishPayloadSchema>;
export type GenericScheduledPayload = z.infer<typeof genericScheduledPayloadSchema>;

