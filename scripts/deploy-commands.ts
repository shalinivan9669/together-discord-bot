import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord.js';
import { commandPayloads } from '../src/discord/commands';

loadDotenv();

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APP_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1).optional()
});

const env = schema.parse(process.env);

async function main() {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  if (env.DISCORD_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_GUILD_ID), {
      body: commandPayloads
    });
    console.log(`Deployed ${commandPayloads.length} guild commands to ${env.DISCORD_GUILD_ID}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(env.DISCORD_APP_ID), {
    body: commandPayloads
  });
  console.log(`Deployed ${commandPayloads.length} global commands.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});