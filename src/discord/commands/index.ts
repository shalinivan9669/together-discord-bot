import type { ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../lib/logger';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { anonCommand } from './anon';
import { checkinCommand } from './checkin';
import { duelCommand } from './duel';
import { horoscopeCommand } from './horoscope';
import { pairCommand } from './pair';
import { pingCommand } from './ping';
import { raidCommand } from './raid';
import { seasonCommand } from './season';
import { setupCommand } from './setup';
import type { CommandContext, CommandModule } from './types';

const commandModules: CommandModule[] = [
  pingCommand,
  setupCommand,
  pairCommand,
  duelCommand,
  horoscopeCommand,
  checkinCommand,
  anonCommand,
  raidCommand,
  seasonCommand
];

const commandMap = new Map<string, CommandModule>(commandModules.map((cmd) => [cmd.name, cmd]));

export const commandPayloads = commandModules.map((cmd) => cmd.data.toJSON());

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
    jobId: null
  });

  if (!command) {
    logger.warn({ command: interaction.commandName }, 'Unknown command invoked');
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ ephemeral: true, content: 'Unknown command.' });
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
      await interaction.reply({ ephemeral: true, content: 'Command failed. Please try again.' });
    }
  }
}