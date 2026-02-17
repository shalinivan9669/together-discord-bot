import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createCorrelationId } from '../../lib/correlation';
import { getGuildConfig } from '../../app/services/guildConfigService';
import { logInteraction } from '../interactionLog';
import { assertGuildOnly, hasAdminPermission } from '../middleware/guard';
import { sendComponentsV2Message } from '../ui-v2';
import { ensureSetupWizardDraft } from '../setupWizard/state';
import { renderSetupWizardPanel } from '../setupWizard/view';
import { t } from '../../i18n';
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
    const locale = 'ru' as const;

    const sub = interaction.options.getSubcommand();
    if (sub !== 'start') {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: t(locale, 'setup.command.unknown_subcommand') });
      return;
    }

    if (!hasAdminPermission(interaction)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: t(locale, 'error.admin_required')
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const correlationId = createCorrelationId();
    const config = await getGuildConfig(interaction.guildId);
    const draft = ensureSetupWizardDraft(interaction.guildId, interaction.user.id, config);
    const panel = renderSetupWizardPanel(draft, locale);

    const created = await sendComponentsV2Message(interaction.client, interaction.channelId, panel);
    const jumpUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${created.id}`;

    logInteraction({
      interaction,
      feature: 'setup',
      action: 'open_wizard',
      correlationId
    });

    await interaction.editReply({
      content: t(locale, 'setup.command.wizard_posted', {
        channelId: interaction.channelId,
        jumpUrl
      })
    });
  }
};
