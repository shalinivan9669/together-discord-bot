import { describe, expect, it } from 'vitest';
import {
  getMissingFeatureRequirementKeys,
  getSetupMissingRequirementKeys,
  isSetupRequirementsSatisfied,
  type GuildConfigRequirementShape,
} from '../../src/app/services/configRequirements';

function baseConfig(overrides?: Partial<GuildConfigRequirementShape>): GuildConfigRequirementShape {
  return {
    pairCategoryId: 'cat-1',
    horoscopeChannelId: 'ch-h',
    raidChannelId: 'ch-r',
    hallChannelId: 'ch-hall',
    publicPostChannelId: 'ch-pub',
    anonInboxChannelId: 'ch-anon',
    ...overrides
  };
}

describe('config requirements', () => {
  it('detects missing setup fields', () => {
    const missing = getSetupMissingRequirementKeys(
      baseConfig({
        raidChannelId: null,
        publicPostChannelId: null
      }),
    );

    expect(missing).toEqual(['raid_channel_id', 'public_post_channel_id']);
  });

  it('marks setup complete only when all required keys are present', () => {
    expect(isSetupRequirementsSatisfied(baseConfig())).toBe(true);
    expect(
      isSetupRequirementsSatisfied(
        baseConfig({
          pairCategoryId: null
        }),
      ),
    ).toBe(false);
  });

  it('treats anon moderator role as optional for feature configuration', () => {
    const missingAnon = getMissingFeatureRequirementKeys(baseConfig(), 'anon');
    expect(missingAnon).toEqual([]);

    const missingAnonInbox = getMissingFeatureRequirementKeys(
      baseConfig({
        anonInboxChannelId: null
      }),
      'anon',
    );
    expect(missingAnonInbox).toEqual(['anon_inbox_channel_id']);
  });
});
