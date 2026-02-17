import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isFeatureEnabled } from '../../config/featureFlags';
import { createInteractionTranslator } from '../locale';
import type { CommandModule } from './types';

export const seasonCommand: CommandModule = {
  name: 'season',
  data: new SlashCommandBuilder()
    .setName('season')
    .setNameLocalizations({ ru: 'season', 'en-US': 'season' })
    .setDescription('Информация о сезоне и капсулах')
    .setDescriptionLocalizations({ 'en-US': 'Season and capsule info' })
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setNameLocalizations({ ru: 'status', 'en-US': 'status' })
        .setDescription('Показать статус текущего сезона')
        .setDescriptionLocalizations({ 'en-US': 'Show current season status' }),
    ),
  async execute(_ctx, interaction) {
    const tr = await createInteractionTranslator(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!isFeatureEnabled('seasons')) {
      await interaction.editReply(tr.t('season.reply.disabled'));
      return;
    }

    await interaction.editReply(tr.t('season.reply.enabled_not_configured'));
  }
};
