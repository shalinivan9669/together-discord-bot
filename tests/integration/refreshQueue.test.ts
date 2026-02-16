import { describe, expect, it, vi } from 'vitest';
import { JobNames } from '../../src/infra/queue/jobs';
import { requestPairHomeRefresh } from '../../src/app/projections/pairHomeProjection';
import { requestRaidProgressRefresh } from '../../src/app/projections/raidProjection';
import { requestScoreboardRefresh } from '../../src/app/projections/scoreboardProjection';

function createBoss() {
  return {
    send: vi.fn().mockResolvedValue('job-1')
  };
}

describe('projection refresh enqueue policy', () => {
  it('uses centralized coalescing policy for duel scoreboard refresh', async () => {
    const boss = createBoss();

    await requestScoreboardRefresh(boss as never, {
      guildId: 'g1',
      duelId: 'd1',
      reason: 'submission'
    });

    expect(boss.send).toHaveBeenCalledWith(
      JobNames.DuelScoreboardRefresh,
      expect.objectContaining({
        guildId: 'g1',
        duelId: 'd1'
      }),
      expect.objectContaining({
        singletonKey: 'projection:duel_scoreboard:g1:d1',
        singletonSeconds: 8,
        retryLimit: 3
      }),
    );
  });

  it('uses centralized coalescing policy for raid and pair-home refresh', async () => {
    const boss = createBoss();

    await requestRaidProgressRefresh(boss as never, {
      guildId: 'g2',
      raidId: 'r2',
      reason: 'claim_confirm'
    });

    await requestPairHomeRefresh(boss as never, {
      guildId: 'g2',
      pairId: 'pair-2',
      reason: 'raid_claim_confirmed'
    });

    expect(boss.send).toHaveBeenNthCalledWith(
      1,
      JobNames.RaidProgressRefresh,
      expect.objectContaining({
        guildId: 'g2',
        raidId: 'r2'
      }),
      expect.objectContaining({
        singletonKey: 'projection:raid_progress:g2:r2',
        singletonSeconds: 12,
        retryLimit: 3
      }),
    );

    expect(boss.send).toHaveBeenNthCalledWith(
      2,
      JobNames.PairHomeRefresh,
      expect.objectContaining({
        guildId: 'g2',
        pairId: 'pair-2'
      }),
      expect.objectContaining({
        singletonKey: 'projection:pair_home:g2:pair-2',
        singletonSeconds: 8,
        retryLimit: 3
      }),
    );
  });
});
