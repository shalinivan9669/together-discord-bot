import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../drizzle';
import { duelRounds, duelSubmissions, duels, pairs } from '../schema';

export async function getActiveDuel(guildId: string) {
  const rows = await db
    .select()
    .from(duels)
    .where(and(eq(duels.guildId, guildId), eq(duels.status, 'active')))
    .orderBy(desc(duels.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function getActiveRound(duelId: string) {
  const rows = await db
    .select()
    .from(duelRounds)
    .where(and(eq(duelRounds.duelId, duelId), eq(duelRounds.status, 'active')))
    .orderBy(desc(duelRounds.roundNo))
    .limit(1);

  return rows[0] ?? null;
}

export async function getRoundById(roundId: string) {
  const rows = await db.select().from(duelRounds).where(eq(duelRounds.id, roundId)).limit(1);
  return rows[0] ?? null;
}

export async function listActivePairs(guildId: string) {
  return db.select().from(pairs).where(and(eq(pairs.guildId, guildId), eq(pairs.status, 'active')));
}

export async function countSubmissionsByRound(roundId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(duelSubmissions)
    .where(eq(duelSubmissions.roundId, roundId));

  return Number(result[0]?.count ?? 0);
}