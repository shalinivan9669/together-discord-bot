import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('astro publish idempotency', () => {
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

  it('keeps a single public message when concurrent create races', async () => {
    const { refreshAstroHoroscopeProjection } = await import('../../src/discord/projections/astroHoroscope');
    const queueEdit = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue({ id: 'astro-msg-new' });
    const deleteDuplicate = vi.fn().mockResolvedValue(undefined);

    const stats = await refreshAstroHoroscopeProjection(
      {
        client: { rest: {} } as never,
        messageEditor: { queueEdit } as never,
        guildId: 'g1',
        now: new Date('2026-02-14T09:00:00.000Z')
      },
      {
        loadTargetGuilds: vi.fn().mockResolvedValue([
          {
            guildId: 'g1',
            channelId: 'astro-channel',
            messageId: null
          }
        ]),
        getPublicSnapshot: vi.fn().mockResolvedValue({
          cycleStartDate: '2026-02-13',
          cycleEndDate: '2026-02-18',
          archetypeKey: 'a1',
          skyTheme: 'Метафорический аспект Меркурия и Венеры.',
          aboutLine: 'В астрологическом языке это звучит как настройка диалога.',
          createdCycle: false
        }),
        renderCard: vi.fn().mockReturnValue({
          components: []
        }),
        sendMessage,
        setMessageIdIfUnset: vi.fn().mockResolvedValue(false),
        getFeatureState: vi.fn().mockResolvedValue({
          guildId: 'g1',
          enabled: true,
          configured: true,
          channelId: 'astro-channel',
          messageId: 'astro-msg-existing',
          anchorDate: '2026-02-01'
        }),
        deleteDuplicate
      },
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(queueEdit).toHaveBeenCalledWith({
      channelId: 'astro-channel',
      messageId: 'astro-msg-existing',
      components: [],
      flags: expect.any(Number)
    });
    expect(deleteDuplicate).toHaveBeenCalledTimes(1);
    expect(stats).toEqual({
      processed: 1,
      created: 0,
      updated: 1,
      failed: 0
    });
  });
});
