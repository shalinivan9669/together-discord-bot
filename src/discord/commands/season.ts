import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isFeatureEnabled } from '../../config/featureFlags';
import type { CommandModule } from './types';

export const seasonCommand: CommandModule = {
  name: 'season',
  data: new SlashCommandBuilder()
    .setName('season')
    .setDescription('Season and capsule info')
    .addSubcommand((sub) => sub.setName('status').setDescription('Show current season status')),
  async execute(_ctx, interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!isFeatureEnabled('seasons')) {
      await interaction.editReply('Seasons are not enabled in this deployment.');
      return;
    }

    await interaction.editReply('Seasons are enabled, but advanced capsule logic is not yet configured.');
  }
};
