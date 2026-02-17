import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { CommandModule } from './types';

export const pingCommand: CommandModule = {
  name: 'ping',
  data: new SlashCommandBuilder().setName('ping').setDescription('Health check command'),
  async execute(_ctx, interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply('pong');
  }
};
