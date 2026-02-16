import { SlashCommandBuilder } from 'discord.js';
import {
  ensureCheckinEnabled,
  getPairForCheckinChannel,
  listActiveAgreements,
} from '../../app/services/checkinService';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { buildCheckinAgreementSelect } from '../interactions/components';
import { assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

export const checkinCommand: CommandModule = {
  name: 'checkin',
  data: new SlashCommandBuilder()
    .setName('checkin')
    .setDescription('Weekly pair check-in')
    .addSubcommand((sub) => sub.setName('start').setDescription('Start weekly check-in in your pair room')),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ ephemeral: true });

    try {
      ensureCheckinEnabled();
    } catch (error) {
      await interaction.editReply(error instanceof Error ? error.message : 'Check-in is disabled.');
      return;
    }

    const correlationId = createCorrelationId();
    const sub = interaction.options.getSubcommand();
    if (sub !== 'start') {
      await interaction.editReply('Unknown check-in subcommand.');
      return;
    }

    const pair = await getPairForCheckinChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });

    if (!pair) {
      await interaction.editReply('Run `/checkin start` inside your pair private room.');
      return;
    }

    const agreements = await listActiveAgreements(25);
    if (agreements.length === 0) {
      await interaction.editReply('No active agreements found. Run seed script first.');
      return;
    }

    logInteraction({
      interaction,
      feature: 'checkin',
      action: 'start',
      correlationId,
      pairId: pair.id
    });

    await interaction.editReply({
      content: 'Select one weekly agreement, then you will fill the 5-score check-in modal.',
      components: [
        buildCheckinAgreementSelect(agreements.map((agreement) => ({ key: agreement.key, text: agreement.text }))) as never
      ]
    });
  }
};
