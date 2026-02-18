import { describe, expect, it } from 'vitest';
import {
  computeAstroCycleRange,
  pickDeterministicAstroArchetypeKey
} from '../../src/domain/astro';

describe('astro cycle math', () => {
  it('computes 6-day cycle from anchor date', () => {
    const cycle = computeAstroCycleRange('2026-01-01', '2026-01-13');

    expect(cycle.cycleIndex).toBe(2);
    expect(cycle.cycleStartDate).toBe('2026-01-13');
    expect(cycle.cycleEndDate).toBe('2026-01-18');
  });

  it('picks deterministic archetype key from sorted active keys', () => {
    const first = pickDeterministicAstroArchetypeKey({
      guildId: 'g1',
      cycleStartDate: '2026-02-15',
      activeKeys: ['zeta', 'alpha', 'beta']
    });

    const second = pickDeterministicAstroArchetypeKey({
      guildId: 'g1',
      cycleStartDate: '2026-02-15',
      activeKeys: ['beta', 'zeta', 'alpha']
    });

    expect(first).toBe(second);
    expect(['alpha', 'beta', 'zeta']).toContain(first);
  });
});
