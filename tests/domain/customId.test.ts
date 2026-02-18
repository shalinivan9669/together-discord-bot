import { describe, expect, it } from 'vitest';
import { decodeCustomId, encodeCustomId } from '../../src/discord/interactions/customId';

describe('customId encoding', () => {
  it('encodes and decodes duel payload', () => {
    const customId = encodeCustomId({
      feature: 'duel',
      action: 'submit_modal',
      payload: {
        duelId: 'd1',
        roundId: 'r1',
        pairId: 'p1'
      }
    });

    const decoded = decodeCustomId(customId);

    expect(decoded.feature).toBe('duel');
    expect(decoded.action).toBe('submit_modal');
    expect(decoded.payload.duelId).toBe('d1');
    expect(decoded.payload.roundId).toBe('r1');
    expect(decoded.payload.pairId).toBe('p1');
  });

  it('keeps oracle picker custom ids short and guild-free', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'https://example.com';
    const { buildOracleClaimPicker } = await import('../../src/discord/interactions/components');

    const rows = buildOracleClaimPicker({
      weekStartDate: '2026-02-16',
      mode: 'neutral',
      context: 'distance'
    });

    const customIds = rows.flatMap((row) => {
      const json = row.toJSON() as { components?: Array<{ custom_id?: string }> };
      if (!Array.isArray(json.components)) {
        return [];
      }

      return json.components
        .map((component) => component.custom_id)
        .filter((customId): customId is string => typeof customId === 'string');
    });

    expect(customIds).toHaveLength(3);

    for (const customId of customIds) {
      expect(customId.length).toBeLessThanOrEqual(90);

      const decoded = decodeCustomId(customId);
      expect(decoded.feature).toBe('oracle');
      expect(decoded.payload.g).toBeUndefined();
      expect(decoded.payload.w).toBe('2026-02-16');
    }
  });
});
