import { MessageFlags, SlashCommandBuilder, type MessageCreateOptions } from 'discord.js';
import { startMediatorRepairFlow, getPairRoomForMediatorUser } from '../../app/services/mediatorService';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { createInteractionTranslator } from '../locale';
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
    .setNameLocalizations({ ru: 'repair', 'en-US': 'repair' })
    .setDescription('Медиатор: запустить 7-минутный сценарий восстановления в комнате пары')
    .setDescriptionLocalizations({ 'en-US': 'Mediator: start a 7-minute guided repair flow in your pair room' }),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const pair = await getPairRoomForMediatorUser({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });

    if (!pair) {
      await interaction.editReply(tr.t('repair.reply.run_in_pair_room'));
      return;
    }

    const room = interaction.channel;
    if (!room?.isTextBased() || !canSend(room)) {
      await interaction.editReply(tr.t('repair.reply.channel_not_sendable'));
      return;
    }

    const correlationId = createCorrelationId();
    const result = await startMediatorRepairFlow({
      guildId: interaction.guildId,
      pairId: pair.id,
      pairRoomChannelId: pair.privateChannelId,
      startedByUserId: interaction.user.id,
      locale: tr.locale,
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
        ? tr.t('repair.reply.started')
        : tr.t('repair.reply.already_active'),
    );
  }
};
