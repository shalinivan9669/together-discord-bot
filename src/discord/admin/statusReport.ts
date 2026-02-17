import type { Guild } from 'discord.js';
import {
  evaluateFeatureState,
  formatFeatureLabel,
  getGuildConfig,
  guildFeatureNames,
} from '../../app/services/guildConfigService';
import { listRecurringScheduleStatus } from '../../infra/queue/scheduler';
import { runPermissionsCheck } from '../permissions/check';

function checkMark(ok: boolean): string {
  return ok ? '\u2705' : '\u274c';
}

function formatValue(value: string | null): string {
  return value ? `\`${value}\`` : 'not set';
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

  return `missing permissions (${row.missing.join(', ')})`;
}

function buildFeatureReason(input: {
  baseReason: string;
  permissionIssue: string | null;
  isEnabled: boolean;
  isConfigured: boolean;
}): string {
  if (!input.isEnabled || !input.isConfigured) {
    return input.baseReason;
  }

  if (input.permissionIssue) {
    return input.permissionIssue;
  }

  return 'configured';
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
      config.anonInboxChannelId
    ].filter((value): value is string => Boolean(value))
  });

  const featureLines = guildFeatureNames.map((feature) => {
    const state = evaluateFeatureState(config, feature);
    const permissionIssue = feature === 'horoscope'
      ? permissionIssueForChannel(checks, config.horoscopeChannelId)
      : feature === 'raid'
        ? permissionIssueForChannel(checks, config.raidChannelId)
        : feature === 'hall'
          ? permissionIssueForChannel(checks, config.hallChannelId)
          : feature === 'public_post' || feature === 'checkin'
            ? permissionIssueForChannel(checks, config.publicPostChannelId)
            : permissionIssueForChannel(checks, config.anonInboxChannelId);

    const reason = buildFeatureReason({
      baseReason: state.reason,
      permissionIssue,
      isEnabled: state.enabled,
      isConfigured: state.configured
    });

    const ok = state.enabled && state.configured && !permissionIssue;
    return `- ${formatFeatureLabel(feature)}: ${checkMark(ok)} ${reason}`;
  });

  const scheduleLines = scheduleStatus.map(
    (schedule) => `- ${schedule.name}: ${schedule.enabled ? 'enabled' : 'disabled'} (\`${schedule.cron}\`)`,
  );

  const configLines = [
    `- timezone: \`${config.timezone}\``,
    `- pair_category_id: ${formatValue(config.pairCategoryId)}`,
    `- horoscope_channel_id: ${formatValue(config.horoscopeChannelId)}`,
    `- raid_channel_id: ${formatValue(config.raidChannelId)}`,
    `- hall_channel_id: ${formatValue(config.hallChannelId)}`,
    `- public_post_channel_id: ${formatValue(config.publicPostChannelId)}`,
    `- anon_inbox_channel_id: ${formatValue(config.anonInboxChannelId)}`,
    `- anon_mod_role_id: ${formatValue(config.anonModRoleId)}`
  ];

  const permissionLines = checks.map((check) => (
    check.ok
      ? `- ${check.where}: \u2705 ok`
      : `- ${check.where}: \u274c missing ${check.missing.join(', ')}`
  ));

  return [
    '## Admin Status',
    '',
    '### Features',
    ...featureLines,
    '',
    '### Schedules',
    ...scheduleLines,
    '',
    '### Config',
    ...configLines,
    '',
    '### Permissions',
    ...permissionLines
  ].join('\n');
}
