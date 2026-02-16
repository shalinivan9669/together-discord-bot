import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { requestPairHomeRefresh } from '../../app/projections/pairHomeProjection';
import { pairCreateUsecase, pairRoomUsecase } from '../../app/usecases/pairUsecases';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import { buildPairRoomOverwrites } from '../permissions/overwrites';
import type { CommandModule } from './types';

function roomName(userA: string, userB: string): string {
  const sanitize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  return `pair-${sanitize(userA)}-${sanitize(userB)}`;
}

export const pairCommand: CommandModule = {
  name: 'pair',
  data: new SlashCommandBuilder()
    .setName('pair')
    .setDescription('Manage pair private rooms')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create or return a private pair room')
        .addUserOption((opt) => opt.setName('user').setDescription('Second user').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('room').setDescription('Get your pair private room link')),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    const correlationId = createCorrelationId();

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser('user', true);
      const settings = await getGuildSettings(interaction.guildId);
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

      const botUserId = interaction.client.user?.id;
      if (!botUserId) {
        throw new Error('Bot user not available');
      }

      const result = await pairCreateUsecase({
        guildId: interaction.guildId,
        userA: interaction.user.id,
        userB: targetUser.id,
        createPrivateChannel: async ([userLow, userHigh]) => {
          const lowMember = await interaction.guild.members.fetch(userLow);
          const highMember = await interaction.guild.members.fetch(userHigh);

          const channel = await interaction.guild.channels.create({
            name: roomName(lowMember.displayName, highMember.displayName),
            type: ChannelType.GuildText,
            permissionOverwrites: buildPairRoomOverwrites({
              guildId: interaction.guildId,
              botUserId,
              memberIds: [userLow, userHigh],
              moderatorRoleId: settings?.moderatorRoleId ?? null
            }),
            reason: `Pair room for ${userLow} and ${userHigh}`
          });

          return channel.id;
        }
      });

      logInteraction({
        interaction,
        feature: 'pair',
        action: 'create',
        correlationId,
        pairId: result.pair.id
      });

      const prefix = result.created ? 'Created' : 'Existing';
      await interaction.editReply(
        `${prefix} pair room: <#${result.pair.privateChannelId}> for <@${result.pair.user1Id}> + <@${result.pair.user2Id}>`,
      );

      await requestPairHomeRefresh(ctx.boss, {
        guildId: interaction.guildId,
        pairId: result.pair.id,
        reason: result.created ? 'pair_created' : 'pair_room_opened',
        correlationId,
        interactionId: interaction.id,
        userId: interaction.user.id
      });
      return;
    }

    if (subcommand === 'room') {
      await interaction.deferReply({ ephemeral: true });

      const pair = await pairRoomUsecase(interaction.guildId, interaction.user.id);
      logInteraction({
        interaction,
        feature: 'pair',
        action: 'room_lookup',
        correlationId,
        pairId: pair?.id ?? null
      });

      if (!pair) {
        await interaction.editReply('No active pair room found for you.');
        return;
      }

      await interaction.editReply(`Your pair room: <#${pair.privateChannelId}>`);
      return;
    }

    await interaction.reply({ ephemeral: true, content: 'Unknown pair subcommand.' });
  }
};
