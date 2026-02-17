import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { getGuildSettings, upsertGuildSettings } from '../../infra/db/queries/guildSettings';

const CONFIG_CACHE_TTL_MS = 45_000;

export const guildFeatureNames = [
  'horoscope',
  'anon',
  'raid',
  'checkin',
  'hall',
  'public_post'
] as const;

export type GuildFeatureName = (typeof guildFeatureNames)[number];

export type GuildFeatureMap = Record<GuildFeatureName, boolean>;

export type GuildConfig = {
  guildId: string;
  timezone: string;
  pairCategoryId: string | null;
  horoscopeChannelId: string | null;
  raidChannelId: string | null;
  hallChannelId: string | null;
  publicPostChannelId: string | null;
  anonInboxChannelId: string | null;
  anonModRoleId: string | null;
  features: GuildFeatureMap;
  updatedAt: Date | null;
};

export type GuildConfigPatch = Partial<{
  timezone: string;
  pairCategoryId: string | null;
  horoscopeChannelId: string | null;
  raidChannelId: string | null;
  hallChannelId: string | null;
  publicPostChannelId: string | null;
  anonInboxChannelId: string | null;
  anonModRoleId: string | null;
  features: GuildFeatureMap;
}>;

export type GuildFeatureState = {
  feature: GuildFeatureName;
  enabled: boolean;
  configured: boolean;
  missingDependencies: string[];
  reason: string;
};

type CacheEntry = {
  value: GuildConfig;
  expiresAt: number;
};

const configCache = new Map<string, CacheEntry>();

const featureDefaults: GuildFeatureMap = {
  horoscope: env.PHASE2_HOROSCOPE_ENABLED,
  anon: env.PHASE2_ANON_ENABLED,
  raid: env.PHASE2_RAID_ENABLED,
  checkin: env.PHASE2_CHECKIN_ENABLED,
  hall: true,
  public_post: true
};

const featureLabels: Record<GuildFeatureName, string> = {
  horoscope: 'Horoscope',
  anon: 'Anonymous questions',
  raid: 'Raid',
  checkin: 'Check-in',
  hall: 'Hall',
  public_post: 'Public post'
};

function nowMs(): number {
  return Date.now();
}

function toFeatures(value: unknown): GuildFeatureMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...featureDefaults };
  }

  const source = value as Record<string, unknown>;
  return {
    horoscope: typeof source.horoscope === 'boolean' ? source.horoscope : featureDefaults.horoscope,
    anon: typeof source.anon === 'boolean' ? source.anon : featureDefaults.anon,
    raid: typeof source.raid === 'boolean' ? source.raid : featureDefaults.raid,
    checkin: typeof source.checkin === 'boolean' ? source.checkin : featureDefaults.checkin,
    hall: typeof source.hall === 'boolean' ? source.hall : featureDefaults.hall,
    public_post: typeof source.public_post === 'boolean' ? source.public_post : featureDefaults.public_post
  };
}

function normalizeConfig(guildId: string, row: Awaited<ReturnType<typeof getGuildSettings>>): GuildConfig {
  return {
    guildId,
    timezone: row?.timezone ?? env.DEFAULT_TIMEZONE,
    pairCategoryId: row?.pairCategoryId ?? null,
    horoscopeChannelId: row?.horoscopeChannelId ?? null,
    raidChannelId: row?.raidChannelId ?? null,
    hallChannelId: row?.hallChannelId ?? null,
    publicPostChannelId: row?.publicPostChannelId ?? row?.duelPublicChannelId ?? null,
    anonInboxChannelId: row?.anonInboxChannelId ?? row?.questionsChannelId ?? null,
    anonModRoleId: row?.anonModRoleId ?? row?.moderatorRoleId ?? null,
    features: toFeatures(row?.features),
    updatedAt: row?.updatedAt ?? null
  };
}

function dependencyMessages(config: GuildConfig, feature: GuildFeatureName): string[] {
  if (feature === 'horoscope') {
    return config.horoscopeChannelId ? [] : ['horoscope channel is not selected'];
  }

  if (feature === 'anon') {
    return config.anonInboxChannelId ? [] : ['anonymous inbox channel is not selected'];
  }

  if (feature === 'raid') {
    return config.raidChannelId ? [] : ['raid channel is not selected'];
  }

  if (feature === 'checkin') {
    return config.publicPostChannelId ? [] : ['public post channel is not selected'];
  }

  if (feature === 'hall') {
    return config.hallChannelId ? [] : ['hall channel is not selected'];
  }

  if (feature === 'public_post') {
    return config.publicPostChannelId ? [] : ['public post channel is not selected'];
  }

  return [];
}

