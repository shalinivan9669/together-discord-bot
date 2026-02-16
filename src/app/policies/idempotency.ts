import { startOfWeekIso } from '../../lib/time';

export function makeWeeklyFeatureKey(
  feature: string,
  guildId: string,
  pairId: string | null,
  date: Date,
  questKey?: string,
): string {
  const week = startOfWeekIso(date);
  const pairPart = pairId ?? 'none';
  const questPart = questKey ?? 'none';
  return `${feature}:${guildId}:${pairPart}:${week}:${questPart}`;
}

export function makeSubmissionKey(feature: string, guildId: string, roundId: string, pairId: string): string {
  return `${feature}:submission:${guildId}:${roundId}:${pairId}`;
}

export function makeProjectionKey(feature: string, guildId: string, entityId: string): string {
  return `${feature}:projection:${guildId}:${entityId}`;
}