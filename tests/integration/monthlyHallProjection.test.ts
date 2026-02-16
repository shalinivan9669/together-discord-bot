import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/services/monthlyHallService', () => ({
  listConfiguredMonthlyHallGuilds: vi.fn(),
  resolveMonthlyHallPeriod: vi.fn(() => ({
    monthKey: '2026-01',
    monthLabel: 'January 2026',
    startAt: new Date('2026-01-01T00:00:00.000Z'),
    endAt: new Date('2026-02-01T00:00:00.000Z'),
    startDay: '2026-01-01',
    endDay: '2026-02-01'
  })),
  buildMonthlyHallSnapshot: vi.fn(),
  ensureMonthlyHallCardRecord: vi.fn(),
  getMonthlyHallCardByGuildMonth: vi.fn(),
  setMonthlyHallMessageIdIfUnset: vi.fn(),
  clearMonthlyHallMessageId: vi.fn(),
  touchMonthlyHallCard: vi.fn()
}));

vi.mock('../../src/discord/projections/monthlyHallRenderer', () => ({
  renderMonthlyHallCard: vi.fn(() => ({
    components: []
  }))
}));

function fakeClient(post = vi.fn().mockResolvedValue({ id: 'hall-msg-1' })) {
  return {
    rest: {
      post,
      delete: vi.fn().mockResolvedValue(undefined)
    }
  };
}

function fakeMessageEditor() {
  return {
    queueEdit: vi.fn().mockResolvedValue(undefined)
  };
}

const baseSnapshot = {
  guildId: 'g1',
  monthKey: '2026-01',
  monthLabel: 'January 2026',
  activePairs: 12,
  checkinsDone: 19,
  raidParticipation: 8,
  duelParticipation: 6,
  topCheckinPairs: [],
  topRaidPairs: [],
  topDuelPairs: [],
  generatedAt: new Date('2026-02-01T10:00:00.000Z')
};

describe('monthly hall projection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'https://example.com';
  });

  it('edits existing monthly hall message', async () => {
    const monthlyHallService = await import('../../src/app/services/monthlyHallService');
    const { refreshMonthlyHallProjection } = await import('../../src/discord/projections/monthlyHall');

    vi.mocked(monthlyHallService.listConfiguredMonthlyHallGuilds).mockResolvedValue([
      { guildId: 'g1', hallChannelId: 'hall-channel' }
    ]);
    vi.mocked(monthlyHallService.buildMonthlyHallSnapshot).mockResolvedValue(baseSnapshot);
    vi.mocked(monthlyHallService.ensureMonthlyHallCardRecord).mockResolvedValue({
      id: 'card-1',
      guildId: 'g1',
      monthKey: '2026-01',
      channelId: 'hall-channel',
      messageId: 'hall-msg-existing',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const client = fakeClient();
    const messageEditor = fakeMessageEditor();

    const stats = await refreshMonthlyHallProjection({
      client: client as never,
      messageEditor: messageEditor as never,
      monthKey: '2026-01'
    });

    expect(messageEditor.queueEdit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(monthlyHallService.touchMonthlyHallCard)).toHaveBeenCalledWith('card-1');
    expect(client.rest.post).not.toHaveBeenCalled();
    expect(stats).toEqual({
      processed: 1,
      created: 0,
      updated: 1,
      failed: 0
    });
  });

  it('creates message and claims idempotent card message id when missing', async () => {
    const monthlyHallService = await import('../../src/app/services/monthlyHallService');
    const { refreshMonthlyHallProjection } = await import('../../src/discord/projections/monthlyHall');

    vi.mocked(monthlyHallService.listConfiguredMonthlyHallGuilds).mockResolvedValue([
      { guildId: 'g1', hallChannelId: 'hall-channel' }
    ]);
    vi.mocked(monthlyHallService.buildMonthlyHallSnapshot).mockResolvedValue(baseSnapshot);
    vi.mocked(monthlyHallService.ensureMonthlyHallCardRecord).mockResolvedValue({
      id: 'card-1',
      guildId: 'g1',
      monthKey: '2026-01',
      channelId: 'hall-channel',
      messageId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    vi.mocked(monthlyHallService.setMonthlyHallMessageIdIfUnset).mockResolvedValue(true);

    const client = fakeClient();
    const messageEditor = fakeMessageEditor();

    const stats = await refreshMonthlyHallProjection({
      client: client as never,
      messageEditor: messageEditor as never,
      monthKey: '2026-01'
    });

    expect(client.rest.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(monthlyHallService.setMonthlyHallMessageIdIfUnset)).toHaveBeenCalledWith({
      cardId: 'card-1',
      channelId: 'hall-channel',
      messageId: 'hall-msg-1'
    });
    expect(messageEditor.queueEdit).not.toHaveBeenCalled();
    expect(stats).toEqual({
      processed: 1,
      created: 1,
      updated: 0,
      failed: 0
    });
  });
});
