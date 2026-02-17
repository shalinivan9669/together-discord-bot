import type { Guild } from 'discord.js';
import { JobNames, type JobName } from '../../infra/queue/jobs';
import { listRecurringScheduleStatus } from '../../infra/queue/scheduler';
import {
  evaluateFeatureState,
  getGuildConfig,
  guildFeatureNames,
  type GuildConfig,
  type GuildFeatureDependencyCode,
  type GuildFeatureName,
  type GuildFeatureState,
} from '../../app/services/guildConfigService';
import { runPermissionsCheck } from '../permissions/check';
import { createAdminTranslator, type AdminTranslationKey } from './i18n';

const scheduleOwnerFeature: Partial<Record<JobName, GuildFeatureName>> = {
  [JobNames.WeeklyHoroscopePublish]: 'horoscope',
  [JobNames.WeeklyCheckinNudge]: 'checkin',
  [JobNames.WeeklyRaidStart]: 'raid',
  [JobNames.WeeklyRaidEnd]: 'raid',
  [JobNames.DailyRaidOffersGenerate]: 'raid',
  [JobNames.RaidProgressRefresh]: 'raid',
  [JobNames.MonthlyHallRefresh]: 'hall',
  [JobNames.PublicPostPublish]: 'public_post',
};

const featureLabelKey: Record<GuildFeatureName, AdminTranslationKey> = {
  horoscope: 'feature.horoscope',
  anon: 'feature.anon',
  raid: 'feature.raid',
  checkin: 'feature.checkin',
  hall: 'feature.hall',
  public_post: 'feature.public_post',
};

function checkMark(ok: boolean): string {
  return ok ? '\u2705' : '\u274c';
}

function formatValue(value: string | null, notSetLabel: string): string {
  return value ? `\`${value}\`` : notSetLabel;
}

function permissionIssueForChannel(
  checks: Awaited<ReturnType<typeof runPermissionsCheck>>,
  channelId: string | null,
): string | null {
  if (!channelId) {
    return null;
  }

  const row = checks.find((check) => check.where === `channel:${channelId}` && !check.ok);
  if (!row) {
    return null;
  }

  return row.missing.join(', ');
}

function dependencyReasonLabel(
  dependency: GuildFeatureDependencyCode,
  t: (key: AdminTranslationKey) => string,
): string {
  if (dependency === 'anon_mod_role_not_selected') {
    return t('reason.anon_mod_role_not_selected');
  }

  return t('reason.channel_not_selected');
}

function buildFeatureReason(
  state: GuildFeatureState,
  permissionIssue: string | null,
  t: (key: AdminTranslationKey, params?: Record<string, string>) => string,
): string {
  if (!state.enabled) {
    return t('reason.disabled_by_admin');
  }

  if (!state.configured) {
    const details = [
      ...new Set(state.missingDependencies.map((item) => dependencyReasonLabel(item, t))),
    ].join(', ');
    return t('reason.enabled_not_configured', {
      details,
    });
  }

  if (permissionIssue) {
    return t('reason.permissions_missing', { missing: permissionIssue });
  }

  return t('reason.configured');
}

function buildNextActions(
  config: GuildConfig,
  featureStates: ReadonlyMap<GuildFeatureName, GuildFeatureState>,
): AdminTranslationKey[] {
  const actions: AdminTranslationKey[] = [];

  const hasDisabledFeatures = guildFeatureNames.some((feature) => {
    const state = featureStates.get(feature);
    return state ? !state.enabled : false;
  });

  if (hasDisabledFeatures) {
    actions.push('action.enable_all_features');
  }

  if (!config.pairCategoryId) {
    actions.push('action.pick_pair_category');
  }

  if (!config.horoscopeChannelId) {
    actions.push('action.pick_horoscope_channel');
  }

  if (!config.raidChannelId) {
    actions.push('action.pick_raid_channel');
  }

  if (!config.hallChannelId) {
    actions.push('action.pick_hall_channel');
  }

  if (!config.publicPostChannelId) {
    actions.push('action.pick_public_post_channel');
  }

  if (!config.anonInboxChannelId || !config.anonModRoleId) {
    actions.push('action.pick_anon_inbox_mod_role');
  }

  return [...new Set(actions)];
}

