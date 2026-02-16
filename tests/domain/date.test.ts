import { describe, expect, it } from 'vitest';
import { generateDateIdeas } from '../../src/domain/date';

describe('date generator', () => {
  it('returns deterministic cards for the same filter set', () => {
    const first = generateDateIdeas({
      energy: 'medium',
      budget: 'moderate',
      timeWindow: 'evening'
    });
    const second = generateDateIdeas({
      energy: 'medium',
      budget: 'moderate',
      timeWindow: 'evening'
    });

    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(first.map((idea) => idea.key)).toEqual(second.map((idea) => idea.key));
  });
});