function cacheSet(guildId: string, value: GuildConfig): GuildConfig {
  configCache.set(guildId, {
    value,
    expiresAt: nowMs() + CONFIG_CACHE_TTL_MS
  });

  return value;
}

export function invalidateGuildConfig(guildId: string): void {
  configCache.delete(guildId);
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const cached = configCache.get(guildId);
  if (cached && cached.expiresAt > nowMs()) {
    return cached.value;
  }

  const row = await getGuildSettings(guildId);
  return cacheSet(guildId, normalizeConfig(guildId, row));
}

export function evaluateFeatureState(config: GuildConfig, feature: GuildFeatureName): GuildFeatureState {
  if (!config.features[feature]) {
    return {
      feature,
      enabled: false,
      configured: false,
      missingDependencies: [],
      reason: 'disabled by admin'
    };
  }

  const missingDependencies = dependencyMessages(config, feature);
  if (missingDependencies.length > 0) {
    return {
      feature,
      enabled: true,
      configured: false,
      missingDependencies,
      reason: `enabled, but not configured (${missingDependencies.join(', ')})`
    };
  }

  return {
    feature,
    enabled: true,
    configured: true,
    missingDependencies: [],
    reason: 'configured'
  };
}

export async function getGuildFeatureState(guildId: string, feature: GuildFeatureName): Promise<GuildFeatureState> {
  const config = await getGuildConfig(guildId);
  return evaluateFeatureState(config, feature);
}

export async function assertGuildFeatureEnabled(guildId: string, feature: GuildFeatureName): Promise<void> {
  const state = await getGuildFeatureState(guildId, feature);

  if (!state.enabled) {
    throw new Error(`${featureLabels[feature]} feature is disabled`);
  }

  if (!state.configured) {
    throw new Error('Feature is enabled, but not configured: run `/setup start` to set required channels.');
  }
}

export async function updateGuildConfig(guildId: string, patch: GuildConfigPatch): Promise<GuildConfig> {
  const dbPatch: Parameters<typeof upsertGuildSettings>[1] = {
    timezone: patch.timezone,
    pairCategoryId: patch.pairCategoryId,
    horoscopeChannelId: patch.horoscopeChannelId,
    raidChannelId: patch.raidChannelId,
    hallChannelId: patch.hallChannelId,
    publicPostChannelId: patch.publicPostChannelId,
    anonInboxChannelId: patch.anonInboxChannelId,
    anonModRoleId: patch.anonModRoleId,
    features: patch.features,
    // Keep legacy columns synchronized for compatibility with existing paths.
    duelPublicChannelId: patch.publicPostChannelId,
    questionsChannelId: patch.anonInboxChannelId,
    moderatorRoleId: patch.anonModRoleId
  };

  await upsertGuildSettings(guildId, dbPatch);
  invalidateGuildConfig(guildId);

  const next = await getGuildConfig(guildId);
  logger.info({ feature: 'config', action: 'config.updated', guild_id: guildId }, 'Guild config updated');
  return next;
}

export async function setGuildFeature(guildId: string, feature: GuildFeatureName, enabled: boolean): Promise<GuildConfig> {
  const config = await getGuildConfig(guildId);
  const nextFeatures: GuildFeatureMap = {
    ...config.features,
    [feature]: enabled
  };

  await upsertGuildSettings(guildId, {
    features: nextFeatures
  });

  invalidateGuildConfig(guildId);

  const next = await getGuildConfig(guildId);
  logger.info(
    {
      feature: 'config',
      action: 'feature.toggled',
      guild_id: guildId,
      feature_name: feature,
      enabled
    },
    'Guild feature toggled',
  );

  return next;
}

export async function setGuildFeatures(guildId: string, patch: Partial<GuildFeatureMap>): Promise<GuildConfig> {
  const config = await getGuildConfig(guildId);
  const nextFeatures: GuildFeatureMap = {
    ...config.features,
    ...patch
  };

  await upsertGuildSettings(guildId, {
    features: nextFeatures
  });

  invalidateGuildConfig(guildId);
  const next = await getGuildConfig(guildId);
  logger.info({ feature: 'config', action: 'config.updated', guild_id: guildId }, 'Guild features updated');
  return next;
}

export function formatFeatureLabel(feature: GuildFeatureName): string {
  return featureLabels[feature];
}
