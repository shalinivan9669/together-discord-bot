import { beforeEach, describe, expect, it } from 'vitest';

describe('computeOracleSeed', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'https://example.com';
  });

  it('returns int32-safe seed range', async () => {
    const { computeOracleSeed } = await import('../../src/app/services/oracleService');
    const seed = computeOracleSeed('123456789012345678', '2026-02-16');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(1);
    expect(seed).toBeLessThanOrEqual(2147483646);
  });

  it('is deterministic for same guild/week', async () => {
    const { computeOracleSeed } = await import('../../src/app/services/oracleService');
    const a = computeOracleSeed('123456789012345678', '2026-02-16');
    const b = computeOracleSeed('123456789012345678', '2026-02-16');
    expect(a).toBe(b);
  });

  it('varies across weeks', async () => {
    const { computeOracleSeed } = await import('../../src/app/services/oracleService');
    const a = computeOracleSeed('123456789012345678', '2026-02-16');
    const b = computeOracleSeed('123456789012345678', '2026-02-23');
    expect(a).not.toBe(b);
  });
});
