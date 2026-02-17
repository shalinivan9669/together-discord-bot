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
import { t, type I18nKey } from '../../i18n';

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

const featureLabelKey: Record<GuildFeatureName, I18nKey> = {
  horoscope: 'admin.status.feature.horoscope',
  anon: 'admin.status.feature.anon',
  raid: 'admin.status.feature.raid',
  checkin: 'admin.status.feature.checkin',
  hall: 'admin.status.feature.hall',
  public_post: 'admin.status.feature.public_post',
};

const permissionLabelKey: Record<string, I18nKey> = {
  'Manage Channels': 'permissions.manage_channels',
  'View Channels': 'permissions.view_channels',
  'Send Messages': 'permissions.send_messages',
  'Embed Links': 'permissions.embed_links',
  'Read Message History': 'permissions.read_history',
  'Manage Messages': 'permissions.manage_messages',
  'Category is missing or not a category': 'permissions.category_missing',
  'Channel not found': 'permissions.channel_not_found'
};

function checkMark(ok: boolean): string {
  return ok ? '\u2705' : '\u274c';
}

function formatValue(value: string | null, notSetLabel: string): string {
  return value ? `\`${value}\`` : notSetLabel;
}

function translatePermissionLabels(locale: GuildConfig['locale'], missing: string[]): string {
  return missing
    .map((label) => {
      const key = permissionLabelKey[label];
      return key ? t(locale, key) : label;
    })
    .join(', ');
}

function permissionIssueForChannel(
  locale: GuildConfig['locale'],
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

  return translatePermissionLabels(locale, row.missing);
}

function dependencyReasonLabel(
  locale: GuildConfig['locale'],
  dependency: GuildFeatureDependencyCode,
): string {
  if (dependency === 'anon_mod_role_not_selected') {
    return t(locale, 'admin.status.reason.anon_mod_role_not_selected');
  }

  return t(locale, 'admin.status.reason.channel_not_selected');
}

function buildFeatureReason(
  locale: GuildConfig['locale'],
  state: GuildFeatureState,
  permissionIssue: string | null,
): string {
  if (!state.enabled) {
    return t(locale, 'admin.status.reason.disabled_by_admin');
  }

  if (!state.configured) {
    const details = [
      ...new Set(state.missingDependencies.map((item) => dependencyReasonLabel(locale, item))),
    ].join(', ');
    return t(locale, 'admin.status.reason.enabled_not_configured', {
      details,
    });
  }

  if (permissionIssue) {
    return t(locale, 'admin.status.reason.permissions_missing', { missing: permissionIssue });
  }

  return t(locale, 'admin.status.reason.configured');
}

function buildNextActions(
  config: GuildConfig,
  featureStates: ReadonlyMap<GuildFeatureName, GuildFeatureState>,
): I18nKey[] {
  const actions: I18nKey[] = [];

  const hasDisabledFeatures = guildFeatureNames.some((feature) => {
    const state = featureStates.get(feature);
    return state ? !state.enabled : false;
  });

  if (hasDisabledFeatures) {
    actions.push('admin.status.next.enable_all_features');
  }

  if (!config.pairCategoryId) {
    actions.push('admin.status.next.pick_pair_category');
  }

  if (!config.horoscopeChannelId) {
    actions.push('admin.status.next.pick_horoscope_channel');
  }

  if (!config.raidChannelId) {
    actions.push('admin.status.next.pick_raid_channel');
  }

  if (!config.hallChannelId) {
    actions.push('admin.status.next.pick_hall_channel');
  }

  if (!config.publicPostChannelId) {
    actions.push('admin.status.next.pick_public_post_channel');
  }

  if (!config.anonInboxChannelId || !config.anonModRoleId) {
    actions.push('admin.status.next.pick_anon_inbox_mod_role');
  }

  return [...new Set(actions)];
}

