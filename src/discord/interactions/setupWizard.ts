import { PermissionFlagsBits, type ButtonInteraction, type ChannelSelectMenuInteraction, type RoleSelectMenuInteraction } from 'discord.js';
import type PgBoss from 'pg-boss';
import { z } from 'zod';
import { requestPublicPostPublish } from '../../app/projections/publicPostProjection';
import { createScheduledPost } from '../../app/services/publicPostService';
import { setGuildSettings } from '../../app/services/setupService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import type { CustomIdEnvelope } from './customId';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';
import {
  ensureSetupWizardDraft,
  getSetupWizardDraft,
  patchSetupWizardDraft,
  resetSetupWizardDraft,
  type SetupWizardDraft,
} from '../setupWizard/state';
import { renderSetupWizardPanel } from '../setupWizard/view';

export type SetupWizardInteraction = ButtonInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction;

const actionSchema = z.enum([
  'pick_duel_channel',
  'pick_horoscope_channel',
  'pick_questions_channel',
  'pick_raid_channel',
  'pick_mod_role',
  'save',
  'reset',
  'test_post'
]);

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

  const settings = await getGuildSettings(interaction.guildId);
  return ensureSetupWizardDraft(interaction.guildId, interaction.user.id, settings);
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
  return draft.duelPublicChannelId
    ?? draft.raidChannelId
    ?? draft.horoscopeChannelId
    ?? draft.questionsChannelId
    ?? null;
}

function testPostContent(guildId: string): string {
  return [
    '## Setup Wizard Test Post',
    `Guild: \`${guildId}\``,
    'This message confirms that scheduled posting and publish queue are wired correctly.'
  ].join('\n');
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
    await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
    return true;
  }

  if (!isAdmin(interaction)) {
    await interaction.reply({ ephemeral: true, content: 'Administrator permission is required for setup wizard.' });
    return true;
  }

  await interaction.deferUpdate();

  const correlationId = createCorrelationId();

  if (action.startsWith('pick_')) {
    await ensureDraft(interaction);

    if (action === 'pick_mod_role') {
      if (!interaction.isRoleSelectMenu()) {
        await interaction.followUp({ ephemeral: true, content: 'Use the role selector for this action.' });
        return true;
      }

      const roleId = interaction.values[0] ?? null;
      const draft = patchSetupWizardDraft(interaction.guildId, interaction.user.id, {
        moderatorRoleId: roleId
      });

      await updatePanel(interaction, draft);
      await interaction.followUp({ ephemeral: true, content: 'Draft updated.' });
      return true;
    }

    if (!interaction.isChannelSelectMenu()) {
      await interaction.followUp({ ephemeral: true, content: 'Use a channel selector for this action.' });
      return true;
    }

    const channelId = interaction.values[0] ?? null;

    const patch = action === 'pick_duel_channel'
      ? { duelPublicChannelId: channelId }
      : action === 'pick_horoscope_channel'
        ? { horoscopeChannelId: channelId }
        : action === 'pick_questions_channel'
          ? { questionsChannelId: channelId }
          : { raidChannelId: channelId };

    const next = patchSetupWizardDraft(interaction.guildId, interaction.user.id, patch);

    await updatePanel(interaction, next);
    await interaction.followUp({ ephemeral: true, content: 'Draft updated.' });
    return true;
  }

  if (!interaction.isButton()) {
    await interaction.followUp({ ephemeral: true, content: 'Unsupported setup wizard action.' });
    return true;
  }

  const draft = await ensureDraft(interaction);

  if (action === 'save') {
    await setGuildSettings(interaction.guildId, {
      duelPublicChannelId: draft.duelPublicChannelId,
      horoscopeChannelId: draft.horoscopeChannelId,
      questionsChannelId: draft.questionsChannelId,
      raidChannelId: draft.raidChannelId,
      moderatorRoleId: draft.moderatorRoleId
    });

    logInteraction({
      interaction,
      feature: 'setup',
      action: 'wizard_save',
      correlationId
    });

    await updatePanel(interaction, draft);
    await interaction.followUp({ ephemeral: true, content: 'Guild settings saved.' });
    return true;
  }

  if (action === 'reset') {
    const settings = await getGuildSettings(interaction.guildId);
    const resetDraft = resetSetupWizardDraft(interaction.guildId, interaction.user.id, settings);

    logInteraction({
      interaction,
      feature: 'setup',
      action: 'wizard_reset',
      correlationId
    });

    await updatePanel(interaction, resetDraft);
    await interaction.followUp({ ephemeral: true, content: 'Draft reset to stored settings.' });
    return true;
  }

  const channelId = selectTargetChannel(draft);
  if (!channelId) {
    await interaction.followUp({
      ephemeral: true,
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
    ephemeral: true,
    content: scheduled.created
      ? `Test post queued for <#${channelId}>.`
      : `Test post already queued for <#${channelId}> in this minute.`,
  });

  await updatePanel(interaction, draft);
  return true;
}
