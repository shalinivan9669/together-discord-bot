import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/drizzle';
import { commandRateLimits } from '../../infra/db/schema';
import { dateOnly } from '../../lib/time';

export async function consumeDailyQuota(params: {
  guildId: string;
  userId: string;
  actionKey: string;
  limit: number;
  now?: Date;
}): Promise<{ allowed: boolean; remaining: number }> {
  const now = params.now ?? new Date();
  const dayDate = dateOnly(now);

  const existing = await db
    .select()
    .from(commandRateLimits)
    .where(
      and(
        eq(commandRateLimits.guildId, params.guildId),
        eq(commandRateLimits.userId, params.userId),
        eq(commandRateLimits.actionKey, params.actionKey),
        eq(commandRateLimits.dayDate, dayDate),
      ),
    )
    .limit(1);

  const current = existing[0]?.count ?? 0;
  if (current >= params.limit) {
    return { allowed: false, remaining: 0 };
  }

  await db
    .insert(commandRateLimits)
    .values({
      guildId: params.guildId,
      userId: params.userId,
      actionKey: params.actionKey,
      dayDate,
      count: current + 1,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [
        commandRateLimits.guildId,
        commandRateLimits.userId,
        commandRateLimits.actionKey,
        commandRateLimits.dayDate
      ],
      set: {
        count: current + 1,
        updatedAt: now
      }
    });

  return { allowed: true, remaining: Math.max(0, params.limit - (current + 1)) };
}