import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  getMonthlyHallOptInStatus,
  MONTHLY_HALL_CATEGORIES,
  setMonthlyHallOptIn,
  type MonthlyHallCategory,
} from '../../app/services/monthlyHallService';
import { getGuildFeatureState } from '../../app/services/guildConfigService';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { createInteractionTranslator } from '../locale';
import { assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

type HallCategoryOption = MonthlyHallCategory | 'all';
type Translator = Awaited<ReturnType<typeof createInteractionTranslator>>;
type TFn = Translator['t'];

function categoryLabel(
  category: MonthlyHallCategory,
  t: TFn,
): string {
  if (category === 'checkin') {
    return t('hall.category.checkin');
  }

  if (category === 'raid') {
    return t('hall.category.raid');
  }

  return t('hall.category.duel');
}

function statusText(
  status: Record<MonthlyHallCategory, boolean>,
  t: TFn,
): string {
  const lines = MONTHLY_HALL_CATEGORIES.map((category) => {
    const state = status[category] ? t('hall.status.opted_in') : t('hall.status.opted_out');
    return `- ${categoryLabel(category, t)}: **${state}**`;
  });

  return [t('hall.reply.status_header'), ...lines].join('\n');
}

function parseCategories(option: HallCategoryOption): MonthlyHallCategory[] {
  if (option === 'all') {
    return [...MONTHLY_HALL_CATEGORIES];
  }

  return [option];
}

export const hallCommand: CommandModule = {
  name: 'hall',
  data: new SlashCommandBuilder()
    .setName('hall')
    .setNameLocalizations({ ru: 'hall', 'en-US': 'hall' })
    .setDescription('Настройки приватности для Зала славы')
    .setDescriptionLocalizations({ 'en-US': 'Monthly Hall privacy preferences' })
    .addSubcommand((sub) =>
      sub
        .setName('optin')
        .setNameLocalizations({ ru: 'optin', 'en-US': 'optin' })
        .setDescription('Включить участие в категориях Зала славы')
        .setDescriptionLocalizations({ 'en-US': 'Opt into Monthly Hall top categories' })
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setNameLocalizations({ ru: 'category', 'en-US': 'category' })
            .setDescription('Категория рейтинга для включения')
            .setDescriptionLocalizations({ 'en-US': 'Top category to opt into' })
            .setRequired(true)
            .addChoices(
              { name: 'Все категории', value: 'all' },
              { name: 'Чек-ин', value: 'checkin' },
              { name: 'Рейд', value: 'raid' },
              { name: 'Дуэль', value: 'duel' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('optout')
        .setNameLocalizations({ ru: 'optout', 'en-US': 'optout' })
        .setDescription('Отключить участие в категориях Зала славы')
        .setDescriptionLocalizations({ 'en-US': 'Opt out from Monthly Hall top categories' })
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setNameLocalizations({ ru: 'category', 'en-US': 'category' })
            .setDescription('Категория рейтинга для выключения')
            .setDescriptionLocalizations({ 'en-US': 'Top category to opt out from' })
            .setRequired(true)
            .addChoices(
              { name: 'Все категории', value: 'all' },
              { name: 'Чек-ин', value: 'checkin' },
              { name: 'Рейд', value: 'raid' },
              { name: 'Дуэль', value: 'duel' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setNameLocalizations({ ru: 'status', 'en-US': 'status' })
        .setDescription('Показать ваш статус участия в Зале славы')
        .setDescriptionLocalizations({ 'en-US': 'Show your Monthly Hall opt-in status' }),
    ),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const featureState = await getGuildFeatureState(interaction.guildId, 'hall');
    if (!featureState.enabled) {
      await interaction.editReply(tr.t('hall.reply.feature_disabled'));
      return;
    }

    if (!featureState.configured) {
      await interaction.editReply(tr.t('hall.reply.feature_not_configured'));
      return;
    }

    const correlationId = createCorrelationId();
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'status') {
      const status = await getMonthlyHallOptInStatus(interaction.guildId, interaction.user.id);
      logInteraction({
        interaction,
        feature: 'hall',
        action: 'status',
        correlationId
      });
      await interaction.editReply(statusText(status, tr.t));
      return;
    }

    if (subcommand === 'optin' || subcommand === 'optout') {
      const category = interaction.options.getString('category', true) as HallCategoryOption;
      const categories = parseCategories(category);

      await setMonthlyHallOptIn({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        categories,
        enabled: subcommand === 'optin'
      });

      const status = await getMonthlyHallOptInStatus(interaction.guildId, interaction.user.id);

      logInteraction({
        interaction,
        feature: 'hall',
        action: subcommand,
        correlationId
      });

      await interaction.editReply(`${tr.t('hall.reply.preferences_updated')}\n\n${statusText(status, tr.t)}`);
      return;
    }

    await interaction.editReply(tr.t('error.unknown_subcommand'));
  }
};
