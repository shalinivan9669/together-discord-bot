import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../../lib/logger';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { adminCommand } from './admin';
import { anonCommand } from './anon';
import { checkinCommand } from './checkin';
import { dateCommand } from './date';
import { duelCommand } from './duel';
import { hallCommand } from './hall';
import { horoscopeCommand } from './horoscope';
import { pairCommand } from './pair';
import { pingCommand } from './ping';
import { raidCommand } from './raid';
import { repairCommand } from './repair';
import { sayCommand } from './say';
import { seasonCommand } from './season';
import { setupCommand } from './setup';
import type { CommandContext, CommandModule } from './types';

const commandModules: CommandModule[] = [
  pingCommand,
  adminCommand,
  setupCommand,
  pairCommand,
  sayCommand,
  repairCommand,
  dateCommand,
  duelCommand,
  hallCommand,
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
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Command failed. Please try again.' });
    }
  }
}
