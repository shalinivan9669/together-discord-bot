import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type GuildBasedChannel,
  type RoleSelectMenuInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type PgBoss from 'pg-boss';
import { z } from 'zod';
import { buildHoroscopeDedupeKey, computeNextRun } from '../../app/services/astroHoroscopeService';
import {
  evaluateFeatureState,
  getGuildConfig,
  guildFeatureNames,
  setGuildFeatures,
  updateGuildConfig,
} from '../../app/services/guildConfigService';
import { getSetupMissingRequirementKeys } from '../../app/services/configRequirements';
import { type JobName, JobNames } from '../../infra/queue/jobs';
import { setRecurringScheduleEnabled } from '../../infra/queue/scheduler';
import { t, type AppLocale } from '../../i18n';
import { createCorrelationId } from '../../lib/correlation';
import { startOfWeekIso } from '../../lib/time';
import { waitForSetupTestStatus } from '../../app/services/setupTestStatusService';
import { formatRequirementLabel } from '../featureErrors';
import { logInteraction } from '../interactionLog';
import { editComponentsV2Message, toComponentsV2EditBody } from '../ui-v2';
import type { CustomIdEnvelope } from './customId';
import {
  clearSetupWizardDraft,
  ensureSetupWizardDraft,
  getSetupWizardDraft,
  patchSetupWizardDraft,
  resetSetupWizardDraft,
  type SetupWizardDraft,
} from '../setupWizard/state';
import { isSupportedSetupWizardTimezone, isValidIanaTimezone } from '../setupWizard/timezones';
import {
  buildSetupWizardV2View,
  type SetupWizardPanelMode,
} from '../setupWizard/view';

export type SetupWizardInteraction =
  | ButtonInteraction
  | ChannelSelectMenuInteraction
  | RoleSelectMenuInteraction
  | StringSelectMenuInteraction;

const actionSchema = z.enum([
  'pick_pair_category',
  'pick_oracle_channel',
  'pick_horoscope_channel',
  'pick_horoscope_enabled',
  'pick_horoscope_frequency',
  'pick_duels_channel',
  'pick_raid_channel',
  'pick_hall_channel',
  'pick_public_post_channel',
  'pick_anon_inbox_channel',
  'pick_mod_role',
  'pick_timezone',
  'complete',
  'reset',
  'test_post',
  'test_post_oracle',
  'test_post_horoscope',
  'test_post_both'
]);

const scheduleFeatureMap: ReadonlyArray<{ name: JobName; feature: (typeof guildFeatureNames)[number] }> = [
  { name: JobNames.OracleWeeklyPublish, feature: 'oracle' },
  { name: JobNames.WeeklyCheckinNudge, feature: 'checkin' },
  { name: JobNames.WeeklyRaidStart, feature: 'raid' },
  { name: JobNames.WeeklyRaidEnd, feature: 'raid' },
  { name: JobNames.DailyRaidOffersGenerate, feature: 'raid' },
  { name: JobNames.RaidProgressRefresh, feature: 'raid' },
  { name: JobNames.MonthlyHallRefresh, feature: 'hall' },
  { name: JobNames.PublicPostPublish, feature: 'public_post' }
];

function isAdmin(interaction: SetupWizardInteraction): boolean {
  return interaction.inCachedGuild()
    && interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
}

function localeForSetupWizard(): AppLocale {
  return 'ru';
}

async function ensureDraft(interaction: SetupWizardInteraction): Promise<SetupWizardDraft> {
  const existing = getSetupWizardDraft(interaction.guildId ?? '', interaction.user.id);
  if (existing) {
    return existing;
  }

  if (!interaction.guildId) {
    throw new Error('Guild-only action');
  }

  const config = await getGuildConfig(interaction.guildId);
  return ensureSetupWizardDraft(interaction.guildId, interaction.user.id, config);
}

