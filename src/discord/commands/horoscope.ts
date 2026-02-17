import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  ensureHoroscopeEnabled,
} from '../../app/services/horoscopeService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { JobNames } from '../../infra/queue/jobs';
import { createCorrelationId } from '../../lib/correlation';
import { startOfWeekIso } from '../../lib/time';
import { logInteraction } from '../interactionLog';
import { formatFeatureUnavailableError } from '../featureErrors';
import { createInteractionTranslator } from '../locale';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

export const horoscopeCommand: CommandModule = {
  name: 'horoscope',
  data: new SlashCommandBuilder()
    .setName('horoscope')
    .setNameLocalizations({ ru: 'horoscope', 'en-US': 'horoscope' })
    .setDescription('Управление недельным гороскопом')
    .setDescriptionLocalizations({ 'en-US': 'Weekly horoscope controls' })
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setNameLocalizations({ ru: 'status', 'en-US': 'status' })
        .setDescription('Показать статус гороскопа')
        .setDescriptionLocalizations({ 'en-US': 'Show horoscope status' }),
    )
    .addSubcommand((sub) =>
      sub
        .setName('publish-now')
        .setNameLocalizations({ ru: 'publish-now', 'en-US': 'publish-now' })
        .setDescription('Форсировать расписание и публикацию гороскопа (админ/модератор)')
        .setDescriptionLocalizations({ 'en-US': 'Force schedule + publish due horoscope posts (admin/mod)' }),
    ),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await ensureHoroscopeEnabled(interaction.guildId);
    } catch (error) {
      const featureError = formatFeatureUnavailableError('ru', error);
      await interaction.editReply(featureError ?? tr.t('horoscope.reply.disabled_fallback'));
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
        `${tr.t('horoscope.reply.enabled')}\n` +
          `${tr.t('horoscope.reply.current_week', { week })}\n` +
          `${tr.t('horoscope.reply.configured_channel', { channel: settings?.horoscopeChannelId ? `<#${settings.horoscopeChannelId}>` : tr.t('common.not_set') })}\n` +
          tr.t('horoscope.reply.weekly_publish'),
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

      await interaction.editReply(tr.t('horoscope.reply.publish_job_queued'));
      return;
    }

    await interaction.editReply(tr.t('error.unknown_subcommand'));
  }
};
