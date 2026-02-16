import { and, eq } from 'drizzle-orm';
import { db } from '../drizzle';
import { pairs, users } from '../schema';

export async function ensureUserExists(userId: string): Promise<void> {
  await db
    .insert(users)
    .values({ userId })
    .onConflictDoNothing({ target: users.userId });
}

export async function getPairByMembers(guildId: string, userLow: string, userHigh: string) {
  const rows = await db
    .select()
    .from(pairs)
    .where(
      and(eq(pairs.guildId, guildId), eq(pairs.userLow, userLow), eq(pairs.userHigh, userHigh), eq(pairs.status, 'active')),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getPairForUser(guildId: string, userId: string) {
  const rows = await db
    .select()
    .from(pairs)
    .where(
      and(
        eq(pairs.guildId, guildId),
        eq(pairs.status, 'active'),
      ),
    );

  return rows.find((row) => row.user1Id === userId || row.user2Id === userId) ?? null;
}