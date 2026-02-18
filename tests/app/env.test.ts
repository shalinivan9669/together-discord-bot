import { beforeEach, describe, expect, it, vi } from 'vitest';

function setBaseEnv() {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'info';
  process.env.DATABASE_URL = 'https://example.com';
  process.env.DISCORD_TOKEN = '';
  process.env.DISCORD_APP_ID = '';
  process.env.DISCORD_GUILD_ID = '';
  process.env.ALLOWED_GUILD_IDS = '';
  process.env.SENTRY_DSN = '';
  process.env.TZ = 'Asia/Almaty';
  process.env.DEFAULT_TIMEZONE = 'Asia/Almaty';
  process.env.PHASE2_ORACLE_ENABLED = 'false';
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
    expect(module.env.DISCORD_GUILD_ID).toBeUndefined();
    expect(module.env.ALLOWED_GUILD_IDS).toBeUndefined();
    expect(module.env.SENTRY_DSN).toBeUndefined();
  });

  it('parses allowed guild csv when configured', async () => {
    process.env.ALLOWED_GUILD_IDS = '123456789012345678, 987654321098765432';
    const module = await import('../../src/config/env');
    expect(module.env.ALLOWED_GUILD_IDS).toEqual(['123456789012345678', '987654321098765432']);
  });

  it('uses default false for oracle flag when not provided', async () => {
    delete process.env.PHASE2_ORACLE_ENABLED;
    const module = await import('../../src/config/env');
    expect(module.env.PHASE2_ORACLE_ENABLED).toBe(false);
  });
});
