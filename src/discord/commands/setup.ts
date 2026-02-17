import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createCorrelationId } from '../../lib/correlation';
import { getGuildConfig } from '../../app/services/guildConfigService';
import { logInteraction } from '../interactionLog';
import { createInteractionTranslator } from '../locale';
import { assertGuildOnly, hasAdminPermission } from '../middleware/guard';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';
import { ensureSetupWizardDraft } from '../setupWizard/state';
import { renderSetupWizardPanel } from '../setupWizard/view';
import type { CommandModule } from './types';

export const setupCommand: CommandModule = {
  name: 'setup',
  data: new SlashCommandBuilder()
    .setName('setup')
    .setNameLocalizations({ ru: 'setup', 'en-US': 'setup' })
    .setDescription('Открыть мастер настройки сервера')
    .setDescriptionLocalizations({ 'en-US': 'Open guild setup wizard' })
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setNameLocalizations({ ru: 'start', 'en-US': 'start' })
        .setDescription('Запустить мастер настройки')
        .setDescriptionLocalizations({ 'en-US': 'Start setup wizard' }),
    ),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);

    const sub = interaction.options.getSubcommand();
    if (sub !== 'start') {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('setup.command.unknown_subcommand') });
      return;
    }

    if (!hasAdminPermission(interaction)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: tr.t('error.admin_required')
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const correlationId = createCorrelationId();
    const config = await getGuildConfig(interaction.guildId);
    const draft = ensureSetupWizardDraft(interaction.guildId, interaction.user.id, config);
    const panel = renderSetupWizardPanel(draft, config.locale);

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
