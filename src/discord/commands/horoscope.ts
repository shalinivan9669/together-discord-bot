import { SlashCommandBuilder } from 'discord.js';
import {
  ensureHoroscopeEnabled,
} from '../../app/services/horoscopeService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { JobNames } from '../../infra/queue/jobs';
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

      await ctx.boss.send(JobNames.WeeklyHoroscopePublish, {
        correlationId,
        interactionId: interaction.id,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        feature: 'horoscope',
        action: 'publish_now',
        weekStartDate: startOfWeekIso(new Date())
      });

      logInteraction({
        interaction,
        feature: 'horoscope',
        action: 'publish_now',
        correlationId
      });

      await interaction.editReply('Weekly horoscope refresh job queued.');
      return;
    }

    await interaction.editReply('Unknown horoscope subcommand.');
  }
};
