import {
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
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
import { createScheduledPost } from '../../app/services/publicPostService';
import { type JobName, JobNames } from '../../infra/queue/jobs';
import { setRecurringScheduleEnabled } from '../../infra/queue/scheduler';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { buildAdminStatusReport } from '../admin/statusReport';
import type { CustomIdEnvelope } from './customId';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';
import {
  clearSetupWizardDraft,
  ensureSetupWizardDraft,
  getSetupWizardDraft,
  patchSetupWizardDraft,
  resetSetupWizardDraft,
  type SetupWizardDraft,
} from '../setupWizard/state';
import { renderSetupWizardPanel } from '../setupWizard/view';

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

async function updatePanel(interaction: SetupWizardInteraction, draft: SetupWizardDraft): Promise<void> {
  const panel = renderSetupWizardPanel(draft);
  await interaction.editReply({
    content: panel.content ?? null,
    components: panel.components as never,
    flags: COMPONENTS_V2_FLAGS
  } as never);
}

function selectTargetChannel(draft: SetupWizardDraft): string | null {
  return draft.publicPostChannelId
    ?? draft.raidChannelId
    ?? draft.hallChannelId
    ?? draft.horoscopeChannelId
    ?? draft.anonInboxChannelId
    ?? null;
}

function testPostContent(guildId: string): string {
  return [
    '## Setup Wizard Test Post',
    `Guild: \`${guildId}\``,
    'This message confirms that scheduled posting and publish queue are wired correctly.'
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

export async function handleSetupWizardComponent(
  ctx: { boss: PgBoss },
  interaction: SetupWizardInteraction,
  decoded: CustomIdEnvelope,
): Promise<boolean> {
  if (decoded.feature !== 'setup_wizard') {
    return false;
  }

  const action = actionSchema.parse(decoded.action);

  if (!interaction.guildId) {
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
    return true;
  }

  if (!isAdmin(interaction)) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Administrator permission is required for setup wizard.'
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
          content: 'Use the role selector for this action.'
        });
        return true;
      }

      const roleId = interaction.values[0] ?? null;
      const draft = patchSetupWizardDraft(interaction.guildId, interaction.user.id, {
        anonModRoleId: roleId
      });

      await updatePanel(interaction, draft);
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Draft updated.' });
      return true;
    }

    if (action === 'pick_timezone') {
      if (!interaction.isStringSelectMenu()) {
        await interaction.followUp({
          flags: MessageFlags.Ephemeral,
          content: 'Use the timezone selector for this action.'
        });
        return true;
      }

      const timezone = interaction.values[0] ?? 'Asia/Almaty';
      const draft = patchSetupWizardDraft(interaction.guildId, interaction.user.id, {
        timezone
      });

      await updatePanel(interaction, draft);
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Draft updated.' });
      return true;
    }

    if (!interaction.isChannelSelectMenu()) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Use a channel selector for this action.' });
      return true;
    }

    const channelId = interaction.values[0] ?? null;

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

    await updatePanel(interaction, next);
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Draft updated.' });
    return true;
  }

  if (!interaction.isButton()) {
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Unsupported setup wizard action.' });
    return true;
  }

  const draft = await ensureDraft(interaction);

  if (action === 'complete') {
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

    clearSetupWizardDraft(interaction.guildId, interaction.user.id);

    const guild = interaction.guild ?? await interaction.client.guilds.fetch(interaction.guildId);
    const report = await buildAdminStatusReport(guild);

    await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      content: `Setup complete.\n\n${report}`
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

    await updatePanel(interaction, resetDraft);
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Draft reset to stored settings.' });
    return true;
  }

  const channelId = selectTargetChannel(draft);
  if (!channelId) {
    await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      content: `Preview:\n\n${testPostContent(interaction.guildId)}`
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
      content: testPostContent(interaction.guildId)
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
      ? `Test post queued for <#${channelId}>.`
      : `Test post already queued for <#${channelId}> in this minute.`,
  });

  await updatePanel(interaction, draft);
  return true;
}
