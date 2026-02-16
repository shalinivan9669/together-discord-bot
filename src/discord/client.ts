import { Client, Events, GatewayIntentBits, type Interaction } from 'discord.js';
import type PgBoss from 'pg-boss';
import { handleChatInputCommand } from './commands';
import type { CommandContext } from './commands/types';
import { routeInteractionComponent } from './interactions/router';
import { logger } from '../lib/logger';

type CreateDiscordClientParams = {
  token: string;
  boss: PgBoss;
};

export type DiscordRuntime = {
  client: Client;
  login: () => Promise<void>;
  destroy: () => Promise<void>;
  isReady: () => boolean;
};

export function createDiscordRuntime(params: CreateDiscordClientParams): DiscordRuntime {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  let ready = false;

  client.once(Events.ClientReady, (c) => {
    ready = true;
    logger.info({ feature: 'discord', bot_user_id: c.user.id, guild_count: c.guilds.cache.size }, 'Discord ready');
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    ready = false;
    logger.warn({ feature: 'discord', shard_id: shardId, code: event.code }, 'Discord shard disconnected');
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    ready = true;
    logger.info({ feature: 'discord', shard_id: shardId, replayed_events: replayedEvents }, 'Discord shard resumed');
  });

  const commandContext: CommandContext = {
    client,
    boss: params.boss
  };

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(commandContext, interaction);
      return;
    }

    if (
      interaction.isButton()
      || interaction.isModalSubmit()
      || interaction.isStringSelectMenu()
      || interaction.isChannelSelectMenu()
      || interaction.isRoleSelectMenu()
    ) {
      await routeInteractionComponent(
        {
          client,
          boss: params.boss
        },
        interaction,
      );
    }
  });

  return {
    client,
    async login() {
      await client.login(params.token);
    },
    async destroy() {
      await client.destroy();
      ready = false;
    },
    isReady() {
      return ready;
    }
  };
}
