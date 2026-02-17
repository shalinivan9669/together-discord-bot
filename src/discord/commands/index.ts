import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../../lib/logger';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { commandDefinitions, commandModules } from '../commandDefinitions';
import type { CommandContext, CommandModule } from './types';

const commandMap = new Map<string, CommandModule>(commandModules.map((cmd) => [cmd.name, cmd]));

export const commandPayloads = commandDefinitions;

export async function handleChatInputCommand(
  ctx: CommandContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const command = commandMap.get(interaction.commandName);
  const correlationId = createCorrelationId();

  logInteraction({
    interaction,
    feature: interaction.commandName,
    action: 'invoke',
    correlationId,
    pairId: null,
    jobId: null,
  });

  if (!command) {
    logger.warn({ command: interaction.commandName }, 'Unknown command invoked');
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unknown command.' });
    }
    return;
  }

  try {
    await command.execute(ctx, interaction);
  } catch (error) {
    logger.error({ error, command: interaction.commandName }, 'Command execution failed');

    if (interaction.deferred) {
      await interaction.editReply('Command failed. Please try again.');
      return;
    }

    if (!interaction.replied) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Command failed. Please try again.',
      });
    }
  }
}
