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
import { requestPublicPostPublish } from '../../app/projections/publicPostProjection';
import {
  evaluateFeatureState,
  getGuildConfig,
  guildFeatureNames,
  setGuildFeatures,
  updateGuildConfig,
} from '../../app/services/guildConfigService';
import { getSetupMissingRequirementKeys } from '../../app/services/configRequirements';
import { createScheduledPost } from '../../app/services/publicPostService';
import { type JobName, JobNames } from '../../infra/queue/jobs';
import { setRecurringScheduleEnabled } from '../../infra/queue/scheduler';
import { t, type AppLocale } from '../../i18n';
import { createCorrelationId } from '../../lib/correlation';
import { formatRequirementLabel } from '../featureErrors';
import { logInteraction } from '../interactionLog';
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
  renderSetupWizardPanel,
  type SetupWizardPanelMode,
} from '../setupWizard/view';

export type SetupWizardInteraction =
  | ButtonInteraction
  | ChannelSelectMenuInteraction
  | RoleSelectMenuInteraction
  | StringSelectMenuInteraction;

const actionSchema = z.enum([
  'pick_pair_category',
  'pick_horoscope_channel',
  'pick_raid_channel',
  'pick_hall_channel',
  'pick_public_post_channel',
  'pick_anon_inbox_channel',
  'pick_mod_role',
  'pick_timezone',
  'complete',
  'reset',
  'test_post'
]);

const scheduleFeatureMap: ReadonlyArray<{ name: JobName; feature: (typeof guildFeatureNames)[number] }> = [
  { name: JobNames.WeeklyHoroscopePublish, feature: 'horoscope' },
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
  const panel = renderSetupWizardPanel(draft, locale, { mode });

  if ('message' in interaction && interaction.message) {
    await interaction.message.edit({
      content: panel.content ?? null,
      components: panel.components as never
    });
    return;
  }

  await interaction.editReply({
    content: panel.content ?? null,
    components: panel.components as never
  });
}

function selectTargetChannel(draft: SetupWizardDraft): string | null {
  return draft.publicPostChannelId
    ?? draft.raidChannelId
    ?? draft.hallChannelId
    ?? draft.horoscopeChannelId
    ?? draft.anonInboxChannelId
    ?? null;
}

function testPostContent(locale: AppLocale, guildId: string): string {
  return [
    t(locale, 'setup.wizard.test_post.title'),
    t(locale, 'setup.wizard.test_post.guild', { guildId }),
    t(locale, 'setup.wizard.test_post.body')
  ].join('\n');
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
    { id: draft.horoscopeChannelId, labelKey: 'setup.wizard.line.horoscope_channel' },
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

  if (draft.anonModRoleId) {
    const guild = interaction.guild ?? await interaction.client.guilds.fetch(interaction.guildId!);
    const role = await guild.roles.fetch(draft.anonModRoleId);
    if (!role) {
      errors.push(t(locale, 'setup.wizard.error.mod_role_not_found'));
    }
  }

  return errors;
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
      : action === 'pick_horoscope_channel'
        ? { horoscopeChannelId: channelId }
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
      horoscopeChannelId: draft.horoscopeChannelId,
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

  const channelId = selectTargetChannel(draft);
  if (!channelId) {
    await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      content: `${t(locale, 'setup.wizard.followup.preview')}:\n\n${testPostContent(locale, interaction.guildId)}`
    });
    return true;
  }

  const now = new Date();
  const dedupeWindow = Math.floor(now.getTime() / 60_000);
  const scheduled = await createScheduledPost({
    guildId: interaction.guildId,
    type: 'text',
    targetChannelId: channelId,
    payloadJson: {
      content: testPostContent(locale, interaction.guildId)
    },
    scheduledFor: now,
    idempotencyKey: `setup:test:${interaction.guildId}:${interaction.user.id}:${dedupeWindow}`
  });

  await requestPublicPostPublish(ctx.boss, {
    guildId: interaction.guildId,
    scheduledPostId: scheduled.id,
    reason: 'setup_test_post',
    interactionId: interaction.id,
    userId: interaction.user.id,
    correlationId
  });

  logInteraction({
    interaction,
    feature: 'setup',
    action: 'wizard_test_post',
    correlationId,
    jobId: null
  });

  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    content: scheduled.created
      ? t(locale, 'setup.wizard.followup.test_post_queued', { channelId })
      : t(locale, 'setup.wizard.followup.test_post_already', { channelId }),
  });

  await updatePanel(interaction, draft, locale);
  return true;
}
