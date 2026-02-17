import { Client, Events, GatewayIntentBits, type Guild, type Interaction } from 'discord.js';
import type PgBoss from 'pg-boss';
import { handleChatInputCommand } from './commands';
import type { CommandContext } from './commands/types';
import { routeInteractionComponent } from './interactions/router';
import { logger } from '../lib/logger';

type CreateDiscordClientParams = {
  token: string;
  boss: PgBoss;
  allowedGuildIds?: readonly string[];
};

export type DiscordRuntime = {
  client: Client;
  login: () => Promise<void>;
  destroy: () => Promise<void>;
  isReady: () => boolean;
  guildCount: () => number;
};

export function createDiscordRuntime(params: CreateDiscordClientParams): DiscordRuntime {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });
  const allowedGuildIds = params.allowedGuildIds && params.allowedGuildIds.length > 0
    ? new Set(params.allowedGuildIds)
    : null;

  let ready = false;

  async function leaveGuildIfDisallowed(guild: Guild, reason: 'startup' | 'guild_join'): Promise<void> {
    if (!allowedGuildIds || allowedGuildIds.has(guild.id)) {
      return;
    }

    logger.warn(
      {
        feature: 'discord.allowlist',
        action: 'leave_guild',
        guild_id: guild.id,
        guild_name: guild.name,
        reason
      },
      'Guild is not in allowlist; leaving',
    );

    try {
      await guild.leave();
    } catch (error) {
      logger.error(
        {
          feature: 'discord.allowlist',
          action: 'leave_guild_failed',
          guild_id: guild.id,
          guild_name: guild.name,
          reason,
          error
        },
        'Failed to leave disallowed guild',
      );
    }
  }

  client.once(Events.ClientReady, async (c) => {
    ready = true;
    logger.info({ feature: 'discord', bot_user_id: c.user.id, guild_count: c.guilds.cache.size }, 'Discord ready');

    if (!allowedGuildIds) {
      return;
    }

    await Promise.all(
      c.guilds.cache.map(async (guild) => leaveGuildIfDisallowed(guild, 'startup')),
    );
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    ready = false;
    logger.warn({ feature: 'discord', shard_id: shardId, code: event.code }, 'Discord shard disconnected');
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    ready = true;
    logger.info({ feature: 'discord', shard_id: shardId, replayed_events: replayedEvents }, 'Discord shard resumed');
  });

  client.on(Events.GuildCreate, async (guild) => {
    await leaveGuildIfDisallowed(guild, 'guild_join');
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
    },
    guildCount() {
      return client.guilds.cache.size;
    }
  };
}
