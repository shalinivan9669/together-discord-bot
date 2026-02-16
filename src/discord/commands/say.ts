import { SlashCommandBuilder } from 'discord.js';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { buildMediatorSayModal } from '../interactions/components';
import { assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

export const sayCommand: CommandModule = {
  name: 'say',
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Mediator: rewrite a message in soft/direct/short tones'),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);

    const correlationId = createCorrelationId();
    const modal = buildMediatorSayModal(interaction.guildId);

    logInteraction({
      interaction,
      feature: 'mediator',
      action: 'say_open_modal',
      correlationId
    });

    await interaction.showModal(modal as never);
  }
};
