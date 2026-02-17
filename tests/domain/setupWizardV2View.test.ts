import { beforeEach, describe, expect, it, vi } from 'vitest';

type SetupWizardDraft = {
  guildId: string;
  userId: string;
  pairCategoryId: string | null;
  horoscopeChannelId: string | null;
  raidChannelId: string | null;
  hallChannelId: string | null;
  publicPostChannelId: string | null;
  anonInboxChannelId: string | null;
  anonModRoleId: string | null;
  timezone: string;
  updatedAtMs: number;
};

function draft(overrides?: Partial<SetupWizardDraft>): SetupWizardDraft {
  return {
    guildId: 'g1',
    userId: 'u1',
    pairCategoryId: null,
    horoscopeChannelId: null,
    raidChannelId: null,
    hallChannelId: null,
    publicPostChannelId: null,
    anonInboxChannelId: null,
    anonModRoleId: null,
    timezone: 'Asia/Almaty',
    updatedAtMs: Date.now(),
    ...overrides
  };
}

function getActionRowControls(
  view: { components: Array<Record<string, unknown>> },
  componentType: { Container: number; ActionRow: number },
): Array<Record<string, unknown>> {
  const controls: Array<Record<string, unknown>> = [];

  for (const topLevel of view.components) {
    if (topLevel.type !== componentType.Container) {
      continue;
    }

    const containerComponents = topLevel.components;
    if (!Array.isArray(containerComponents)) {
      continue;
    }

    for (const child of containerComponents) {
      if (!child || typeof child !== 'object' || child.type !== componentType.ActionRow) {
        continue;
      }

      const rowComponents = child.components;
      if (!Array.isArray(rowComponents)) {
        continue;
      }

      for (const item of rowComponents) {
        if (item && typeof item === 'object') {
          controls.push(item as Record<string, unknown>);
        }
      }
    }
  }

  return controls;
}

function getTextBlocks(
  view: { components: Array<Record<string, unknown>> },
  componentType: { Container: number; TextDisplay: number },
): string[] {
  const textBlocks: string[] = [];

  for (const topLevel of view.components) {
    if (topLevel.type !== componentType.Container) {
      continue;
    }

    const containerComponents = topLevel.components;
    if (!Array.isArray(containerComponents)) {
      continue;
    }

    for (const child of containerComponents) {
      if (!child || typeof child !== 'object' || child.type !== componentType.TextDisplay) {
        continue;
      }

      if (typeof child.content === 'string') {
        textBlocks.push(child.content);
      }
    }
  }

  return textBlocks;
}

describe('setup wizard v2 view', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'https://example.com';
  });

  it('returns components-v2 only payload with flags + components', async () => {
    const [{ buildSetupWizardV2View }, { COMPONENTS_V2_FLAGS, ComponentType, assertNoLegacyFieldsForV2 }, { t }] =
      await Promise.all([
        import('../../src/discord/setupWizard/view'),
        import('../../src/discord/ui-v2'),
        import('../../src/i18n')
      ]);

    const view = buildSetupWizardV2View(draft() as never, 'ru');

    expect((view.flags ?? 0) & COMPONENTS_V2_FLAGS).toBe(COMPONENTS_V2_FLAGS);
    expect(() => assertNoLegacyFieldsForV2(view as Record<string, unknown>)).not.toThrow();
    expect('content' in (view as Record<string, unknown>)).toBe(false);

    const textBlocks = getTextBlocks(view as never, ComponentType);
    expect(textBlocks.some((block) => block.includes(t('ru', 'setup.wizard.title')))).toBe(true);
    expect(textBlocks.some((block) => block.includes(t('ru', 'setup.wizard.step1')))).toBe(true);
    expect(textBlocks.some((block) => block.includes(t('ru', 'setup.wizard.line.status')))).toBe(true);
  });

  it('renders required selectors and toggles complete button by readiness', async () => {
    const [{ buildSetupWizardV2View }, { ChannelType, ComponentType }, { decodeCustomId }] = await Promise.all([
      import('../../src/discord/setupWizard/view'),
      import('../../src/discord/ui-v2'),
      import('../../src/discord/interactions/customId')
    ]);

    const incompleteView = buildSetupWizardV2View(draft() as never, 'ru');
    const completeView = buildSetupWizardV2View(
      draft({
        pairCategoryId: 'cat1',
        horoscopeChannelId: 'ch1',
        raidChannelId: 'ch2',
        hallChannelId: 'ch3',
        publicPostChannelId: 'ch4',
        anonInboxChannelId: 'ch5'
      }) as never,
      'ru',
    );

    const controls = getActionRowControls(incompleteView as never, ComponentType);

    const categorySelect = controls.find((item) => {
      const customId = item.custom_id;
      return typeof customId === 'string' && decodeCustomId(customId).action === 'pick_pair_category';
    });
    expect(categorySelect).toBeTruthy();
    expect(categorySelect?.channel_types).toEqual([ChannelType.GuildCategory]);

    const textChannelActions = [
      'pick_horoscope_channel',
      'pick_raid_channel',
      'pick_hall_channel',
      'pick_public_post_channel',
      'pick_anon_inbox_channel'
    ];

    for (const action of textChannelActions) {
      const selector = controls.find((item) => {
        const customId = item.custom_id;
        return typeof customId === 'string' && decodeCustomId(customId).action === action;
      });
      expect(selector).toBeTruthy();
      expect(selector?.channel_types).toEqual([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
    }

    const roleSelect = controls.find((item) => {
      const customId = item.custom_id;
      return typeof customId === 'string' && decodeCustomId(customId).action === 'pick_mod_role';
    });
    expect(roleSelect?.type).toBe(ComponentType.RoleSelect);

    const timezoneSelect = controls.find((item) => {
      const customId = item.custom_id;
      return typeof customId === 'string' && decodeCustomId(customId).action === 'pick_timezone';
    });
    expect(timezoneSelect?.type).toBe(ComponentType.StringSelect);

    const completeButtonIncomplete = controls.find((item) => {
      const customId = item.custom_id;
      return typeof customId === 'string' && decodeCustomId(customId).action === 'complete';
    });
    expect(completeButtonIncomplete?.disabled).toBe(true);

    const completeControls = getActionRowControls(completeView as never, ComponentType);
    const completeButtonReady = completeControls.find((item) => {
      const customId = item.custom_id;
      return typeof customId === 'string' && decodeCustomId(customId).action === 'complete';
    });
    expect(completeButtonReady?.disabled).toBe(false);

    const resetButton = completeControls.find((item) => {
      const customId = item.custom_id;
      return typeof customId === 'string' && decodeCustomId(customId).action === 'reset';
    });
    const testPostButton = completeControls.find((item) => {
      const customId = item.custom_id;
      return typeof customId === 'string' && decodeCustomId(customId).action === 'test_post';
    });
    expect(resetButton?.type).toBe(ComponentType.Button);
    expect(testPostButton?.type).toBe(ComponentType.Button);
  });
});
