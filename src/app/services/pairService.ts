import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/drizzle';
import { pairs } from '../../infra/db/schema';
import { ensureUserExists, getPairByMembers, getPairForUser } from '../../infra/db/queries/pairs';
import { normalizePairUsers } from '../../domain/pairs/model';
import { DomainError } from '../../domain/errors';
import type { UserId } from '../../domain/ids';

type CreatePairRoomInput = {
  guildId: string;
  userA: UserId;
  userB: UserId;
  createPrivateChannel: (memberIds: [string, string]) => Promise<string>;
};

export async function createPairRoom(input: CreatePairRoomInput) {
  const { userLow, userHigh } = normalizePairUsers(input.userA, input.userB);

  const existing = await getPairByMembers(input.guildId, userLow, userHigh);
  if (existing) {
    return { pair: existing, created: false };
  }

  const privateChannelId = await input.createPrivateChannel([userLow, userHigh]);

  await ensureUserExists(userLow);
  await ensureUserExists(userHigh);

  const pairId = randomUUID();

  const inserted = await db
    .insert(pairs)
    .values({
      id: pairId,
      guildId: input.guildId,
      user1Id: userLow,
      user2Id: userHigh,
      userLow,
      userHigh,
      privateChannelId,
      status: 'active'
    })
    .onConflictDoNothing({
      target: [pairs.guildId, pairs.userLow, pairs.userHigh]
    })
    .returning();

  if (inserted[0]) {
    return { pair: inserted[0], created: true };
  }

  const nowExisting = await getPairByMembers(input.guildId, userLow, userHigh);
  if (!nowExisting) {
    throw new DomainError('Failed to create pair', 'PAIR_CREATE_FAILED');
  }

  return { pair: nowExisting, created: false };
}

export async function getPairRoomForUser(guildId: string, userId: string) {
  return getPairForUser(guildId, userId);
}

export async function getPairById(guildId: string, pairId: string) {
  const rows = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.guildId, guildId), eq(pairs.id, pairId), eq(pairs.status, 'active')))
    .limit(1);

  return rows[0] ?? null;
}

export async function listGuildPairs(guildId: string) {
  return db.select().from(pairs).where(and(eq(pairs.guildId, guildId), eq(pairs.status, 'active')));
}