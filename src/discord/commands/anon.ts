import { ModalBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { isFeatureEnabled } from '../../config/featureFlags';
import { encodeCustomId } from '../interactions/customId';
import type { CommandModule } from './types';

export const anonCommand: CommandModule = {
  name: 'anon',
  data: new SlashCommandBuilder()
    .setName('anon')
    .setDescription('Anonymous questions (phase 2)')
    .addSubcommand((sub) => sub.setName('ask').setDescription('Submit anonymous question'))
    .addSubcommand((sub) => sub.setName('queue').setDescription('View moderation queue')),
  async execute(_ctx, interaction) {
    const sub = interaction.options.getSubcommand();

    if (!isFeatureEnabled('anon')) {
      await interaction.reply({ ephemeral: true, content: 'Anonymous questions are not enabled.' });
      return;
    }

    if (sub === 'ask') {
      const modal = new ModalBuilder()
        .setTitle('Anonymous question')
        .setCustomId(
          encodeCustomId({
            feature: 'anon',
            action: 'ask_modal',
            payload: { guildId: interaction.guildId ?? 'dm' }
          }),
        )
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('question')
              .setLabel('Your question')
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(400)
              .setRequired(true),
          ),
        );

      await interaction.showModal(modal as never);
      return;
    }

    await interaction.reply({
      ephemeral: true,
      content: 'Anon queue handler is wired but disabled in this MVP build.'
    });
  }
};