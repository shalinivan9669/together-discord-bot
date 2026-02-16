import { DomainError } from '../errors';
import type { UserId } from '../ids';

export type PairUsers = {
  userLow: UserId;
  userHigh: UserId;
};

export function normalizePairUsers(userA: UserId, userB: UserId): PairUsers {
  if (userA === userB) {
    throw new DomainError('Pair members must be different users', 'PAIR_SELF');
  }

  return userA < userB
    ? { userLow: userA, userHigh: userB }
    : { userLow: userB, userHigh: userA };
}

export function pairDedupKey(guildId: string, userLow: string, userHigh: string): string {
  return `pair:create:${guildId}:${userLow}:${userHigh}`;
}