export async function buildAdminStatusReport(guild: Guild): Promise<string> {
  const config = await getGuildConfig(guild.id);
  const { t } = createAdminTranslator(config.locale);
  const scheduleStatus = await listRecurringScheduleStatus();
  const checks = await runPermissionsCheck({
    guild,
    pairCategoryId: config.pairCategoryId,
    targetChannelIds: [
      config.horoscopeChannelId,
      config.raidChannelId,
      config.hallChannelId,
      config.publicPostChannelId,
      config.anonInboxChannelId,
    ].filter((value): value is string => Boolean(value)),
  });

  const featureStates = new Map(
    guildFeatureNames.map((feature) => [feature, evaluateFeatureState(config, feature)]),
  );

  const featureLines = guildFeatureNames.map((feature) => {
    const state = featureStates.get(feature) ?? evaluateFeatureState(config, feature);
    const permissionIssue =
      feature === 'horoscope'
        ? permissionIssueForChannel(checks, config.horoscopeChannelId)
        : feature === 'raid'
          ? permissionIssueForChannel(checks, config.raidChannelId)
          : feature === 'hall'
            ? permissionIssueForChannel(checks, config.hallChannelId)
            : feature === 'public_post' || feature === 'checkin'
              ? permissionIssueForChannel(checks, config.publicPostChannelId)
              : permissionIssueForChannel(checks, config.anonInboxChannelId);

    const reason = buildFeatureReason(state, permissionIssue, t);
    const ok = state.enabled && state.configured && !permissionIssue;
    return `- ${t(featureLabelKey[feature])}: ${checkMark(ok)} ${reason}`;
  });

  const scheduleLines = scheduleStatus.map((schedule) => {
    const ownerFeature = scheduleOwnerFeature[schedule.name];
    const ownerState = ownerFeature ? featureStates.get(ownerFeature) : null;
    const willSkip = Boolean(schedule.enabled && ownerState && !ownerState.enabled);
    const skipSuffix = willSkip ? ` (${t('reason.schedule_feature_disabled_skip')})` : '';

    return `- ${schedule.name}: ${schedule.enabled ? t('schedule.enabled') : t('schedule.disabled')} (\`${schedule.cron}\`)${skipSuffix}`;
  });

  const configLines = [
    `- locale: \`${config.locale}\``,
    `- timezone: \`${config.timezone}\``,
    `- pair_category_id: ${formatValue(config.pairCategoryId, t('value.not_set'))}`,
    `- horoscope_channel_id: ${formatValue(config.horoscopeChannelId, t('value.not_set'))}`,
    `- raid_channel_id: ${formatValue(config.raidChannelId, t('value.not_set'))}`,
    `- hall_channel_id: ${formatValue(config.hallChannelId, t('value.not_set'))}`,
    `- public_post_channel_id: ${formatValue(config.publicPostChannelId, t('value.not_set'))}`,
    `- anon_inbox_channel_id: ${formatValue(config.anonInboxChannelId, t('value.not_set'))}`,
    `- anon_mod_role_id: ${formatValue(config.anonModRoleId, t('value.not_set'))}`,
  ];

  const permissionLines = checks.map((check) =>
    check.ok
      ? `- ${check.where}: ${checkMark(true)} ${t('value.ok')}`
      : `- ${check.where}: ${checkMark(false)} ${t('reason.permissions_missing', { missing: check.missing.join(', ') })}`,
  );

  const nextActions = buildNextActions(config, featureStates);
  const nextActionLines =
    nextActions.length > 0
      ? nextActions.map((action) => `- ${t(action)}`)
      : [`- ${t('action.none')}`];

  return [
    `## ${t('status.title')}`,
    '',
    `### ${t('section.features')}`,
    ...featureLines,
    '',
    `### ${t('section.schedules')}`,
    ...scheduleLines,
    '',
    `### ${t('section.config')}`,
    ...configLines,
    '',
    `### ${t('section.permissions')}`,
    ...permissionLines,
    '',
    `### ${t('section.next_actions')}`,
    ...nextActionLines,
  ].join('\n');
}
