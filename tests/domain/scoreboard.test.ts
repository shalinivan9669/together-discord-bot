import { describe, expect, it } from 'vitest';
import { renderDuelScoreboard } from '../../src/discord/projections/scoreboardRenderer';

describe('scoreboard renderer', () => {
  it('renders deterministic duel scoreboard', () => {
    const result = renderDuelScoreboard({
      duelId: 'duel_1',
      guildId: 'guild_1',
      status: 'active',
      publicChannelId: 'chan_1',
      scoreboardMessageId: 'msg_1',
      roundNo: 2,
      roundStatus: 'active',
      roundEndsAt: new Date('2025-01-08T10:30:00Z'),
      topPairs: [
        {
          pairId: 'pair_1',
          user1Id: 'u1',
          user2Id: 'u2',
          points: 24,
          submissions: 3
        }
      ],
      totalPairs: 1,
      totalSubmissions: 3,
      updatedAt: new Date('2025-01-08T10:00:00Z')
    });

    expect(result).toContain('## Butler Duel Scoreboard');
    expect(result).toContain('Round: **#2** (active)');
    expect(result).toContain('<@u1> + <@u2>');
    expect(result).toContain('Last updated: 2025-01-08T10:00:00.000Z');
  });
});