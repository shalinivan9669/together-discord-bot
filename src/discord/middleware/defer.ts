import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction
} from 'discord.js';

export async function deferEphemeral(
  interaction:
    | ChatInputCommandInteraction
    | ModalSubmitInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    return;
  }

  if (interaction.isMessageComponent()) {
    await interaction.deferReply({ ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
}