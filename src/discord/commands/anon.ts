import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { ensureAnonEnabled } from '../../app/services/anonService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { buildAnonAskModal } from '../interactions/components';
import { buildAnonQueueView } from '../interactions/anonQueueView';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

export const anonCommand: CommandModule = {
  name: 'anon',
  data: new SlashCommandBuilder()
    .setName('anon')
    .setDescription('Anonymous questions')
    .addSubcommand((sub) => sub.setName('ask').setDescription('Submit anonymous question'))
    .addSubcommand((sub) => sub.setName('queue').setDescription('Moderation queue (admin/mod)')),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);
    const sub = interaction.options.getSubcommand();
    const correlationId = createCorrelationId();

    try {
      await ensureAnonEnabled(interaction.guildId);
    } catch (error) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: error instanceof Error ? error.message : 'Anonymous questions are disabled.'
      });
      return;
    }

    if (sub === 'ask') {
      const modal = buildAnonAskModal(interaction.guildId);

      logInteraction({
        interaction,
        feature: 'anon',
        action: 'ask_open_modal',
        correlationId
      });

      await interaction.showModal(modal as never);
      return;
    }

    const settings = await getGuildSettings(interaction.guildId);
    assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const queue = await buildAnonQueueView(interaction.guildId, 0, 3);

    logInteraction({
      interaction,
      feature: 'anon',
      action: 'queue_view',
      correlationId
    });

    await interaction.editReply({
      content: queue.content,
      components: queue.components as never
    });
  }
};
