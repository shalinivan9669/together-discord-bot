import { MessageFlags, SlashCommandBuilder, type GuildBasedChannel, type MessageCreateOptions } from 'discord.js';
import {
  duelEndUsecase,
  duelRoundStartUsecase,
  duelStartUsecase
} from '../../app/usecases/duelUsecases';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { createInteractionTranslator } from '../locale';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import { buildDuelSubmitButton } from '../interactions/components';
import { sendComponentsV2Message, textBlock, uiCard } from '../ui-v2';
import type { CommandModule } from './types';

function canSend(channel: GuildBasedChannel): channel is GuildBasedChannel & {
  send: (options: string | MessageCreateOptions) => Promise<{ id: string }>;
} {
  return 'send' in channel && typeof channel.send === 'function';
}

export const duelCommand: CommandModule = {
  name: 'duel',
  data: new SlashCommandBuilder()
    .setName('duel')
    .setNameLocalizations({ ru: 'duel', 'en-US': 'duel' })
    .setDescription('Управление дуэлями и табло')
    .setDescriptionLocalizations({ 'en-US': 'Manage duel rounds and scoreboard' })
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setNameLocalizations({ ru: 'start', 'en-US': 'start' })
        .setDescription('Запустить новую дуэль')
        .setDescriptionLocalizations({ 'en-US': 'Start a new duel' })
        .addChannelOption((opt) =>
          opt
            .setName('public_channel')
            .setNameLocalizations({ ru: 'public_channel', 'en-US': 'public_channel' })
            .setDescription('Канал табло')
            .setDescriptionLocalizations({ 'en-US': 'Scoreboard channel' })
            .setRequired(true),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('round')
        .setNameLocalizations({ ru: 'round', 'en-US': 'round' })
        .setDescription('Управление раундами')
        .setDescriptionLocalizations({ 'en-US': 'Round controls' })
        .addSubcommand((sub) =>
          sub
            .setName('start')
            .setNameLocalizations({ ru: 'start', 'en-US': 'start' })
            .setDescription('Запустить раунд и уведомить все пары')
            .setDescriptionLocalizations({ 'en-US': 'Start a round and notify all pairs' })
            .addIntegerOption((opt) =>
              opt
                .setName('duration_minutes')
                .setNameLocalizations({ ru: 'duration_minutes', 'en-US': 'duration_minutes' })
                .setDescription('Длительность раунда в минутах')
                .setDescriptionLocalizations({ 'en-US': 'Round duration in minutes' })
                .setMinValue(5)
                .setMaxValue(720)
                .setRequired(true),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('end')
        .setNameLocalizations({ ru: 'end', 'en-US': 'end' })
        .setDescription('Завершить активную дуэль')
        .setDescriptionLocalizations({ 'en-US': 'End active duel' }),
    ),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const correlationId = createCorrelationId();
    const settings = await getGuildSettings(interaction.guildId);
    assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

    const subcommand = interaction.options.getSubcommand();
    const subcommandGroup = interaction.options.getSubcommandGroup(false);

    if (!subcommandGroup && subcommand === 'start') {
      const publicChannel = interaction.options.getChannel('public_channel', true);
      if (!publicChannel.isTextBased() || !canSend(publicChannel)) {
        await interaction.editReply(tr.t('duel.reply.public_channel_must_be_text'));
        return;
      }

      const result = await duelStartUsecase({
        guildId: interaction.guildId,
        publicChannelId: publicChannel.id,
        createScoreboardMessage: async (content) => {
          const sent = await sendComponentsV2Message(interaction.client, publicChannel.id, {
            components: [
              uiCard({
                title: 'Табло дуэли',
                status: 'инициализация',
                accentColor: 0xc44536,
                components: [textBlock(content)]
              })
            ]
          });
          return sent.id;
        },
        boss: ctx.boss,
        correlationId,
        interactionId: interaction.id,
        userId: interaction.user.id
      });

      logInteraction({
        interaction,
        feature: 'duel',
        action: 'start',
        correlationId,
        jobId: null
      });

      const text = result.created
        ? tr.t('duel.reply.started', { channelId: result.duel.publicChannelId })
        : tr.t('duel.reply.already_active', { channelId: result.duel.publicChannelId });

      await interaction.editReply(text);
      return;
    }

    if (subcommandGroup === 'round' && subcommand === 'start') {
      const durationMinutes = interaction.options.getInteger('duration_minutes', true);

      const result = await duelRoundStartUsecase({
        guildId: interaction.guildId,
        durationMinutes,
        notifyPair: async ({ pairId, privateChannelId, duelId, roundId, roundNo, endsAt }) => {
          const channel = await interaction.client.channels.fetch(privateChannelId);
          if (!channel?.isTextBased() || !('send' in channel) || typeof channel.send !== 'function') {
            return;
          }

          await channel.send({
            content:
              `Раунд #${roundNo} начался. Отправьте ответ до <t:${Math.floor(endsAt.getTime() / 1000)}:t>. ` +
              'Кнопку ниже можно использовать один раз за раунд.',
            components: [buildDuelSubmitButton({ duelId, roundId, pairId }, tr.locale) as never]
          });
        },
        boss: ctx.boss,
        correlationId,
        interactionId: interaction.id,
        userId: interaction.user.id
      });

      logInteraction({
        interaction,
        feature: 'duel',
        action: 'round_start',
        correlationId,
        jobId: null
      });

      await interaction.editReply(
        tr.t('duel.reply.round_started', {
          roundNo: result.round.roundNo,
          pairCount: result.pairCount,
          unix: Math.floor(result.round.endsAt.getTime() / 1000)
        }),
      );
      return;
    }

    if (!subcommandGroup && subcommand === 'end') {
      const duel = await duelEndUsecase({
        guildId: interaction.guildId,
        boss: ctx.boss,
        correlationId,
        interactionId: interaction.id,
        userId: interaction.user.id
      });

      logInteraction({
        interaction,
        feature: 'duel',
        action: 'end',
        correlationId,
        jobId: null
      });

      await interaction.editReply(tr.t('duel.reply.ended', { channelId: duel.publicChannelId }));
      return;
    }

    await interaction.editReply(tr.t('error.unknown_subcommand'));
  }
};
