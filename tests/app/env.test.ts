import { beforeEach, describe, expect, it, vi } from 'vitest';

function setBaseEnv() {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'info';
  process.env.DATABASE_URL = 'https://example.com';
  process.env.TZ = 'Asia/Almaty';
  process.env.DEFAULT_TIMEZONE = 'Asia/Almaty';
  process.env.PHASE2_HOROSCOPE_ENABLED = 'false';
  process.env.PHASE2_CHECKIN_ENABLED = 'false';
  process.env.PHASE2_ANON_ENABLED = 'false';
  process.env.PHASE2_REWARDS_ENABLED = 'false';
  process.env.PHASE2_SEASONS_ENABLED = 'false';
  process.env.PHASE2_RAID_ENABLED = 'false';
  process.env.SCOREBOARD_EDIT_THROTTLE_SECONDS = '12';
  process.env.RAID_PROGRESS_EDIT_THROTTLE_SECONDS = '15';
}

describe('env parsing', () => {
  beforeEach(() => {
    vi.resetModules();
    setBaseEnv();
  });

  it('parses valid environment', async () => {
    const module = await import('../../src/config/env');
    expect(module.env.NODE_ENV).toBe('test');
    expect(module.env.DEFAULT_TIMEZONE).toBe('Asia/Almaty');
  });
});