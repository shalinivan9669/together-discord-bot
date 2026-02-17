import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createInteractionTranslator } from '../locale';
import type { CommandModule } from './types';

export const pingCommand: CommandModule = {
  name: 'ping',
  data: new SlashCommandBuilder()
    .setName('ping')
    .setNameLocalizations({ ru: 'ping', 'en-US': 'ping' })
    .setDescription('Команда проверки работоспособности')
    .setDescriptionLocalizations({ 'en-US': 'Health check command' }),
  async execute(_ctx, interaction) {
    const tr = await createInteractionTranslator(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(tr.t('ping.reply'));
  }
};
