import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import type { AppLocale } from '../../i18n';
import { getGuildSettings, upsertGuildSettings } from '../../infra/db/queries/guildSettings';
import {
  getMissingFeatureRequirementKeys,
  type GuildConfigRequirementKey,
} from './configRequirements';

const CONFIG_CACHE_TTL_MS = 45_000;

export const guildFeatureNames = [
  'oracle',
  'anon',
  'raid',
  'checkin',
  'hall',
  'public_post',
] as const;

export type GuildFeatureName = (typeof guildFeatureNames)[number];
export type GuildLocale = AppLocale;

export type GuildFeatureMap = Record<GuildFeatureName, boolean>;
export type GuildFeatureDependencyCode = 'channel_not_selected' | 'anon_mod_role_not_selected';
export type GuildFeatureReasonCode = 'disabled_by_admin' | 'enabled_not_configured' | 'configured';

export type GuildFeatureUnavailableCode = 'feature_disabled' | 'feature_not_configured';

export class GuildFeatureUnavailableError extends Error {
  readonly code: GuildFeatureUnavailableCode;
  readonly feature: GuildFeatureName;
  readonly missingRequirements: GuildConfigRequirementKey[];

  constructor(input: {
    code: GuildFeatureUnavailableCode;
    feature: GuildFeatureName;
    missingRequirements?: GuildConfigRequirementKey[];
  }) {
    const suffix =
      input.code === 'feature_not_configured' && input.missingRequirements && input.missingRequirements.length > 0
        ? ` (${input.missingRequirements.join(', ')})`
        : '';
    super(`${input.feature}:${input.code}${suffix}`);
    this.name = 'GuildFeatureUnavailableError';
    this.code = input.code;
    this.feature = input.feature;
    this.missingRequirements = input.missingRequirements ?? [];
  }
}

export type GuildConfig = {
  guildId: string;
  locale: GuildLocale;
  timezone: string;
  pairCategoryId: string | null;
  oracleChannelId: string | null;
  raidChannelId: string | null;
  hallChannelId: string | null;
  publicPostChannelId: string | null;
  anonInboxChannelId: string | null;
  anonModRoleId: string | null;
  features: GuildFeatureMap;
  updatedAt: Date | null;
};

export type GuildConfigPatch = Partial<{
  locale: GuildLocale;
  timezone: string;
  pairCategoryId: string | null;
  oracleChannelId: string | null;
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
  missingDependencies: GuildFeatureDependencyCode[];
  reasonCode: GuildFeatureReasonCode;
  reason: string;
};

type CacheEntry = {
  value: GuildConfig;
  expiresAt: number;
};

const configCache = new Map<string, CacheEntry>();

const featureDefaults: GuildFeatureMap = {
  oracle: env.PHASE2_ORACLE_ENABLED,
  anon: env.PHASE2_ANON_ENABLED,
  raid: env.PHASE2_RAID_ENABLED,
  checkin: env.PHASE2_CHECKIN_ENABLED,
  hall: true,
  public_post: true,
};

const featureLabels: Record<GuildFeatureName, string> = {
  oracle: 'Oracle',
  anon: 'Anonymous questions',
  raid: 'Raid',
  checkin: 'Check-in',
  hall: 'Hall',
  public_post: 'Public post',
};

function nowMs(): number {
  return Date.now();
}

function toLocale(value: unknown): GuildLocale {
  return value === 'en' ? 'en' : 'ru';
}

function toFeatures(value: unknown): GuildFeatureMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...featureDefaults };
  }

  const source = value as Record<string, unknown>;
  const oracleEnabled = typeof source.oracle === 'boolean'
    ? source.oracle
    : typeof source.horoscope === 'boolean'
      ? source.horoscope
      : featureDefaults.oracle;

  return {
    oracle: oracleEnabled,
    anon: typeof source.anon === 'boolean' ? source.anon : featureDefaults.anon,
    raid: typeof source.raid === 'boolean' ? source.raid : featureDefaults.raid,
    checkin: typeof source.checkin === 'boolean' ? source.checkin : featureDefaults.checkin,
    hall: typeof source.hall === 'boolean' ? source.hall : featureDefaults.hall,
    public_post:
      typeof source.public_post === 'boolean' ? source.public_post : featureDefaults.public_post,
  };
}

function dependencyCodeToMessage(code: GuildFeatureDependencyCode): string {
  if (code === 'anon_mod_role_not_selected') {
    return 'moderator role is not selected';
  }

  return 'channel is not selected';
}

function normalizeConfig(
  guildId: string,
  row: Awaited<ReturnType<typeof getGuildSettings>>,
): GuildConfig {
  return {
    guildId,
    locale: toLocale(row?.locale),
    timezone: row?.timezone ?? env.DEFAULT_TIMEZONE,
    pairCategoryId: row?.pairCategoryId ?? null,
    oracleChannelId: row?.oracleChannelId ?? null,
    raidChannelId: row?.raidChannelId ?? null,
    hallChannelId: row?.hallChannelId ?? null,
    publicPostChannelId: row?.publicPostChannelId ?? row?.duelPublicChannelId ?? null,
    anonInboxChannelId: row?.anonInboxChannelId ?? row?.questionsChannelId ?? null,
    anonModRoleId: row?.anonModRoleId ?? row?.moderatorRoleId ?? null,
    features: toFeatures(row?.features),
    updatedAt: row?.updatedAt ?? null,
  };
}

