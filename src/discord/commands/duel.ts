import { SlashCommandBuilder, type GuildBasedChannel, type MessageCreateOptions } from 'discord.js';
import {
  duelEndUsecase,
  duelRoundStartUsecase,
  duelStartUsecase
} from '../../app/usecases/duelUsecases';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import { buildDuelSubmitButton } from '../interactions/components';
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
    .setDescription('Manage duel rounds and scoreboard')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start a new duel')
        .addChannelOption((opt) =>
          opt.setName('public_channel').setDescription('Scoreboard channel').setRequired(true),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('round')
        .setDescription('Round controls')
        .addSubcommand((sub) =>
          sub
            .setName('start')
            .setDescription('Start a round and notify all pairs')
            .addIntegerOption((opt) =>
              opt
                .setName('duration_minutes')
                .setDescription('Round duration in minutes')
                .setMinValue(5)
                .setMaxValue(720)
                .setRequired(true),
            ),
        ),
    )
    .addSubcommand((sub) => sub.setName('end').setDescription('End active duel')),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ ephemeral: true });

    const correlationId = createCorrelationId();
    const settings = await getGuildSettings(interaction.guildId);
    assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

    const subcommand = interaction.options.getSubcommand();
    const subcommandGroup = interaction.options.getSubcommandGroup(false);

    if (!subcommandGroup && subcommand === 'start') {
      const publicChannel = interaction.options.getChannel('public_channel', true);
      if (!publicChannel.isTextBased() || !canSend(publicChannel)) {
        await interaction.editReply('Public channel must be text based.');
        return;
      }

      const result = await duelStartUsecase({
        guildId: interaction.guildId,
        publicChannelId: publicChannel.id,
        createScoreboardMessage: async (content) => {
          const sent = await publicChannel.send({ content });
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
        ? `Duel started in <#${result.duel.publicChannelId}>.`
        : `Duel is already active in <#${result.duel.publicChannelId}>.`;

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
              `Round #${roundNo} is live. Submit before <t:${Math.floor(endsAt.getTime() / 1000)}:t>. ` +
              'Use the button below once per round.',
            components: [buildDuelSubmitButton({ duelId, roundId, pairId }) as never]
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
        `Round #${result.round.roundNo} started for ${result.pairCount} pair(s). Ends <t:${Math.floor(
          result.round.endsAt.getTime() / 1000,
        )}:R>.`,
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

      await interaction.editReply(`Ended duel in <#${duel.publicChannelId}>.`);
      return;
    }

    await interaction.editReply('Unknown duel subcommand.');
  }
};