async function updatePanel(
  interaction: SetupWizardInteraction,
  draft: SetupWizardDraft,
  locale: AppLocale,
  mode: SetupWizardPanelMode = 'draft',
): Promise<void> {
  const panel = buildSetupWizardV2View(draft, locale, { mode });
  const payload = toComponentsV2EditBody(panel);

  if ('message' in interaction && interaction.message) {
    await editComponentsV2Message(interaction.client, interaction.channelId, interaction.message.id, panel);
    return;
  }

  await interaction.editReply(payload as never);
}

async function getMissingPostPermissions(
  interaction: SetupWizardInteraction,
  channelId: string,
  locale: AppLocale,
): Promise<string[] | null> {
  const channel = await fetchGuildChannel(interaction, channelId);
  if (!channel || !isSetupTextChannel(channel)) {
    return null;
  }

  const me = channel.guild.members.me ?? await channel.guild.members.fetchMe();
  const permissions = me.permissionsIn(channel.id);
  const missing: string[] = [];
  if (!permissions.has(PermissionFlagsBits.ViewChannel)) {
    missing.push(t(locale, 'permissions.view_channels'));
  }
  if (!permissions.has(PermissionFlagsBits.SendMessages)) {
    missing.push(t(locale, 'permissions.send_messages'));
  }
  if (!permissions.has(PermissionFlagsBits.EmbedLinks)) {
    missing.push(t(locale, 'permissions.embed_links'));
  }
  if (!permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
    missing.push(t(locale, 'permissions.read_history'));
  }

  return missing;
}

async function autoEnableConfiguredFeatures(guildId: string): Promise<void> {
  const config = await getGuildConfig(guildId);
  const patch: Partial<Record<(typeof guildFeatureNames)[number], boolean>> = {};

  for (const feature of guildFeatureNames) {
    const probeConfig = {
      ...config,
      features: {
        ...config.features,
        [feature]: true
      }
    };

    const state = evaluateFeatureState(probeConfig, feature);
    if (state.configured) {
      patch[feature] = true;
    }
  }

  if (Object.keys(patch).length > 0) {
    await setGuildFeatures(guildId, patch);
  }
}

async function autoEnableSafeSchedules(boss: PgBoss, guildId: string): Promise<void> {
  const config = await getGuildConfig(guildId);

  for (const item of scheduleFeatureMap) {
    const state = evaluateFeatureState(config, item.feature);
    if (!state.enabled || !state.configured) {
      continue;
    }

    await setRecurringScheduleEnabled(boss, item.name, true);
  }

  await setRecurringScheduleEnabled(boss, JobNames.AstroTickDaily, true);
}

function parseWizardOwner(decoded: CustomIdEnvelope): string | null {
  const owner = decoded.payload.u;
  return typeof owner === 'string' && owner.length > 0 ? owner : null;
}

async function fetchGuildChannel(
  interaction: SetupWizardInteraction,
  channelId: string,
): Promise<GuildBasedChannel | null> {
  try {
    const guild = interaction.guild ?? await interaction.client.guilds.fetch(interaction.guildId!);
    const channel = await guild.channels.fetch(channelId);
    return channel;
  } catch {
    return null;
  }
}

