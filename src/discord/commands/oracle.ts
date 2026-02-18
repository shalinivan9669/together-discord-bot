import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { ensureOracleEnabled } from '../../app/services/oracleService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { JobNames } from '../../infra/queue/jobs';
import { createCorrelationId } from '../../lib/correlation';
import { startOfWeekIso } from '../../lib/time';
import { logInteraction } from '../interactionLog';
import { formatFeatureUnavailableError } from '../featureErrors';
import { createInteractionTranslator } from '../locale';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

export const oracleCommand: CommandModule = {
  name: 'oracle',
  data: new SlashCommandBuilder()
    .setName('oracle')
    .setNameLocalizations({ ru: 'oracle', 'en-US': 'oracle' })
    .setDescription('Управление Оракулом')
    .setDescriptionLocalizations({ 'en-US': 'Oracle controls' })
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setNameLocalizations({ ru: 'status', 'en-US': 'status' })
        .setDescription('Показать статус Оракула')
        .setDescriptionLocalizations({ 'en-US': 'Show Oracle status' }),
    )
    .addSubcommand((sub) =>
      sub
        .setName('publish-now')
        .setNameLocalizations({ ru: 'publish-now', 'en-US': 'publish-now' })
        .setDescription('Форсировать публикацию Оракула недели (админ/модератор)')
        .setDescriptionLocalizations({ 'en-US': 'Force weekly Oracle publish (admin/mod)' }),
    ),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const correlationId = createCorrelationId();
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      try {
        await ensureOracleEnabled(interaction.guildId);
      } catch (error) {
        const featureError = formatFeatureUnavailableError('ru', error);
        await interaction.editReply(featureError ?? tr.t('oracle.reply.disabled_fallback'));
        return;
      }

      const settings = await getGuildSettings(interaction.guildId);
      const week = startOfWeekIso(new Date());

      logInteraction({
        interaction,
        feature: 'oracle',
        action: 'status',
        correlationId,
      });

      await interaction.editReply(
        `${tr.t('oracle.reply.enabled')}\n`
          + `${tr.t('oracle.reply.current_week', { week })}\n`
          + `${tr.t('oracle.reply.configured_channel', { channel: settings?.oracleChannelId ? `<#${settings.oracleChannelId}>` : tr.t('common.not_set') })}\n`
          + tr.t('oracle.reply.weekly_publish'),
      );
      return;
    }

    if (sub === 'publish-now') {
      const settings = await getGuildSettings(interaction.guildId);
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);
      if (!settings?.oracleChannelId) {
        await interaction.editReply(tr.t('oracle.reply.channel_not_configured_publish_now'));
        return;
      }

      try {
        await ensureOracleEnabled(interaction.guildId);
      } catch (error) {
        const featureError = formatFeatureUnavailableError('ru', error);
        await interaction.editReply(featureError ?? tr.t('oracle.reply.disabled_fallback'));
        return;
      }

      await ctx.boss.send(JobNames.OraclePublish, {
        correlationId,
        interactionId: interaction.id,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        feature: 'oracle',
        action: 'publish_now',
        weekStartDate: startOfWeekIso(new Date()),
      });

      logInteraction({
        interaction,
        feature: 'oracle',
        action: 'publish_now',
        correlationId,
      });

      await interaction.editReply(
        tr.t('oracle.reply.publish_job_queued_eta', { channelId: settings.oracleChannelId }),
      );
      return;
    }

    await interaction.editReply(tr.t('error.unknown_subcommand'));
  },
};
