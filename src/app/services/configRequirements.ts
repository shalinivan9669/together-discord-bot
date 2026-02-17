export type GuildFeatureConfigTarget =
  | 'oracle'
  | 'anon'
  | 'raid'
  | 'checkin'
  | 'hall'
  | 'public_post';

export type GuildConfigRequirementKey =
  | 'pair_category_id'
  | 'oracle_channel_id'
  | 'raid_channel_id'
  | 'hall_channel_id'
  | 'public_post_channel_id'
  | 'anon_inbox_channel_id';

export type GuildConfigRequirementShape = {
  pairCategoryId: string | null;
  oracleChannelId: string | null;
  raidChannelId: string | null;
  hallChannelId: string | null;
  publicPostChannelId: string | null;
  anonInboxChannelId: string | null;
};

const requirementReaders: Record<
  GuildConfigRequirementKey,
  (config: GuildConfigRequirementShape) => string | null
> = {
  pair_category_id: (config) => config.pairCategoryId,
  oracle_channel_id: (config) => config.oracleChannelId,
  raid_channel_id: (config) => config.raidChannelId,
  hall_channel_id: (config) => config.hallChannelId,
  public_post_channel_id: (config) => config.publicPostChannelId,
  anon_inbox_channel_id: (config) => config.anonInboxChannelId,
};

export const setupRequiredConfigKeys: readonly GuildConfigRequirementKey[] = [
  'pair_category_id',
  'oracle_channel_id',
  'raid_channel_id',
  'hall_channel_id',
  'public_post_channel_id',
  'anon_inbox_channel_id',
] as const;

const featureRequirementMap: Record<
  GuildFeatureConfigTarget,
  readonly GuildConfigRequirementKey[]
> = {
  oracle: ['oracle_channel_id'],
  anon: ['anon_inbox_channel_id'],
  raid: ['raid_channel_id'],
  checkin: ['public_post_channel_id'],
  hall: ['hall_channel_id'],
  public_post: ['public_post_channel_id'],
};

export function getConfigRequirementValue(
  config: GuildConfigRequirementShape,
  key: GuildConfigRequirementKey,
): string | null {
  return requirementReaders[key](config) ?? null;
}

export function getMissingConfigRequirementKeys(
  config: GuildConfigRequirementShape,
  keys: readonly GuildConfigRequirementKey[],
): GuildConfigRequirementKey[] {
  return keys.filter((key) => !getConfigRequirementValue(config, key));
}

export function getMissingFeatureRequirementKeys(
  config: GuildConfigRequirementShape,
  feature: GuildFeatureConfigTarget,
): GuildConfigRequirementKey[] {
  return getMissingConfigRequirementKeys(config, featureRequirementMap[feature]);
}

export function getSetupMissingRequirementKeys(
  config: GuildConfigRequirementShape,
): GuildConfigRequirementKey[] {
  return getMissingConfigRequirementKeys(config, setupRequiredConfigKeys);
}

export function isSetupRequirementsSatisfied(config: GuildConfigRequirementShape): boolean {
  return getSetupMissingRequirementKeys(config).length === 0;
}

