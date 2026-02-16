import { SlashCommandBuilder } from 'discord.js';
import { isFeatureEnabled } from '../../config/featureFlags';
import type { CommandModule } from './types';

export const horoscopeCommand: CommandModule = {
  name: 'horoscope',
  data: new SlashCommandBuilder()
    .setName('horoscope')
    .setDescription('Horoscope flow (phase 2)')
    .addSubcommand((sub) => sub.setName('status').setDescription('Show horoscope feature status')),
  async execute(_ctx, interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isFeatureEnabled('horoscope')) {
      await interaction.editReply('Horoscope is not enabled in this deployment.');
      return;
    }

    await interaction.editReply('Horoscope feature wiring is present. Complete handlers are TODO.');
  }
};