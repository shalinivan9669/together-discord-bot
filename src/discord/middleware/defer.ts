import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction
} from 'discord.js';
import { MessageFlags } from 'discord.js';

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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}
