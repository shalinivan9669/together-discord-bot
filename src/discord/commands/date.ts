import { SlashCommandBuilder } from 'discord.js';
import type { DateFilters } from '../../domain/date';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { buildDateGeneratorPicker } from '../interactions/components';
import { assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

const defaultDateFilters: DateFilters = {
  energy: 'medium',
  budget: 'moderate',
  timeWindow: 'evening'
};

function formatFilters(filters: DateFilters): string {
  return `Energy: **${filters.energy}** | Budget: **${filters.budget}** | Time: **${filters.timeWindow}**`;
}

export const dateCommand: CommandModule = {
  name: 'date',
  data: new SlashCommandBuilder()
    .setName('date')
    .setDescription('Generate deterministic weekend date ideas from energy/budget/time'),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ ephemeral: true });

    const correlationId = createCorrelationId();
    logInteraction({
      interaction,
      feature: 'date',
      action: 'open_picker',
      correlationId
    });

    await interaction.editReply({
      content: [
        'Pick your constraints, then press **Generate 3 ideas**.',
        formatFilters(defaultDateFilters)
      ].join('\n'),
      components: buildDateGeneratorPicker(defaultDateFilters) as never
    });
  }
};
