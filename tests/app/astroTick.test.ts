import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('astro tick idempotency', () => {
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

  it('does not enqueue duplicate publish after cycle already exists', async () => {
    const { queueAstroPublishForTick } = await import('../../src/app/services/astroHoroscopeService');
    let createdOnce = false;
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const deps = {
      listTickGuilds: vi.fn().mockResolvedValue([
        {
          guildId: 'g1',
          channelId: 'astro-ch',
          messageId: 'astro-msg',
          anchorDate: '2026-02-01'
        }
      ]),
      resolveCycle: vi.fn().mockResolvedValue({
        anchorDate: '2026-02-01',
        cycleIndex: 2,
        cycleStartDate: '2026-02-13',
        cycleEndDate: '2026-02-18'
      }),
      ensureCycle: vi.fn().mockImplementation(async () => {
        if (!createdOnce) {
          createdOnce = true;
          return {
            row: {
              id: 'cycle-1',
              guildId: 'g1',
              cycleStartDate: '2026-02-13',
              archetypeKey: 'a1',
              seed: 100,
              createdAt: new Date()
            },
            created: true
          };
        }

        return {
          row: {
            id: 'cycle-1',
            guildId: 'g1',
            cycleStartDate: '2026-02-13',
            archetypeKey: 'a1',
            seed: 100,
            createdAt: new Date()
          },
          created: false
        };
      })
    };

    const first = await queueAstroPublishForTick(
      {
        now: new Date('2026-02-14T09:00:00.000Z'),
        enqueue
      },
      deps,
    );

    const second = await queueAstroPublishForTick(
      {
        now: new Date('2026-02-14T12:00:00.000Z'),
        enqueue
      },
      deps,
    );

    expect(first.queued).toBe(1);
    expect(second.queued).toBe(0);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
