import { SlashCommandBuilder, type MessageCreateOptions } from 'discord.js';
import { startMediatorRepairFlow, getPairRoomForMediatorUser } from '../../app/services/mediatorService';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

function canSend(channel: unknown): channel is {
  send: (options: string | MessageCreateOptions) => Promise<{ id: string }>;
} {
  if (!channel || typeof channel !== 'object') {
    return false;
  }

  return 'send' in channel && typeof channel.send === 'function';
}

export const repairCommand: CommandModule = {
  name: 'repair',
  data: new SlashCommandBuilder()
    .setName('repair')
    .setDescription('Mediator: start a 7-minute guided repair flow in your pair room'),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ ephemeral: true });

    const pair = await getPairRoomForMediatorUser({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });

    if (!pair) {
      await interaction.editReply('Run `/repair` inside your pair private room.');
      return;
    }

    const room = interaction.channel;
    if (!room?.isTextBased() || !canSend(room)) {
      await interaction.editReply('Current pair room channel is not sendable.');
      return;
    }

    const correlationId = createCorrelationId();
    const result = await startMediatorRepairFlow({
      guildId: interaction.guildId,
      pairId: pair.id,
      pairRoomChannelId: pair.privateChannelId,
      startedByUserId: interaction.user.id,
      interactionId: interaction.id,
      correlationId,
      boss: ctx.boss,
      createFlowMessage: async (content) => {
        const sent = await room.send({ content });
        return sent.id;
      }
    });

    logInteraction({
      interaction,
      feature: 'mediator',
      action: result.created ? 'repair_start' : 'repair_start_existing',
      correlationId,
      pairId: pair.id
    });

    await interaction.editReply(
      result.created
        ? 'Repair flow started. I will edit one message every 2 minutes for the next steps.'
        : 'A repair flow is already active in this pair room. I will keep editing that same message.',
    );
  }
};
