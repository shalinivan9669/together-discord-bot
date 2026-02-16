import { SlashCommandBuilder, type MessageCreateOptions } from 'discord.js';
import {
  ensureRaidEnabled,
  getRaidProgressSnapshot,
  getTodayRaidOffers,
  startRaid,
} from '../../app/services/raidService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
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
    .setDescription('Server cooperative raid')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start raid')
        .addChannelOption((opt) => opt.setName('channel').setDescription('Public progress channel').setRequired(false))
        .addIntegerOption((opt) => opt.setName('goal').setDescription('Goal points').setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName('quests').setDescription('Show today quests'))
    .addSubcommand((sub) => sub.setName('progress').setDescription('Show raid progress')),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ ephemeral: true });

    try {
      ensureRaidEnabled();
    } catch (error) {
      await interaction.editReply(error instanceof Error ? error.message : 'Raid is disabled.');
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
        await interaction.editReply('Raid public channel is not configured. Use `/setup set-channels raid:<channel>`.');
        return;
      }

      const channel = await interaction.client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !canSend(channel)) {
        await interaction.editReply('Raid channel must be a text channel.');
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
                title: 'Cooperative Raid Progress',
                status: 'initializing',
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
          ? `Raid started in <#${result.raid.publicChannelId}>.`
          : `Active raid already exists in <#${result.raid.publicChannelId}>.`,
      );
      return;
    }

    if (sub === 'quests') {
      const data = await getTodayRaidOffers(interaction.guildId);
      if (data.offers.length === 0) {
        await interaction.editReply('No raid offers found for today.');
        return;
      }

      const lines = data.offers.map(
        (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} pts\n${offer.text}`,
      );

      logInteraction({
        interaction,
        feature: 'raid',
        action: 'quests',
        correlationId
      });

      await interaction.editReply({
        content: `Today offers (\`${data.dayDate}\`):\n\n${lines.join('\n\n')}`,
        components: data.offers.map((offer) => buildRaidClaimButton(offer.key)) as never
      });
      return;
    }

    if (sub === 'progress') {
      const snapshot = await getRaidProgressSnapshot({ guildId: interaction.guildId });
      if (!snapshot) {
        await interaction.editReply('No active raid found.');
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

    await interaction.editReply('Unknown raid subcommand.');
  }
};
