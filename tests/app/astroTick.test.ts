import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('astro tick queueing', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.DATABASE_URL = 'https://example.com';
    process.env.PHASE2_ORACLE_ENABLED = 'false';
    process.env.PHASE2_CHECKIN_ENABLED = 'false';
    process.env.PHASE2_ANON_ENABLED = 'false';
    process.env.PHASE2_REWARDS_ENABLED = 'false';
    process.env.PHASE2_SEASONS_ENABLED = 'false';
    process.env.PHASE2_RAID_ENABLED = 'false';
  });

  it('enqueues due guild with stable dedupe key', async () => {
    const { queueAstroPublishForTick } = await import('../../src/app/services/astroHoroscopeService');
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const now = new Date('2026-02-14T09:00:00.000Z');

    const deps = {
      listTickGuilds: vi.fn().mockResolvedValue([
        {
          guildId: 'g1',
          channelId: 'astro-ch',
          messageId: 'astro-msg',
          anchorDate: '2026-02-01',
          timezone: 'Asia/Almaty',
          everyDays: 4,
          nextRunAt: new Date('2026-02-14T08:00:00.000Z')
        }
      ]),
    };

    const result = await queueAstroPublishForTick(
      {
        now,
        enqueue
      },
      deps,
    );

    expect(result.queued).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      guildId: 'g1',
      reason: 'due_run',
      runAt: new Date('2026-02-14T08:00:00.000Z'),
      dedupeKey: 'horoscope:g1:2026-02-14'
    });
  });
});
