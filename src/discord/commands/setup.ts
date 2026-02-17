import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createCorrelationId } from '../../lib/correlation';
import { getGuildConfig } from '../../app/services/guildConfigService';
import { logInteraction } from '../interactionLog';
import { assertGuildOnly, hasAdminPermission } from '../middleware/guard';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';
import { ensureSetupWizardDraft } from '../setupWizard/state';
import { renderSetupWizardPanel } from '../setupWizard/view';
import type { CommandModule } from './types';

export const setupCommand: CommandModule = {
  name: 'setup',
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Open setup wizard for guild bot settings')
    .addSubcommand((sub) => sub.setName('start').setDescription('Start setup wizard')),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);

    const sub = interaction.options.getSubcommand();
    if (sub !== 'start') {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unknown setup subcommand.' });
      return;
    }

    if (!hasAdminPermission(interaction)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Administrator permission is required for setup wizard.'
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const correlationId = createCorrelationId();
    const config = await getGuildConfig(interaction.guildId);
    const draft = ensureSetupWizardDraft(interaction.guildId, interaction.user.id, config);
    const panel = renderSetupWizardPanel(draft);

    logInteraction({
      interaction,
      feature: 'setup',
      action: 'open_wizard',
      correlationId
    });

    await interaction.editReply({
      content: panel.content ?? null,
      components: panel.components as never,
      flags: COMPONENTS_V2_FLAGS
    } as never);
  }
};