function isSetupTextChannel(channel: GuildBasedChannel): boolean {
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

async function validateDraftBeforeCommit(
  interaction: SetupWizardInteraction,
  draft: SetupWizardDraft,
  locale: AppLocale,
): Promise<string[]> {
  const errors: string[] = [];

  if (!isValidIanaTimezone(draft.timezone)) {
    errors.push(t(locale, 'setup.wizard.error.invalid_timezone'));
  }

  if (draft.pairCategoryId) {
    const category = await fetchGuildChannel(interaction, draft.pairCategoryId);
    if (!category || category.type !== ChannelType.GuildCategory) {
      errors.push(t(locale, 'setup.wizard.error.pair_category_not_category'));
    }
  }

  const channelChecks: Array<{ id: string | null; labelKey: Parameters<typeof t>[1] }> = [
    { id: draft.oracleChannelId, labelKey: 'setup.wizard.line.oracle_channel' },
    { id: draft.horoscopeChannelId, labelKey: 'setup.wizard.line.horoscope_channel' },
    { id: draft.duelsChannelId, labelKey: 'setup.wizard.line.duels_channel' },
    { id: draft.raidChannelId, labelKey: 'setup.wizard.line.raid_channel' },
    { id: draft.hallChannelId, labelKey: 'setup.wizard.line.hall_channel' },
    { id: draft.publicPostChannelId, labelKey: 'setup.wizard.line.public_post_channel' },
    { id: draft.anonInboxChannelId, labelKey: 'setup.wizard.line.anon_inbox_channel' }
  ];

  for (const check of channelChecks) {
    if (!check.id) {
      continue;
    }

    const channel = await fetchGuildChannel(interaction, check.id);
    if (!channel || !isSetupTextChannel(channel)) {
      errors.push(
        t(locale, 'setup.wizard.error.invalid_channel_type', {
          target: t(locale, check.labelKey)
        }),
      );
    }
  }

  if (draft.horoscopeEnabled && !draft.horoscopeChannelId) {
    errors.push(t(locale, 'setup.wizard.error.horoscope_channel_required'));
  }

  if (draft.horoscopeEnabled && draft.horoscopeChannelId) {
    const horoscopeChannel = await fetchGuildChannel(interaction, draft.horoscopeChannelId);
    if (horoscopeChannel && isSetupTextChannel(horoscopeChannel)) {
      const me = horoscopeChannel.guild.members.me ?? await horoscopeChannel.guild.members.fetchMe();
      const permissions = me.permissionsIn(horoscopeChannel.id);
      const missingPermissions: string[] = [];
      if (!permissions.has(PermissionFlagsBits.SendMessages)) {
        missingPermissions.push(t(locale, 'permissions.send_messages'));
      }
      if (!permissions.has(PermissionFlagsBits.EmbedLinks)) {
        missingPermissions.push(t(locale, 'permissions.embed_links'));
      }
      if (missingPermissions.length > 0) {
        errors.push(
          t(locale, 'setup.wizard.error.horoscope_permissions_missing', {
            missing: missingPermissions.join(', ')
          }),
        );
      }
    }
  }

  if (draft.anonModRoleId) {
    const guild = interaction.guild ?? await interaction.client.guilds.fetch(interaction.guildId!);
    const role = await guild.roles.fetch(draft.anonModRoleId);
    if (!role) {
      errors.push(t(locale, 'setup.wizard.error.mod_role_not_found'));
    }
  }

  return errors;
}

async function queueOracleTestPost(input: {
  boss: PgBoss;
  interaction: SetupWizardInteraction;
  locale: AppLocale;
  correlationId: string;
  draft: SetupWizardDraft;
}): Promise<{ ok: true; content: string } | { ok: false; content: string }> {
  const channelId = input.draft.oracleChannelId;
  if (!channelId) {
    return {
      ok: false,
      content: t(input.locale, 'setup.wizard.error.test_post_channel_missing')
    };
  }

  const missingPermissions = await getMissingPostPermissions(input.interaction, channelId, input.locale);
  if (!missingPermissions) {
    return {
      ok: false,
      content: t(input.locale, 'setup.wizard.error.test_post_invalid_channel')
    };
  }

  if (missingPermissions.length > 0) {
    return {
      ok: false,
      content: t(input.locale, 'setup.wizard.error.test_post_permissions_missing', {
        channelId,
        missing: missingPermissions.join(', ')
      })
    };
  }

  const minuteKey = new Date().toISOString().slice(0, 16);
  const jobId = await input.boss.send(
    JobNames.OraclePublish,
    {
      correlationId: input.correlationId,
      interactionId: input.interaction.id,
      guildId: input.interaction.guildId!,
      userId: input.interaction.user.id,
      weekStartDate: startOfWeekIso(new Date()),
      feature: 'oracle',
      action: 'setup_test_post'
    },
    {
      singletonKey: `oracle:test:${input.interaction.guildId}:${minuteKey}`,
      singletonSeconds: 60,
      retryLimit: 3
    },
  );

  if (jobId) {
    const status = await waitForSetupTestStatus(input.correlationId, 2500, 125);
    if (status?.feature === 'oracle' && status.state === 'failed') {
      return {
        ok: false,
        content: t(input.locale, 'setup.wizard.followup.oracle_test_failed', {
          reason: status.message
        })
      };
    }
  }

  return {
    ok: true,
    content: jobId
      ? t(input.locale, 'setup.wizard.followup.oracle_test_queued', { channelId })
      : t(input.locale, 'setup.wizard.followup.oracle_test_already', { channelId })
  };
}

async function queueHoroscopeTestPost(input: {
  boss: PgBoss;
  interaction: SetupWizardInteraction;
  locale: AppLocale;
  correlationId: string;
  draft: SetupWizardDraft;
}): Promise<{ ok: true; content: string } | { ok: false; content: string }> {
  const channelId = input.draft.horoscopeChannelId;
  if (!channelId) {
    return {
      ok: false,
      content: t(input.locale, 'setup.wizard.error.test_post_channel_missing')
    };
  }

  const missingPermissions = await getMissingPostPermissions(input.interaction, channelId, input.locale);
  if (!missingPermissions) {
    return {
      ok: false,
      content: t(input.locale, 'setup.wizard.error.test_post_invalid_channel')
    };
  }

  if (missingPermissions.length > 0) {
    return {
      ok: false,
      content: t(input.locale, 'setup.wizard.error.test_post_permissions_missing', {
        channelId,
        missing: missingPermissions.join(', ')
      })
    };
  }

  const now = new Date();
  const dedupeKey = buildHoroscopeDedupeKey({
    guildId: input.interaction.guildId!,
    runAt: now,
    isTest: true
  });
  const jobId = await input.boss.send(
    JobNames.AstroPublish,
    {
      correlationId: input.correlationId,
      interactionId: input.interaction.id,
      guildId: input.interaction.guildId!,
      userId: input.interaction.user.id,
      runAtIso: now.toISOString(),
      dedupeKey,
      isTest: true,
      feature: 'astro',
      action: 'setup_test_post'
    },
    {
      singletonKey: dedupeKey,
      singletonSeconds: 300,
      retryLimit: 3
    },
  );

  return {
    ok: true,
    content: jobId
      ? t(input.locale, 'setup.wizard.followup.horoscope_test_queued', { channelId })
      : t(input.locale, 'setup.wizard.followup.horoscope_test_already', { channelId })
  };
}

export async function handleSetupWizardComponent(
  ctx: { boss: PgBoss },
  interaction: SetupWizardInteraction,
  decoded: CustomIdEnvelope,
): Promise<boolean> {
  if (decoded.feature !== 'setup_wizard') {
    return false;
  }

  const action = actionSchema.parse(decoded.action);
  const locale = localeForSetupWizard();

  if (!interaction.guildId) {
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: t(locale, 'error.guild_only_action') });
    return true;
  }

  if (!isAdmin(interaction)) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: t(locale, 'error.admin_required')
    });
    return true;
  }

  const ownerId = parseWizardOwner(decoded);
  if (ownerId && ownerId !== interaction.user.id) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: t(locale, 'setup.wizard.error.not_owner')
    });
    return true;
  }

  await interaction.deferUpdate();

  const correlationId = createCorrelationId();

  if (action.startsWith('pick_')) {
    await ensureDraft(interaction);

    if (action === 'pick_mod_role') {
      if (!interaction.isRoleSelectMenu()) {
        await interaction.followUp({
          flags: MessageFlags.Ephemeral,
          content: t(locale, 'setup.wizard.error.role_selector')
        });
        return true;
      }

      const roleId = interaction.values[0] ?? null;
      const draft = patchSetupWizardDraft(interaction.guildId, interaction.user.id, {
        anonModRoleId: roleId
      });

      await updatePanel(interaction, draft, locale);
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: t(locale, 'setup.wizard.followup.draft_updated') });
      return true;
    }

    if (action === 'pick_timezone') {
      if (!interaction.isStringSelectMenu()) {
        await interaction.followUp({
          flags: MessageFlags.Ephemeral,
          content: t(locale, 'setup.wizard.error.timezone_selector')
        });
        return true;
      }

      const timezone = interaction.values[0] ?? 'Asia/Almaty';
      if (!isSupportedSetupWizardTimezone(timezone) || !isValidIanaTimezone(timezone)) {
        await interaction.followUp({
          flags: MessageFlags.Ephemeral,
          content: t(locale, 'setup.wizard.error.invalid_timezone')
        });
        return true;
      }

      const draft = patchSetupWizardDraft(interaction.guildId, interaction.user.id, {
        timezone
      });

      await updatePanel(interaction, draft, locale);
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: t(locale, 'setup.wizard.followup.draft_updated') });
      return true;
    }

    if (action === 'pick_horoscope_enabled') {
      if (!interaction.isStringSelectMenu()) {
        await interaction.followUp({
          flags: MessageFlags.Ephemeral,
          content: t(locale, 'setup.wizard.error.timezone_selector')
        });
        return true;
      }

      const selected = interaction.values[0] ?? 'enabled';
      const draft = patchSetupWizardDraft(interaction.guildId, interaction.user.id, {
        horoscopeEnabled: selected !== 'disabled'
      });

      await updatePanel(interaction, draft, locale);
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: t(locale, 'setup.wizard.followup.draft_updated') });
      return true;
    }

    if (action === 'pick_horoscope_frequency') {
      if (!interaction.isStringSelectMenu()) {
        await interaction.followUp({
          flags: MessageFlags.Ephemeral,
          content: t(locale, 'setup.wizard.error.timezone_selector')
        });
        return true;
      }

      const selected = interaction.values[0] ?? '4';
      const everyDays = selected === '1' ? 1 : selected === '7' ? 7 : 4;
      const draft = patchSetupWizardDraft(interaction.guildId, interaction.user.id, {
        horoscopeEveryDays: everyDays
      });

      await updatePanel(interaction, draft, locale);
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: t(locale, 'setup.wizard.followup.draft_updated') });
      return true;
    }

    if (!interaction.isChannelSelectMenu()) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: t(locale, 'setup.wizard.error.channel_selector') });
      return true;
    }

    const channelId = interaction.values[0] ?? null;
    if (channelId) {
      const selected = await fetchGuildChannel(interaction, channelId);
      if (action === 'pick_pair_category') {
        if (!selected || selected.type !== ChannelType.GuildCategory) {
          await interaction.followUp({
            flags: MessageFlags.Ephemeral,
            content: t(locale, 'setup.wizard.error.pair_category_not_category')
          });
          return true;
        }
      } else if (!selected || !isSetupTextChannel(selected)) {
        await interaction.followUp({
          flags: MessageFlags.Ephemeral,
          content: t(locale, 'setup.wizard.error.channel_not_text')
        });
        return true;
      }
    }

    const patch = action === 'pick_pair_category'
      ? { pairCategoryId: channelId }
      : action === 'pick_oracle_channel'
        ? { oracleChannelId: channelId }
      : action === 'pick_horoscope_channel'
        ? { horoscopeChannelId: channelId }
      : action === 'pick_duels_channel'
          ? { duelsChannelId: channelId }
      : action === 'pick_raid_channel'
          ? { raidChannelId: channelId }
      : action === 'pick_hall_channel'
          ? { hallChannelId: channelId }
      : action === 'pick_public_post_channel'
          ? { publicPostChannelId: channelId }
          : { anonInboxChannelId: channelId };

    const next = patchSetupWizardDraft(interaction.guildId, interaction.user.id, patch);

    await updatePanel(interaction, next, locale);
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: t(locale, 'setup.wizard.followup.draft_updated') });
    return true;
  }

  if (!interaction.isButton()) {
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: t(locale, 'setup.wizard.error.unsupported_action') });
    return true;
  }

  const draft = await ensureDraft(interaction);

  if (action === 'complete') {
    const missingKeys = getSetupMissingRequirementKeys(draft);
    if (missingKeys.length > 0) {
      await updatePanel(interaction, draft, locale, 'draft');
      await interaction.followUp({
        flags: MessageFlags.Ephemeral,
        content: t(locale, 'setup.wizard.error.required_missing', {
          missing: missingKeys.map((key) => formatRequirementLabel(locale, key)).join(', ')
        }),
      });
      return true;
    }

    const commitErrors = await validateDraftBeforeCommit(interaction, draft, locale);
    if (commitErrors.length > 0) {
      await updatePanel(interaction, draft, locale, 'draft');
      await interaction.followUp({
        flags: MessageFlags.Ephemeral,
        content: `${t(locale, 'setup.wizard.error.commit_validation_failed')}\n- ${commitErrors.join('\n- ')}`
      });
      return true;
    }

    await updateGuildConfig(interaction.guildId, {
      pairCategoryId: draft.pairCategoryId,
      oracleChannelId: draft.oracleChannelId,
      horoscopeEnabled: draft.horoscopeEnabled,
      horoscopeChannelId: draft.horoscopeChannelId,
      horoscopeEveryDays: draft.horoscopeEveryDays,
      horoscopeNextRunAt: draft.horoscopeEnabled && draft.horoscopeChannelId
        ? computeNextRun({
            now: new Date(),
            timezone: draft.timezone,
            everyDays: draft.horoscopeEveryDays
          })
        : null,
      duelsEnabled: draft.duelsEnabled,
      duelsChannelId: draft.duelsChannelId,
      raidChannelId: draft.raidChannelId,
      hallChannelId: draft.hallChannelId,
      publicPostChannelId: draft.publicPostChannelId,
      anonInboxChannelId: draft.anonInboxChannelId,
      anonModRoleId: draft.anonModRoleId,
      timezone: draft.timezone
    });

    await autoEnableConfiguredFeatures(interaction.guildId);
    await autoEnableSafeSchedules(ctx.boss, interaction.guildId);

    logInteraction({
      interaction,
      feature: 'setup',
      action: 'wizard_complete',
      correlationId
    });

    const config = await getGuildConfig(interaction.guildId);
    const committedDraft = ensureSetupWizardDraft(interaction.guildId, interaction.user.id, config);
    await updatePanel(interaction, committedDraft, locale, 'completed');
    clearSetupWizardDraft(interaction.guildId, interaction.user.id);

    await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      content: t(locale, 'setup.wizard.followup.complete_short')
    });
    return true;
  }

  if (action === 'reset') {
    const config = await getGuildConfig(interaction.guildId);
    const resetDraft = resetSetupWizardDraft(interaction.guildId, interaction.user.id, config);

    logInteraction({
      interaction,
      feature: 'setup',
      action: 'wizard_reset',
      correlationId
    });

    await updatePanel(interaction, resetDraft, locale);
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: t(locale, 'setup.wizard.followup.reset') });
    return true;
  }

  const testOracle = action === 'test_post_oracle' || action === 'test_post_both';
  const testHoroscope = action === 'test_post' || action === 'test_post_horoscope' || action === 'test_post_both';
  const followupLines: string[] = [];

  if (testOracle) {
    const result = await queueOracleTestPost({
      boss: ctx.boss,
      interaction,
      locale,
      correlationId,
      draft
    });
    followupLines.push(result.content);
  }

  if (testHoroscope) {
    const result = await queueHoroscopeTestPost({
      boss: ctx.boss,
      interaction,
      locale,
      correlationId,
      draft
    });
    followupLines.push(result.content);
  }

  logInteraction({
    interaction,
    feature: 'setup',
    action: action === 'test_post_both' ? 'wizard_test_post_both' : action,
    correlationId
  });

  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    content: followupLines.join('\n')
  });

  await updatePanel(interaction, draft, locale);
  return true;
}

