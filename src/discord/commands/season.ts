import { SlashCommandBuilder } from 'discord.js';
import { isFeatureEnabled } from '../../config/featureFlags';
import type { CommandModule } from './types';

export const seasonCommand: CommandModule = {
  name: 'season',
  data: new SlashCommandBuilder()
    .setName('season')
    .setDescription('Season and capsule info (phase 2)')
    .addSubcommand((sub) => sub.setName('status').setDescription('Show current season status')),
  async execute(_ctx, interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isFeatureEnabled('seasons')) {
      await interaction.editReply('Seasons are not enabled in this deployment.');
      return;
    }

    await interaction.editReply('Season feature wiring is present. Complete handlers are TODO.');
  }
};