import {
  ActionRowBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { ensureAnonEnabled, listPendingAnonQuestions } from '../../app/services/anonService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { buildAnonModerationButtons } from '../interactions/components';
import { encodeCustomId } from '../interactions/customId';
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
      ensureAnonEnabled();
    } catch (error) {
      await interaction.reply({
        ephemeral: true,
        content: error instanceof Error ? error.message : 'Anonymous questions are disabled.'
      });
      return;
    }

    if (sub === 'ask') {
      const modal = new ModalBuilder()
        .setTitle('Anonymous question')
        .setCustomId(
          encodeCustomId({
            feature: 'anon',
            action: 'ask_modal',
            payload: { g: interaction.guildId }
          }),
        )
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('question')
              .setLabel('Your anonymous question')
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(400)
              .setRequired(true),
          ),
        );

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
    await interaction.deferReply({ ephemeral: true });

    const pending = await listPendingAnonQuestions(interaction.guildId, 5);
    if (pending.length === 0) {
      await interaction.editReply('No pending anonymous questions.');
      return;
    }

    const lines = pending.map((row, idx) => `${idx + 1}. \`${row.id}\`\n${row.questionText}`);
    const components = pending.map((row) => buildAnonModerationButtons(row.id));

    logInteraction({
      interaction,
      feature: 'anon',
      action: 'queue_view',
      correlationId
    });

    await interaction.editReply({
      content: `Pending questions (${pending.length}):\n\n${lines.join('\n\n')}`,
      components: components as never
    });
  }
};
