import { describe, expect, it } from 'vitest';
import { makeProjectionKey, makeSubmissionKey, makeWeeklyFeatureKey } from '../../src/app/policies/idempotency';

describe('idempotency keys', () => {
  it('creates weekly feature keys with deterministic week start', () => {
    const key = makeWeeklyFeatureKey('raid', 'g1', 'pair1', new Date('2025-01-08T10:00:00Z'), 'quest_a');
    expect(key).toBe('raid:g1:pair1:2025-01-06:quest_a');
  });

  it('creates submission key', () => {
    expect(makeSubmissionKey('duel', 'g1', 'r1', 'p1')).toBe('duel:submission:g1:r1:p1');
  });

  it('creates projection key', () => {
    expect(makeProjectionKey('duel', 'g1', 'd1')).toBe('duel:projection:g1:d1');
  });
});