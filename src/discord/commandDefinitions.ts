import type { RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';
import { adminCommand } from './commands/admin';
import { anonCommand } from './commands/anon';
import { checkinCommand } from './commands/checkin';
import { dateCommand } from './commands/date';
import { duelCommand } from './commands/duel';
import { hallCommand } from './commands/hall';
import { oracleCommand } from './commands/oracle';
import { pairCommand } from './commands/pair';
import { pingCommand } from './commands/ping';
import { raidCommand } from './commands/raid';
import { repairCommand } from './commands/repair';
import { sayCommand } from './commands/say';
import { seasonCommand } from './commands/season';
import { setupCommand } from './commands/setup';
import type { CommandModule } from './commands/types';

export const commandModules: readonly CommandModule[] = [
  pingCommand,
  adminCommand,
  setupCommand,
  pairCommand,
  sayCommand,
  repairCommand,
  dateCommand,
  duelCommand,
  hallCommand,
  oracleCommand,
  checkinCommand,
  anonCommand,
  raidCommand,
  seasonCommand,
];

export const commandDefinitions: RESTPostAPIApplicationCommandsJSONBody[] = commandModules.map(
  (command) => command.data.toJSON(),
);

