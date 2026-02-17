import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  ensureCheckinEnabled,
  getPairForCheckinChannel,
  listActiveAgreements,
} from '../../app/services/checkinService';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { formatFeatureUnavailableError } from '../featureErrors';
import { createInteractionTranslator } from '../locale';
import { buildCheckinAgreementSelect } from '../interactions/components';
import { assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

export const checkinCommand: CommandModule = {
  name: 'checkin',
  data: new SlashCommandBuilder()
    .setName('checkin')
    .setNameLocalizations({ ru: 'checkin', 'en-US': 'checkin' })
    .setDescription('Еженедельный чек-ин пары')
    .setDescriptionLocalizations({ 'en-US': 'Weekly pair check-in' })
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setNameLocalizations({ ru: 'start', 'en-US': 'start' })
        .setDescription('Запустить недельный чек-ин в комнате пары')
        .setDescriptionLocalizations({ 'en-US': 'Start weekly check-in in your pair room' }),
    ),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await ensureCheckinEnabled(interaction.guildId);
    } catch (error) {
      const featureError = formatFeatureUnavailableError('ru', error);
      await interaction.editReply(featureError ?? tr.t('checkin.reply.disabled_fallback'));
      return;
    }

    const correlationId = createCorrelationId();
    const sub = interaction.options.getSubcommand();
    if (sub !== 'start') {
      await interaction.editReply(tr.t('error.unknown_subcommand'));
      return;
    }

    const pair = await getPairForCheckinChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });

    if (!pair) {
      await interaction.editReply(tr.t('checkin.reply.run_in_pair_room'));
      return;
    }

    const agreements = await listActiveAgreements(25);
    if (agreements.length === 0) {
      await interaction.editReply(tr.t('checkin.reply.no_agreements'));
      return;
    }

    logInteraction({
      interaction,
      feature: 'checkin',
      action: 'start',
      correlationId,
      pairId: pair.id
    });

    await interaction.editReply({
      content: tr.t('checkin.reply.select_agreement'),
      components: [
        buildCheckinAgreementSelect(
          agreements.map((agreement) => ({ key: agreement.key, text: agreement.text })),
          tr.locale,
        ) as never
      ]
    });
  }
};
