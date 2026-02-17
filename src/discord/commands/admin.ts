import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { type JobName, JobNames } from '../../infra/queue/jobs';
import { setRecurringScheduleEnabled } from '../../infra/queue/scheduler';
import {
  evaluateFeatureState,
  formatFeatureLabel,
  guildFeatureNames,
  setGuildFeature,
  type GuildFeatureName,
} from '../../app/services/guildConfigService';
import { buildAdminStatusReport } from '../admin/statusReport';
import { assertGuildOnly, hasAdminPermission } from '../middleware/guard';
import type { CommandModule } from './types';

type ToggleValue = 'on' | 'off';

const featureChoices = guildFeatureNames.map((feature) => ({
  name: feature,
  value: feature
}));

const scheduleChoices: Array<{ name: JobName; value: JobName }> = [
  JobNames.WeeklyHoroscopePublish,
  JobNames.WeeklyCheckinNudge,
  JobNames.WeeklyRaidStart,
  JobNames.WeeklyRaidEnd,
  JobNames.DailyRaidOffersGenerate,
  JobNames.RaidProgressRefresh,
  JobNames.MonthlyHallRefresh,
  JobNames.PublicPostPublish
].map((name) => ({ name, value: name }));

function toToggle(value: ToggleValue): boolean {
  return value === 'on';
}

export const adminCommand: CommandModule = {
  name: 'admin',
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin diagnostics and feature/schedule toggles')
    .addSubcommand((sub) => sub.setName('status').setDescription('Show guild config, features, schedules, permissions'))
    .addSubcommand((sub) =>
      sub
        .setName('feature')
        .setDescription('Toggle a feature for this guild')
        .addStringOption((opt) => {
          const option = opt
            .setName('name')
            .setDescription('Feature name')
            .setRequired(true);

          for (const choice of featureChoices) {
            option.addChoices({ name: choice.name, value: choice.value });
          }

          return option;
        })
        .addStringOption((opt) =>
          opt
            .setName('value')
            .setDescription('on or off')
            .setRequired(true)
            .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('schedule')
        .setDescription('Toggle a recurring scheduler job globally')
        .addStringOption((opt) => {
          const option = opt
            .setName('name')
            .setDescription('Schedule name')
            .setRequired(true);

          for (const choice of scheduleChoices) {
            option.addChoices({ name: choice.name, value: choice.value });
          }

          return option;
        })
        .addStringOption((opt) =>
          opt
            .setName('value')
            .setDescription('on or off')
            .setRequired(true)
            .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }),
        ),
    ),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);

    if (!hasAdminPermission(interaction)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Administrator permission is required.'
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();

    if (sub === 'feature') {
      const name = interaction.options.getString('name', true) as GuildFeatureName;
      const value = interaction.options.getString('value', true) as ToggleValue;
      const enabled = toToggle(value);

      const config = await setGuildFeature(interaction.guildId, name, enabled);
      const state = evaluateFeatureState(config, name);

      await interaction.editReply(
        `${formatFeatureLabel(name)} -> ${enabled ? 'ON' : 'OFF'}\n` +
        `Status: ${state.enabled && state.configured ? 'configured' : state.reason}`,
      );
      return;
    }

    if (sub === 'schedule') {
      const name = interaction.options.getString('name', true) as JobName;
      const value = interaction.options.getString('value', true) as ToggleValue;
      const enabled = toToggle(value);

      const status = await setRecurringScheduleEnabled(ctx.boss, name, enabled);

      await interaction.editReply(
        `Schedule \`${status.name}\` is now ${status.enabled ? 'enabled' : 'disabled'} (cron: \`${status.cron}\`).`,
      );
      return;
    }

    await interaction.editReply(await buildAdminStatusReport(interaction.guild));
  }
};
