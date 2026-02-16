import { SlashCommandBuilder } from 'discord.js';
import { isFeatureEnabled } from '../../config/featureFlags';
import type { CommandModule } from './types';

export const raidCommand: CommandModule = {
  name: 'raid',
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Server cooperative raid (phase 2)')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start raid')
        .addChannelOption((opt) => opt.setName('channel').setDescription('Public progress channel').setRequired(false))
        .addIntegerOption((opt) => opt.setName('goal').setDescription('Goal points').setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName('quests').setDescription('Show today quests'))
    .addSubcommand((sub) => sub.setName('progress').setDescription('Show raid progress')),
  async execute(_ctx, interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isFeatureEnabled('raid')) {
      await interaction.editReply('Raid is not enabled in this deployment.');
      return;
    }

    await interaction.editReply('Raid feature wiring is present. Complete handlers are TODO.');
  }
};