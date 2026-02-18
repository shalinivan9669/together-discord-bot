import { createHash } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

export const ASTRO_SIGN_KEYS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;

export const ASTRO_MODES = ['soft', 'neutral', 'hard'] as const;
export const ASTRO_CONTEXTS = ['conflict', 'ok', 'boredom', 'distance', 'fatigue', 'jealousy'] as const;

export type AstroSignKey = (typeof ASTRO_SIGN_KEYS)[number];
export type AstroMode = (typeof ASTRO_MODES)[number];
export type AstroContext = (typeof ASTRO_CONTEXTS)[number];

export type AstroCycleRange = {
  cycleIndex: number;
  cycleStartDate: string;
  cycleEndDate: string;
};

export const astroSignLabelRu: Record<AstroSignKey, string> = {
  aries: 'Овен',
  taurus: 'Телец',
  gemini: 'Близнецы',
  cancer: 'Рак',
  leo: 'Лев',
  virgo: 'Дева',
  libra: 'Весы',
  scorpio: 'Скорпион',
  sagittarius: 'Стрелец',
  capricorn: 'Козерог',
  aquarius: 'Водолей',
  pisces: 'Рыбы'
};

export function stableHashInt(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0);
}

export function pickDeterministicAstroArchetypeKey(input: {
  guildId: string;
  cycleStartDate: string;
  activeKeys: readonly string[];
}): string {
  if (input.activeKeys.length === 0) {
    throw new Error('activeKeys must not be empty');
  }

  const sorted = [...input.activeKeys].sort((left, right) => left.localeCompare(right));
  const idx = stableHashInt(`${input.guildId}:${input.cycleStartDate}`) % sorted.length;
  return sorted[idx]!;
}

export function computeAstroSeed(input: {
  guildId: string;
  cycleStartDate: string;
  archetypeKey: string;
}): number {
  return stableHashInt(`${input.guildId}:${input.cycleStartDate}:${input.archetypeKey}`) % 10_000;
}

function parseDateOnlyUtc(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${date}`);
  }
  return parsed;
}

export function formatDateOnlyUtc(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export function addDaysToDateOnly(date: string, days: number): string {
  const parsed = parseDateOnlyUtc(date);
  return formatDateOnlyUtc(new Date(parsed.getTime() + days * DAY_MS));
}

export function diffDateOnlyDays(leftDate: string, rightDate: string): number {
  const left = parseDateOnlyUtc(leftDate).getTime();
  const right = parseDateOnlyUtc(rightDate).getTime();
  return Math.floor((left - right) / DAY_MS);
}

export function computeAstroCycleRange(anchorDate: string, todayDate: string): AstroCycleRange {
  const daysSince = diffDateOnlyDays(todayDate, anchorDate);
  const cycleIndex = Math.floor(daysSince / 6);
  const cycleStartDate = addDaysToDateOnly(anchorDate, cycleIndex * 6);
  const cycleEndDate = addDaysToDateOnly(cycleStartDate, 5);

  return {
    cycleIndex,
    cycleStartDate,
    cycleEndDate
  };
}

export function parseAstroSignKey(value: string): AstroSignKey | null {
  const normalized = value.trim().toLowerCase();
  return ASTRO_SIGN_KEYS.find((item) => item === normalized) ?? null;
}

export function parseAstroMode(value: string): AstroMode | null {
  const normalized = value.trim().toLowerCase();
  return ASTRO_MODES.find((item) => item === normalized) ?? null;
}

export function parseAstroContext(value: string): AstroContext | null {
  const normalized = value.trim().toLowerCase();
  return ASTRO_CONTEXTS.find((item) => item === normalized) ?? null;
}
