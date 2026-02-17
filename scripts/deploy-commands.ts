import { config as loadDotenv } from 'dotenv';
import type { APIApplicationCommand, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';
import { z } from 'zod';
import { DiscordAPIError, HTTPError, REST } from '@discordjs/rest';
import { ApplicationCommandType, Routes } from 'discord.js';

loadDotenv();

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}, z.string().min(1).optional());

const schema = z.object({
  DISCORD_TOKEN: z.string().trim().min(1),
  DISCORD_APP_ID: z.string().trim().min(1),
  DISCORD_GUILD_ID: optionalNonEmptyString,
  COMMAND_DEPLOY_MODE: z.enum(['guild', 'global']).optional(),
});

type CommandDeployEnv = z.infer<typeof schema>;
type DeployTarget =
  | {
      mode: 'guild';
      getRoute: string;
      putRoute: string;
      guildId: string;
    }
  | {
      mode: 'global';
      getRoute: string;
      putRoute: string;
    };

function parseEnv(): CommandDeployEnv {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid command deploy environment: ${JSON.stringify(fieldErrors)}`);
  }

  return parsed.data;
}

function resolveDeployTarget(env: CommandDeployEnv): DeployTarget {
  if (env.COMMAND_DEPLOY_MODE === 'guild') {
    if (!env.DISCORD_GUILD_ID) {
      throw new Error('COMMAND_DEPLOY_MODE=guild requires DISCORD_GUILD_ID');
    }

    return {
      mode: 'guild',
      guildId: env.DISCORD_GUILD_ID,
      getRoute: Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_GUILD_ID),
      putRoute: Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_GUILD_ID),
    };
  }

  if (env.COMMAND_DEPLOY_MODE === 'global') {
    return {
      mode: 'global',
      getRoute: Routes.applicationCommands(env.DISCORD_APP_ID),
      putRoute: Routes.applicationCommands(env.DISCORD_APP_ID),
    };
  }

  if (env.DISCORD_GUILD_ID) {
    return {
      mode: 'guild',
      guildId: env.DISCORD_GUILD_ID,
      getRoute: Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_GUILD_ID),
      putRoute: Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_GUILD_ID),
    };
  }

  return {
    mode: 'global',
    getRoute: Routes.applicationCommands(env.DISCORD_APP_ID),
    putRoute: Routes.applicationCommands(env.DISCORD_APP_ID),
  };
}

function toCommandArray(payload: unknown): APIApplicationCommand[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload as APIApplicationCommand[];
}

function isChatInputCommand(command: APIApplicationCommand): boolean {
  return command.type === ApplicationCommandType.ChatInput;
}

function diffFingerprint(command: {
  description?: string;
  options?: unknown;
  default_member_permissions?: string | null;
  dm_permission?: boolean;
  nsfw?: boolean;
}): string {
  return JSON.stringify({
    description: command.description ?? '',
    options: command.options ?? [],
    default_member_permissions: command.default_member_permissions ?? null,
    dm_permission: command.dm_permission ?? true,
    nsfw: command.nsfw ?? false,
  });
}

function summarizeDiff(
  existingCommands: APIApplicationCommand[],
  nextDefinitions: RESTPostAPIApplicationCommandsJSONBody[],
): {
  added: string[];
  removed: string[];
  updated: string[];
} {
  const existingByName = new Map(
    existingCommands.filter(isChatInputCommand).map((command) => [command.name, command]),
  );
  const nextByName = new Map(nextDefinitions.map((command) => [command.name, command]));

  const added = [...nextByName.keys()].filter((name) => !existingByName.has(name)).sort();
  const removed = [...existingByName.keys()].filter((name) => !nextByName.has(name)).sort();

  const updated = [...nextByName.entries()]
    .filter(([name, definition]) => {
      const existing = existingByName.get(name);
      if (!existing) {
        return false;
      }

      return diffFingerprint(existing) !== diffFingerprint(definition);
    })
    .map(([name]) => name)
    .sort();

  return { added, removed, updated };
}

function printNames(prefix: string, names: string[]): void {
  if (names.length === 0) {
    return;
  }

  console.log(`${prefix}: ${names.map((name) => `/${name}`).join(', ')}`);
}

function printApiError(error: unknown): void {
  if (error instanceof DiscordAPIError) {
    console.error(
      `[commands:deploy] Discord API error ${error.status} (${error.code}) ${error.method} ${error.url}`,
    );
    console.error('[commands:deploy] Response body:', JSON.stringify(error.rawError, null, 2));
    return;
  }

  if (error instanceof HTTPError) {
    console.error(`[commands:deploy] HTTP error ${error.status} ${error.method} ${error.url}`);
    return;
  }

  if (error instanceof Error) {
    console.error('[commands:deploy] Failed:', error.message);
    return;
  }

  console.error('[commands:deploy] Failed with unknown error:', error);
}

async function loadCommandDefinitions(): Promise<RESTPostAPIApplicationCommandsJSONBody[]> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  let databaseUrlLooksValid = false;

  if (databaseUrl) {
    try {
      new URL(databaseUrl);
      databaseUrlLooksValid = true;
    } catch {
      databaseUrlLooksValid = false;
    }
  }

  if (!databaseUrlLooksValid) {
    // Some runtime modules validate DATABASE_URL on import; deploy script does not use DB.
    process.env.DATABASE_URL =
      'postgresql://command-deploy:command-deploy@localhost:5432/command_deploy';
  }

  const module = await import('../src/discord/commandDefinitions');
  return module.commandDefinitions;
}

async function main() {
  const env = parseEnv();
  const target = resolveDeployTarget(env);
  const commandDefinitions = await loadCommandDefinitions();
  const commandNames = commandDefinitions.map((command) => command.name);
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  console.log(`[commands:deploy] mode=${target.mode}`);
  if (target.mode === 'guild') {
    console.log(`[commands:deploy] guild_id=${target.guildId}`);
  } else {
    console.warn(
      '[commands:deploy] Global deploy selected; Discord propagation can take up to ~1 hour.',
    );
  }
  console.log(`[commands:deploy] command_count=${commandDefinitions.length}`);
  printNames('[commands:deploy] commands', commandNames);

  const existing = toCommandArray(await rest.get(target.getRoute));
  const diff = summarizeDiff(existing, commandDefinitions);
  console.log(
    `[commands:deploy] existing_count=${existing.length} added=${diff.added.length} updated=${diff.updated.length} removed=${diff.removed.length}`,
  );
  printNames('[commands:deploy] add', diff.added);
  printNames('[commands:deploy] update', diff.updated);
  printNames('[commands:deploy] remove', diff.removed);

  const deployed = toCommandArray(
    await rest.put(target.putRoute, {
      body: commandDefinitions,
    }),
  );
  console.log(`[commands:deploy] success deployed_count=${deployed.length}`);
  printNames(
    '[commands:deploy] deployed',
    deployed
      .filter(isChatInputCommand)
      .map((command) => command.name)
      .sort(),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    printApiError(error);
    process.exit(1);
  });
