import { SlashCommandBuilder } from 'discord.js';
import { createCorrelationId } from '../../lib/correlation';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
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
    .setDescription('Open setup wizard for guild bot settings'),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);

    if (!hasAdminPermission(interaction)) {
      await interaction.reply({
        ephemeral: true,
        content: 'Administrator permission is required for setup wizard.'
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const correlationId = createCorrelationId();
    const settings = await getGuildSettings(interaction.guildId);
    const draft = ensureSetupWizardDraft(interaction.guildId, interaction.user.id, settings);
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
