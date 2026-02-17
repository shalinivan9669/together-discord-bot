import { ChannelType, DiscordAPIError, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { requestPairHomeRefresh } from '../../app/projections/pairHomeProjection';
import { pairCreateUsecase, pairRoomUsecase } from '../../app/usecases/pairUsecases';
import { getGuildConfig } from '../../app/services/guildConfigService';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { createInteractionTranslator } from '../locale';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import { describePairCreatePermissionIssue } from '../permissions/check';
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
    .setNameLocalizations({ ru: 'pair', 'en-US': 'pair' })
    .setDescription('Управление приватными комнатами пар')
    .setDescriptionLocalizations({ 'en-US': 'Manage pair private rooms' })
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setNameLocalizations({ ru: 'create', 'en-US': 'create' })
        .setDescription('Создать или вернуть приватную комнату пары')
        .setDescriptionLocalizations({ 'en-US': 'Create or return a private pair room' })
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setNameLocalizations({ ru: 'user', 'en-US': 'user' })
            .setDescription('Второй участник')
            .setDescriptionLocalizations({ 'en-US': 'Second user' })
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('room')
        .setNameLocalizations({ ru: 'room', 'en-US': 'room' })
        .setDescription('Показать ссылку на вашу приватную комнату пары')
        .setDescriptionLocalizations({ 'en-US': 'Get your pair private room link' }),
    ),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);
    const correlationId = createCorrelationId();

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const targetUser = interaction.options.getUser('user', true);
      const config = await getGuildConfig(interaction.guildId);
      assertAdminOrConfiguredModerator(interaction, config.anonModRoleId);

      const botUserId = interaction.client.user?.id;
      if (!botUserId) {
        throw new Error('Bot user not available');
      }

      const permissionIssue = await describePairCreatePermissionIssue({
        guild: interaction.guild,
        pairCategoryId: config.pairCategoryId,
        locale: tr.locale
      });
      if (permissionIssue) {
        await interaction.editReply(
          tr.t('pair.reply.permission_retry', {
            details: permissionIssue
          }),
        );
        return;
      }

      let result: Awaited<ReturnType<typeof pairCreateUsecase>>;
      try {
        result = await pairCreateUsecase({
          guildId: interaction.guildId,
          userA: interaction.user.id,
          userB: targetUser.id,
          createPrivateChannel: async ([userLow, userHigh]) => {
            const lowMember = await interaction.guild.members.fetch(userLow);
            const highMember = await interaction.guild.members.fetch(userHigh);

            const channel = await interaction.guild.channels.create({
              name: roomName(lowMember.displayName, highMember.displayName),
              type: ChannelType.GuildText,
              parent: config.pairCategoryId ?? undefined,
              permissionOverwrites: buildPairRoomOverwrites({
                guildId: interaction.guildId,
                botUserId,
                memberIds: [userLow, userHigh],
                moderatorRoleId: config.anonModRoleId
              }),
              reason: `Pair room for ${userLow} and ${userHigh}`
            });

            return channel.id;
          }
        });
      } catch (error) {
        if (error instanceof DiscordAPIError && error.code === 50013) {
          await interaction.editReply(tr.t('pair.reply.cannot_create_room_permission'));
          return;
        }

        throw error;
      }

      logInteraction({
        interaction,
        feature: 'pair',
        action: 'create',
        correlationId,
        pairId: result.pair.id
      });

      await interaction.editReply(
        result.created
          ? tr.t('pair.reply.created_room', {
              channelId: result.pair.privateChannelId,
              user1: result.pair.user1Id,
              user2: result.pair.user2Id
            })
          : tr.t('pair.reply.existing_room', {
              channelId: result.pair.privateChannelId,
              user1: result.pair.user1Id,
              user2: result.pair.user2Id
            }),
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
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const pair = await pairRoomUsecase(interaction.guildId, interaction.user.id);
      logInteraction({
        interaction,
        feature: 'pair',
        action: 'room_lookup',
        correlationId,
        pairId: pair?.id ?? null
      });

      if (!pair) {
        await interaction.editReply(tr.t('pair.reply.no_active_room'));
        return;
      }

      await interaction.editReply(tr.t('pair.reply.your_room', { channelId: pair.privateChannelId }));
      return;
    }

    await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.unknown_subcommand') });
  }
};
