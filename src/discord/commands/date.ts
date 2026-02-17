import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { DateFilters } from '../../domain/date';
import { t, type AppLocale } from '../../i18n';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { createInteractionTranslator } from '../locale';
import { buildDateGeneratorPicker } from '../interactions/components';
import { assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

const defaultDateFilters: DateFilters = {
  energy: 'medium',
  budget: 'moderate',
  timeWindow: 'evening'
};

function formatFilters(locale: AppLocale, filters: DateFilters): string {
  return t(locale, 'date.summary', {
    energy: t(locale, `date.energy.${filters.energy}` as const),
    budget: t(locale, `date.budget.${filters.budget}` as const),
    time: t(locale, `date.time.${filters.timeWindow}` as const)
  });
}

export const dateCommand: CommandModule = {
  name: 'date',
  data: new SlashCommandBuilder()
    .setName('date')
    .setNameLocalizations({ ru: 'date', 'en-US': 'date' })
    .setDescription('Сгенерировать детерминированные идеи свидания по энергии/бюджету/времени')
    .setDescriptionLocalizations({ 'en-US': 'Generate deterministic weekend date ideas from energy/budget/time' }),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const correlationId = createCorrelationId();
    logInteraction({
      interaction,
      feature: 'date',
      action: 'open_picker',
      correlationId
    });

    await interaction.editReply({
      content: [
        tr.t('date.reply.pick_constraints'),
        formatFilters(tr.locale, defaultDateFilters)
      ].join('\n'),
      components: buildDateGeneratorPicker(defaultDateFilters, tr.locale) as never
    });
  }
};
