import type { ChatInputCommandInteraction, Client } from 'discord.js';
import type PgBoss from 'pg-boss';

export type CommandContext = {
  client: Client;
  boss: PgBoss;
};

export type CommandModule = {
  name: string;
  data: {
    toJSON: () => unknown;
  };
  execute: (ctx: CommandContext, interaction: ChatInputCommandInteraction) => Promise<void>;
};