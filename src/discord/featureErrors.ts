import {
  type GuildFeatureName,
  GuildFeatureUnavailableError,
} from '../app/services/guildConfigService';
import type { GuildConfigRequirementKey } from '../app/services/configRequirements';
import { t, type AppLocale, type I18nKey } from '../i18n';

const featureLabelKey: Record<GuildFeatureName, I18nKey> = {
  horoscope: 'admin.status.feature.horoscope',
  anon: 'admin.status.feature.anon',
  raid: 'admin.status.feature.raid',
  checkin: 'admin.status.feature.checkin',
  hall: 'admin.status.feature.hall',
  public_post: 'admin.status.feature.public_post',
};

const requirementLabelKey: Record<GuildConfigRequirementKey, I18nKey> = {
  pair_category_id: 'config.requirement.pair_category_id',
  horoscope_channel_id: 'config.requirement.horoscope_channel_id',
  raid_channel_id: 'config.requirement.raid_channel_id',
  hall_channel_id: 'config.requirement.hall_channel_id',
  public_post_channel_id: 'config.requirement.public_post_channel_id',
  anon_inbox_channel_id: 'config.requirement.anon_inbox_channel_id',
};

export function formatRequirementLabel(locale: AppLocale, key: GuildConfigRequirementKey): string {
  return t(locale, requirementLabelKey[key]);
}

export function formatFeatureUnavailableError(
  locale: AppLocale,
  error: unknown,
): string | null {
  if (!(error instanceof GuildFeatureUnavailableError)) {
    return null;
  }

  const featureLabel = t(locale, featureLabelKey[error.feature]);
  if (error.code === 'feature_disabled') {
    return t(locale, 'feature.error.disabled', { feature: featureLabel });
  }

  const missing =
    error.missingRequirements.length > 0
      ? error.missingRequirements.map((key) => formatRequirementLabel(locale, key)).join(', ')
      : t(locale, 'feature.error.missing_unknown');

  return t(locale, 'feature.error.not_configured', {
    feature: featureLabel,
    missing
  });
}
