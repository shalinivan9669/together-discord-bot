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
import { assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

type HallCategoryOption = MonthlyHallCategory | 'all';

function categoryLabel(category: MonthlyHallCategory): string {
  if (category === 'checkin') {
    return 'Check-in top';
  }

  if (category === 'raid') {
    return 'Raid top';
  }

  return 'Duel top';
}

function statusText(status: Record<MonthlyHallCategory, boolean>): string {
  const lines = MONTHLY_HALL_CATEGORIES.map((category) => {
    const state = status[category] ? 'opted in' : 'opted out';
    return `- ${categoryLabel(category)}: **${state}**`;
  });

  return ['Monthly Hall opt-in status:', ...lines].join('\n');
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
    .setDescription('Monthly Hall privacy preferences')
    .addSubcommand((sub) =>
      sub
        .setName('optin')
        .setDescription('Opt into Monthly Hall top categories')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Top category to opt into')
            .setRequired(true)
            .addChoices(
              { name: 'All categories', value: 'all' },
              { name: 'Check-in', value: 'checkin' },
              { name: 'Raid', value: 'raid' },
              { name: 'Duel', value: 'duel' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('optout')
        .setDescription('Opt out from Monthly Hall top categories')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Top category to opt out from')
            .setRequired(true)
            .addChoices(
              { name: 'All categories', value: 'all' },
              { name: 'Check-in', value: 'checkin' },
              { name: 'Raid', value: 'raid' },
              { name: 'Duel', value: 'duel' },
            ),
        ),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Show your Monthly Hall opt-in status')),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const featureState = await getGuildFeatureState(interaction.guildId, 'hall');
    if (!featureState.enabled) {
      await interaction.editReply('Hall feature is disabled.');
      return;
    }

    if (!featureState.configured) {
      await interaction.editReply('Hall feature is enabled, but not configured. Run `/setup start` first.');
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
      await interaction.editReply(statusText(status));
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

      await interaction.editReply(`Preferences updated.\n\n${statusText(status)}`);
      return;
    }

    await interaction.editReply('Unknown hall subcommand.');
  }
};
