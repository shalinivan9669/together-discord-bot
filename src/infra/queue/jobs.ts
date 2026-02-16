import { z } from 'zod';

export const JobNames = {
  DuelRoundClose: 'duel.round.close',
  DuelScoreboardRefresh: 'duel.scoreboard.refresh',
  RaidProgressRefresh: 'raid.progress.refresh',
  PublicPostPublish: 'public.post.publish',
  WeeklyHoroscopePublish: 'weekly.horoscope.publish',
  WeeklyCheckinNudge: 'weekly.checkin.nudge',
  WeeklyRaidStart: 'weekly.raid.start',
  WeeklyRaidEnd: 'weekly.raid.end',
  DailyRaidOffersGenerate: 'daily.raid.offers.generate'
} as const;

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

export const publicPostPublishPayloadSchema = baseJobSchema.extend({
  scheduledPostId: z.string().optional()
});

export const genericScheduledPayloadSchema = baseJobSchema.extend({
  weekStartDate: z.string().optional()
});

export type DuelRoundClosePayload = z.infer<typeof duelRoundClosePayloadSchema>;
export type DuelScoreboardRefreshPayload = z.infer<typeof duelScoreboardRefreshPayloadSchema>;
export type RaidProgressRefreshPayload = z.infer<typeof raidProgressRefreshPayloadSchema>;
export type PublicPostPublishPayload = z.infer<typeof publicPostPublishPayloadSchema>;
export type GenericScheduledPayload = z.infer<typeof genericScheduledPayloadSchema>;