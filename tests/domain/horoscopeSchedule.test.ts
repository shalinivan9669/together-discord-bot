import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('horoscope scheduler helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.DATABASE_URL = 'https://example.com';
  });

  it('computeNextRun uses fixed 10:00 local time with everyDays', async () => {
    const { computeNextRun } = await import('../../src/app/services/astroHoroscopeService');
    const next = computeNextRun({
      now: new Date('2026-02-18T09:30:00.000Z'),
      timezone: 'Asia/Almaty',
      everyDays: 4
    });

    expect(next.toISOString()).toBe('2026-02-22T05:00:00.000Z');
  });

  it('builds stable dedupe key by UTC day and test suffix', async () => {
    const { buildHoroscopeDedupeKey } = await import('../../src/app/services/astroHoroscopeService');
    const runAt = new Date('2026-02-18T14:20:00.000Z');
    expect(
      buildHoroscopeDedupeKey({
        guildId: 'g1',
        runAt
      }),
    ).toBe('horoscope:g1:2026-02-18');
    expect(
      buildHoroscopeDedupeKey({
        guildId: 'g1',
        runAt,
        isTest: true
      }),
    ).toBe('horoscope:test:g1');
  });
});
