import { SlashCommandBuilder } from 'discord.js';
import { isFeatureEnabled } from '../../config/featureFlags';
import type { CommandModule } from './types';

export const checkinCommand: CommandModule = {
  name: 'checkin',
  data: new SlashCommandBuilder()
    .setName('checkin')
    .setDescription('Weekly pair check-in (phase 2)')
    .addSubcommand((sub) => sub.setName('start').setDescription('Start weekly check-in')),
  async execute(_ctx, interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isFeatureEnabled('checkin')) {
      await interaction.editReply('Check-in is not enabled in this deployment.');
      return;
    }

    await interaction.editReply('Check-in feature wiring is present. Complete handlers are TODO.');
  }
};