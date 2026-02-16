import { and, eq, sql } from 'drizzle-orm';
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

  const updated = await db.execute<{ count: number }>(sql`
    insert into command_rate_limits (
      guild_id,
      user_id,
      action_key,
      day_date,
      count,
      updated_at
    )
    values (
      ${params.guildId},
      ${params.userId},
      ${params.actionKey},
      ${dayDate},
      1,
      ${now}
    )
    on conflict (guild_id, user_id, action_key, day_date)
    do update
      set
        count = command_rate_limits.count + 1,
        updated_at = excluded.updated_at
    where command_rate_limits.count < ${params.limit}
    returning count
  `);

  if (!updated.rows[0]) {
    const existing = await db
      .select({ count: commandRateLimits.count })
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

    const current = existing[0]?.count ?? params.limit;
    return {
      allowed: false,
      remaining: Math.max(0, params.limit - current)
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, params.limit - updated.rows[0].count)
  };
}
