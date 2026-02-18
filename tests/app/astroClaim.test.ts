import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASTRO_CONTEXTS, ASTRO_MODES, ASTRO_SIGN_KEYS } from '../../src/domain/astro';

function buildCompleteAstroVariants() {
  const signs: Record<string, unknown> = {};

  for (const sign of ASTRO_SIGN_KEYS) {
    const modeMap: Record<string, unknown> = {};
    for (const mode of ASTRO_MODES) {
      const contextMap: Record<string, unknown> = {};
      for (const context of ASTRO_CONTEXTS) {
        contextMap[context] = {
          risk: `Риск ${sign}/${mode}/${context}`,
          step: `Шаг ${sign}/${mode}/${context}`,
          keyPhrase: `Фраза ${sign}/${mode}/${context}`,
          taboo: `Табу ${sign}/${mode}/${context}`,
          miniChallenge: `Мини ${sign}/${mode}/${context}`
        };
      }
      modeMap[mode] = contextMap;
    }
    signs[sign] = modeMap;
  }

  return {
    meta: {
      skyTheme: 'В астрологическом языке это звучит как мягкая настройка диалога.',
      aboutLine: 'Метафорически: Венера = нежность, Меркурий = слова.'
    },
    signs
  };
}

describe('astro claim idempotency', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.DATABASE_URL = 'https://example.com';
    process.env.PHASE2_ORACLE_ENABLED = 'false';
    process.env.PHASE2_CHECKIN_ENABLED = 'false';
    process.env.PHASE2_ANON_ENABLED = 'false';
    process.env.PHASE2_REWARDS_ENABLED = 'false';
    process.env.PHASE2_SEASONS_ENABLED = 'false';
    process.env.PHASE2_RAID_ENABLED = 'false';
  });

  it('returns stored claim text on re-claim within the same cycle', async () => {
    const { claimAstroHoroscope } = await import('../../src/app/services/astroHoroscopeService');
    let storedClaim: {
      id: string;
      guildId: string;
      cycleStartDate: string;
      userId: string;
      pairId: string | null;
      deliveredTo: string;
      signKey: string;
      mode: string;
      context: string;
      claimText: string;
      createdAt: Date;
    } | null = null;

    const deps = {
      ensureCurrentCycle: vi.fn().mockResolvedValue({
        cycle: {
          anchorDate: '2026-02-01',
          cycleIndex: 2,
          cycleStartDate: '2026-02-13',
          cycleEndDate: '2026-02-18'
        },
        cycleRow: {
          id: 'cycle-1',
          guildId: 'g1',
          cycleStartDate: '2026-02-13',
          archetypeKey: 'arc-1',
          seed: 77,
          createdAt: new Date()
        },
        created: false
      }),
      getArchetypeByKey: vi.fn().mockResolvedValue({
        key: 'arc-1',
        title: 'A1',
        variantsJson: buildCompleteAstroVariants(),
        active: true,
        createdAt: new Date()
      }),
      selectExistingClaim: vi.fn().mockImplementation(async () => storedClaim),
      insertClaim: vi.fn().mockImplementation(async (input) => {
        if (storedClaim) {
          return null;
        }

        storedClaim = {
          id: 'claim-1',
          guildId: input.guildId,
          cycleStartDate: input.cycleStartDate,
          userId: input.userId,
          pairId: input.pairId,
          deliveredTo: 'ephemeral',
          signKey: input.sign,
          mode: input.mode,
          context: input.context,
          claimText: input.claimText,
          createdAt: new Date()
        };

        return storedClaim;
      }),
      setUserSign: vi.fn().mockResolvedValue(undefined)
    };

    const first = await claimAstroHoroscope(
      {
        guildId: 'g1',
        userId: 'u1',
        pairId: null,
        sign: 'aries',
        mode: 'soft',
        context: 'conflict',
        saveSign: false,
        now: new Date('2026-02-14T10:00:00.000Z')
      },
      deps,
    );

    const second = await claimAstroHoroscope(
      {
        guildId: 'g1',
        userId: 'u1',
        pairId: null,
        sign: 'leo',
        mode: 'hard',
        context: 'jealousy',
        saveSign: false,
        now: new Date('2026-02-14T12:00:00.000Z')
      },
      deps,
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.text).toBe(first.text);
    expect(second.sign).toBe('aries');
    expect(second.mode).toBe('soft');
    expect(second.context).toBe('conflict');
  });
});
