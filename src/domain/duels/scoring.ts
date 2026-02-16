export type DuelSubmissionPayload = {
  answer: string;
};

export function computeSubmissionScore(payload: DuelSubmissionPayload): number {
  const normalized = payload.answer.trim().replace(/\s+/g, ' ');
  const base = normalized.length;
  return Math.max(1, (base % 10) + 1);
}

export function duelRoundCloseKey(guildId: string, duelId: string, roundNo: number): string {
  return `duel:round:close:${guildId}:${duelId}:${roundNo}`;
}