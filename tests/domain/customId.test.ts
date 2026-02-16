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
});