export async function buildAdminStatusReport(guild: Guild): Promise<string> {
  const config = await getGuildConfig(guild.id);
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
    locale: config.locale
  });

  const featureStates = new Map(
    guildFeatureNames.map((feature) => [feature, evaluateFeatureState(config, feature)]),
  );

  const featureLines = guildFeatureNames.map((feature) => {
    const state = featureStates.get(feature) ?? evaluateFeatureState(config, feature);
    const permissionIssue =
      feature === 'horoscope'
        ? permissionIssueForChannel(config.locale, checks, config.horoscopeChannelId)
        : feature === 'raid'
          ? permissionIssueForChannel(config.locale, checks, config.raidChannelId)
          : feature === 'hall'
            ? permissionIssueForChannel(config.locale, checks, config.hallChannelId)
            : feature === 'public_post' || feature === 'checkin'
              ? permissionIssueForChannel(config.locale, checks, config.publicPostChannelId)
              : permissionIssueForChannel(config.locale, checks, config.anonInboxChannelId);

    const reason = buildFeatureReason(config.locale, state, permissionIssue);
    const ok = state.enabled && state.configured && !permissionIssue;
    return `- ${t(config.locale, featureLabelKey[feature])}: ${checkMark(ok)} ${reason}`;
  });

  const scheduleLines = scheduleStatus.map((schedule) => {
    const ownerFeature = scheduleOwnerFeature[schedule.name];
    const ownerState = ownerFeature ? featureStates.get(ownerFeature) : null;
    const willSkip = Boolean(schedule.enabled && ownerState && !ownerState.enabled);
    const skipSuffix = willSkip ? ` (${t(config.locale, 'admin.status.reason.schedule_feature_disabled_skip')})` : '';

    return `- ${schedule.name}: ${schedule.enabled ? t(config.locale, 'common.enabled') : t(config.locale, 'common.disabled')} (\`${schedule.cron}\`)${skipSuffix}`;
  });

  const configLines = [
    `- ${t(config.locale, 'admin.status.config.locale')}: \`${config.locale}\``,
    `- ${t(config.locale, 'admin.status.config.timezone')}: \`${config.timezone}\``,
    `- ${t(config.locale, 'admin.status.config.pair_category_id')}: ${formatValue(config.pairCategoryId, t(config.locale, 'common.not_set'))}`,
    `- ${t(config.locale, 'admin.status.config.horoscope_channel_id')}: ${formatValue(config.horoscopeChannelId, t(config.locale, 'common.not_set'))}`,
    `- ${t(config.locale, 'admin.status.config.raid_channel_id')}: ${formatValue(config.raidChannelId, t(config.locale, 'common.not_set'))}`,
    `- ${t(config.locale, 'admin.status.config.hall_channel_id')}: ${formatValue(config.hallChannelId, t(config.locale, 'common.not_set'))}`,
    `- ${t(config.locale, 'admin.status.config.public_post_channel_id')}: ${formatValue(config.publicPostChannelId, t(config.locale, 'common.not_set'))}`,
    `- ${t(config.locale, 'admin.status.config.anon_inbox_channel_id')}: ${formatValue(config.anonInboxChannelId, t(config.locale, 'common.not_set'))}`,
    `- ${t(config.locale, 'admin.status.config.anon_mod_role_id')}: ${formatValue(config.anonModRoleId, t(config.locale, 'common.not_set'))}`,
  ];

  const permissionLines = checks.map((check) =>
    check.ok
      ? `- ${check.where}: ${checkMark(true)} ${t(config.locale, 'common.ok')}`
      : `- ${check.where}: ${checkMark(false)} ${t(config.locale, 'admin.status.reason.permissions_missing', { missing: translatePermissionLabels(config.locale, check.missing) })}`,
  );

  const nextActions = buildNextActions(config, featureStates);
  const nextActionLines =
    nextActions.length > 0
      ? nextActions.map((action) => `- ${t(config.locale, action)}`)
      : [`- ${t(config.locale, 'admin.status.next.none')}`];

  return [
    `## ${t(config.locale, 'admin.status.title')}`,
    '',
    `### ${t(config.locale, 'admin.status.section.features')}`,
    ...featureLines,
    '',
    `### ${t(config.locale, 'admin.status.section.schedules')}`,
    ...scheduleLines,
    '',
    `### ${t(config.locale, 'admin.status.section.config')}`,
    ...configLines,
    '',
    `### ${t(config.locale, 'admin.status.section.permissions')}`,
    ...permissionLines,
    '',
    `### ${t(config.locale, 'admin.status.section.next_actions')}`,
    ...nextActionLines,
  ].join('\n');
}