function dependencyCodes(
  config: GuildConfig,
  feature: GuildFeatureName,
): GuildFeatureDependencyCode[] {
  return getMissingFeatureRequirementKeys(config, feature).map(() => 'channel_not_selected');
}

function cacheSet(guildId: string, value: GuildConfig): GuildConfig {
  configCache.set(guildId, {
    value,
    expiresAt: nowMs() + CONFIG_CACHE_TTL_MS,
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

export function evaluateFeatureState(
  config: GuildConfig,
  feature: GuildFeatureName,
): GuildFeatureState {
  if (!config.features[feature]) {
    return {
      feature,
      enabled: false,
      configured: false,
      missingDependencies: [],
      reasonCode: 'disabled_by_admin',
      reason: 'disabled by admin',
    };
  }

  const missingDependencies = dependencyCodes(config, feature);
  if (missingDependencies.length > 0) {
    return {
      feature,
      enabled: true,
      configured: false,
      missingDependencies,
      reasonCode: 'enabled_not_configured',
      reason: `enabled, but not configured (${missingDependencies.map((item) => dependencyCodeToMessage(item)).join(', ')})`,
    };
  }

  return {
    feature,
    enabled: true,
    configured: true,
    missingDependencies: [],
    reasonCode: 'configured',
    reason: 'configured',
  };
}

export async function getGuildFeatureState(
  guildId: string,
  feature: GuildFeatureName,
): Promise<GuildFeatureState> {
  const config = await getGuildConfig(guildId);
  return evaluateFeatureState(config, feature);
}

export async function assertGuildFeatureEnabled(
  guildId: string,
  feature: GuildFeatureName,
): Promise<void> {
  const config = await getGuildConfig(guildId);
  const state = evaluateFeatureState(config, feature);

  if (!state.enabled) {
    throw new GuildFeatureUnavailableError({
      code: 'feature_disabled',
      feature
    });
  }

  if (!state.configured) {
    throw new GuildFeatureUnavailableError({
      code: 'feature_not_configured',
      feature,
      missingRequirements: getMissingFeatureRequirementKeys(config, feature)
    });
  }
}

export async function updateGuildConfig(
  guildId: string,
  patch: GuildConfigPatch,
): Promise<GuildConfig> {
  const dbPatch: Parameters<typeof upsertGuildSettings>[1] = {
    locale: patch.locale,
    timezone: patch.timezone,
    pairCategoryId: patch.pairCategoryId,
    oracleChannelId: patch.oracleChannelId,
    raidChannelId: patch.raidChannelId,
    hallChannelId: patch.hallChannelId,
    publicPostChannelId: patch.publicPostChannelId,
    anonInboxChannelId: patch.anonInboxChannelId,
    anonModRoleId: patch.anonModRoleId,
    features: patch.features,
    // Keep legacy columns synchronized for compatibility with existing paths.
    duelPublicChannelId: patch.publicPostChannelId,
    questionsChannelId: patch.anonInboxChannelId,
    moderatorRoleId: patch.anonModRoleId,
  };

  await upsertGuildSettings(guildId, dbPatch);
  invalidateGuildConfig(guildId);

  const next = await getGuildConfig(guildId);
  logger.info(
    { feature: 'config', action: 'config.updated', guild_id: guildId },
    'Guild config updated',
  );
  return next;
}

export async function setGuildFeature(
  guildId: string,
  feature: GuildFeatureName,
  enabled: boolean,
): Promise<GuildConfig> {
  const config = await getGuildConfig(guildId);
  const nextFeatures: GuildFeatureMap = {
    ...config.features,
    [feature]: enabled,
  };

  await upsertGuildSettings(guildId, {
    features: nextFeatures,
  });

  invalidateGuildConfig(guildId);

  const next = await getGuildConfig(guildId);
  logger.info(
    {
      feature: 'config',
      action: 'feature.toggled',
      guild_id: guildId,
      feature_name: feature,
      enabled,
    },
    'Guild feature toggled',
  );

  return next;
}

export async function setGuildFeatures(
  guildId: string,
  patch: Partial<GuildFeatureMap>,
): Promise<GuildConfig> {
  const config = await getGuildConfig(guildId);
  const nextFeatures: GuildFeatureMap = {
    ...config.features,
    ...patch,
  };

  await upsertGuildSettings(guildId, {
    features: nextFeatures,
  });

  invalidateGuildConfig(guildId);
  const next = await getGuildConfig(guildId);
  logger.info(
    { feature: 'config', action: 'config.updated', guild_id: guildId },
    'Guild features updated',
  );
  return next;
}

export async function setAllGuildFeatures(guildId: string, enabled: boolean): Promise<GuildConfig> {
  const patch = guildFeatureNames.reduce((acc, feature) => {
    acc[feature] = enabled;
    return acc;
  }, {} as GuildFeatureMap);

  return setGuildFeatures(guildId, patch);
}

export function formatFeatureLabel(feature: GuildFeatureName): string {
  return featureLabels[feature];
}

export async function setGuildLocale(guildId: string, locale: GuildLocale): Promise<GuildConfig> {
  return updateGuildConfig(guildId, { locale });
}

