import { SlashCommandBuilder } from 'discord.js';
import { requestPublicPostPublish } from '../../app/projections/publicPostProjection';
import {
  ensureHoroscopeEnabled,
  scheduleWeeklyHoroscopePosts,
} from '../../app/services/horoscopeService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { startOfWeekIso } from '../../lib/time';
import { logInteraction } from '../interactionLog';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

export const horoscopeCommand: CommandModule = {
  name: 'horoscope',
  data: new SlashCommandBuilder()
    .setName('horoscope')
    .setDescription('Weekly horoscope controls')
    .addSubcommand((sub) => sub.setName('status').setDescription('Show horoscope status'))
    .addSubcommand((sub) =>
      sub.setName('publish-now').setDescription('Force schedule + publish due horoscope posts (admin/mod)'),
    ),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ ephemeral: true });

    try {
      ensureHoroscopeEnabled();
    } catch (error) {
      await interaction.editReply(error instanceof Error ? error.message : 'Horoscope is disabled.');
      return;
    }

    const correlationId = createCorrelationId();
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const settings = await getGuildSettings(interaction.guildId);
      const week = startOfWeekIso(new Date());

      logInteraction({
        interaction,
        feature: 'horoscope',
        action: 'status',
        correlationId
      });

      await interaction.editReply(
        `Horoscope is enabled.\n` +
          `Current week: \`${week}\`\n` +
          `Configured channel: ${settings?.horoscopeChannelId ? `<#${settings.horoscopeChannelId}>` : 'not set'}\n` +
          'Weekly publish: Monday 10:00 (scheduler).',
      );
      return;
    }

    if (sub === 'publish-now') {
      const settings = await getGuildSettings(interaction.guildId);
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

      const created = await scheduleWeeklyHoroscopePosts();
      await requestPublicPostPublish(ctx.boss, {
        guildId: interaction.guildId,
        reason: 'horoscope_publish_now',
        interactionId: interaction.id,
        userId: interaction.user.id,
        correlationId
      });

      logInteraction({
        interaction,
        feature: 'horoscope',
        action: 'publish_now',
        correlationId
      });

      await interaction.editReply(`Scheduled ${created} weekly horoscope post(s). Publish job queued.`);
      return;
    }

    await interaction.editReply('Unknown horoscope subcommand.');
  }
};
