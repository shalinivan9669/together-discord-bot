import { MessageFlags, SlashCommandBuilder, type MessageCreateOptions } from 'discord.js';
import {
  ensureRaidEnabled,
  getRaidProgressSnapshot,
  getTodayRaidOffers,
  startRaid,
} from '../../app/services/raidService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { createInteractionTranslator } from '../locale';
import { buildRaidClaimButton } from '../interactions/components';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import { renderRaidProgressText } from '../projections/raidProgressRenderer';
import { sendComponentsV2Message, textBlock, uiCard } from '../ui-v2';
import type { CommandModule } from './types';

function canSend(channel: unknown): channel is {
  id: string;
  send: (options: string | MessageCreateOptions) => Promise<{ id: string }>;
} {
  if (!channel || typeof channel !== 'object') {
    return false;
  }

  return 'id' in channel && typeof channel.id === 'string' && 'send' in channel && typeof channel.send === 'function';
}

export const raidCommand: CommandModule = {
  name: 'raid',
  data: new SlashCommandBuilder()
    .setName('raid')
    .setNameLocalizations({ ru: 'raid', 'en-US': 'raid' })
    .setDescription('Кооперативный рейд сервера')
    .setDescriptionLocalizations({ 'en-US': 'Server cooperative raid' })
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setNameLocalizations({ ru: 'start', 'en-US': 'start' })
        .setDescription('Запустить рейд')
        .setDescriptionLocalizations({ 'en-US': 'Start raid' })
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setNameLocalizations({ ru: 'channel', 'en-US': 'channel' })
            .setDescription('Публичный канал прогресса')
            .setDescriptionLocalizations({ 'en-US': 'Public progress channel' })
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('goal')
            .setNameLocalizations({ ru: 'goal', 'en-US': 'goal' })
            .setDescription('Целевые очки')
            .setDescriptionLocalizations({ 'en-US': 'Goal points' })
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('quests')
        .setNameLocalizations({ ru: 'quests', 'en-US': 'quests' })
        .setDescription('Показать квесты на сегодня')
        .setDescriptionLocalizations({ 'en-US': 'Show today quests' }),
    )
    .addSubcommand((sub) =>
      sub
        .setName('progress')
        .setNameLocalizations({ ru: 'progress', 'en-US': 'progress' })
        .setDescription('Показать прогресс рейда')
        .setDescriptionLocalizations({ 'en-US': 'Show raid progress' }),
    ),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await ensureRaidEnabled(interaction.guildId);
    } catch {
      await interaction.editReply(tr.t('raid.reply.disabled_fallback'));
      return;
    }

    const correlationId = createCorrelationId();
    const settings = await getGuildSettings(interaction.guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

      const selectedChannel = interaction.options.getChannel('channel', false);
      const channelId = selectedChannel?.id ?? settings?.raidChannelId ?? null;
      if (!channelId) {
        await interaction.editReply(tr.t('raid.reply.channel_not_configured'));
        return;
      }

      const channel = await interaction.client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !canSend(channel)) {
        await interaction.editReply(tr.t('raid.reply.channel_must_be_text'));
        return;
      }

      const goal = interaction.options.getInteger('goal', false) ?? undefined;
      const result = await startRaid({
        guildId: interaction.guildId,
        publicChannelId: channel.id,
        goalPoints: goal,
        createProgressMessage: async (content) => {
          const sent = await sendComponentsV2Message(interaction.client, channel.id, {
            components: [
              uiCard({
                title: 'Прогресс рейда сервера',
                status: 'инициализация',
                accentColor: 0x1e6f9f,
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
        feature: 'raid',
        action: 'start',
        correlationId,
      });

      await interaction.editReply(
        result.created
          ? tr.t('raid.reply.started', { channelId: result.raid.publicChannelId })
          : tr.t('raid.reply.already_active', { channelId: result.raid.publicChannelId }),
      );
      return;
    }

    if (sub === 'quests') {
      const data = await getTodayRaidOffers(interaction.guildId);
      if (data.offers.length === 0) {
        await interaction.editReply(tr.t('raid.reply.no_offers_today'));
        return;
      }

      const lines = data.offers.map(
        (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} ${tr.t('interaction.common.points_short')}\n${offer.text}`,
      );

      logInteraction({
        interaction,
        feature: 'raid',
        action: 'quests',
        correlationId
      });

      await interaction.editReply({
        content: `${tr.t('raid.reply.today_offers', { dayDate: data.dayDate })}\n\n${lines.join('\n\n')}`,
        components: data.offers.map((offer) => buildRaidClaimButton(offer.key, tr.locale)) as never
      });
      return;
    }

    if (sub === 'progress') {
      const snapshot = await getRaidProgressSnapshot({ guildId: interaction.guildId });
      if (!snapshot) {
        await interaction.editReply(tr.t('raid.reply.no_active_raid'));
        return;
      }

      logInteraction({
        interaction,
        feature: 'raid',
        action: 'progress',
        correlationId
      });

      await interaction.editReply(renderRaidProgressText(snapshot));
      return;
    }

    await interaction.editReply(tr.t('error.unknown_subcommand'));
  }
};
