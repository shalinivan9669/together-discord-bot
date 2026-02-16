import { SlashCommandBuilder } from 'discord.js';
import { setupSetChannelsUsecase, setupSetModeratorRoleUsecase, setupSetTimezoneUsecase } from '../../app/usecases/setupUsecases';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { assertGuildOnly, hasAdminPermission } from '../middleware/guard';
import type { CommandModule } from './types';

export const setupCommand: CommandModule = {
  name: 'setup',
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure guild bot settings')
    .addSubcommand((sub) =>
      sub
        .setName('set-channels')
        .setDescription('Set configured channels')
        .addChannelOption((opt) =>
          opt.setName('duel_public').setDescription('Duel public scoreboard channel').setRequired(false),
        )
        .addChannelOption((opt) =>
          opt
            .setName('horoscope')
            .setDescription('Horoscope weekly post channel (phase 2)')
            .setRequired(false),
        )
        .addChannelOption((opt) =>
          opt
            .setName('questions')
            .setDescription('Anonymous questions channel (phase 2)')
            .setRequired(false),
        )
        .addChannelOption((opt) =>
          opt.setName('raid').setDescription('Raid progress channel (phase 2)').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-timezone')
        .setDescription('Set guild timezone (IANA format)')
        .addStringOption((opt) => opt.setName('tz').setDescription('Timezone').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-moderator-role')
        .setDescription('Optional role allowed to run moderator commands')
        .addRoleOption((opt) =>
          opt.setName('role').setDescription('Role to set (leave empty to clear)').setRequired(false),
        ),
    ),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);

    if (!hasAdminPermission(interaction)) {
      await interaction.reply({
        ephemeral: true,
        content: 'Administrator permission is required for setup commands.'
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const correlationId = createCorrelationId();
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'set-channels') {
      const duelPublic = interaction.options.getChannel('duel_public');
      const horoscope = interaction.options.getChannel('horoscope');
      const questions = interaction.options.getChannel('questions');
      const raid = interaction.options.getChannel('raid');

      await setupSetChannelsUsecase({
        guildId: interaction.guildId,
        duelPublicChannelId: duelPublic?.id ?? null,
        horoscopeChannelId: horoscope?.id ?? null,
        questionsChannelId: questions?.id ?? null,
        raidChannelId: raid?.id ?? null
      });

      logInteraction({
        interaction,
        feature: 'setup',
        action: 'set_channels',
        correlationId
      });

      await interaction.editReply('Guild channels updated.');
      return;
    }

    if (subcommand === 'set-timezone') {
      const timezone = interaction.options.getString('tz', true).trim();
      await setupSetTimezoneUsecase(interaction.guildId, timezone);

      logInteraction({
        interaction,
        feature: 'setup',
        action: 'set_timezone',
        correlationId
      });

      await interaction.editReply(`Timezone updated to \`${timezone}\`.`);
      return;
    }

    if (subcommand === 'set-moderator-role') {
      const role = interaction.options.getRole('role', false);
      await setupSetModeratorRoleUsecase(interaction.guildId, role?.id ?? null);

      logInteraction({
        interaction,
        feature: 'setup',
        action: 'set_moderator_role',
        correlationId
      });

      await interaction.editReply(role ? `Moderator role set to <@&${role.id}>.` : 'Moderator role cleared.');
      return;
    }

    await interaction.editReply('Unknown setup subcommand.');
  }
};