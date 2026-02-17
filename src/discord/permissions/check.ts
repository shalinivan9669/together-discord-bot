import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type PermissionsBitField,
} from 'discord.js';
import { logger } from '../../lib/logger';

export type PermissionCheckResult = {
  ok: boolean;
  missing: string[];
  where: 'guild' | `category:${string}` | `channel:${string}`;
};

type PermissionRequirement = {
  bit: bigint;
  label: string;
};

const guildRequirements: readonly PermissionRequirement[] = [
  { bit: PermissionFlagsBits.ManageChannels, label: 'Manage Channels' },
  { bit: PermissionFlagsBits.ViewChannel, label: 'View Channels' },
  { bit: PermissionFlagsBits.SendMessages, label: 'Send Messages' },
  { bit: PermissionFlagsBits.EmbedLinks, label: 'Embed Links' },
  { bit: PermissionFlagsBits.ReadMessageHistory, label: 'Read Message History' }
];

const pairCategoryRequirements: readonly PermissionRequirement[] = [
  { bit: PermissionFlagsBits.ManageChannels, label: 'Manage Channels' },
  { bit: PermissionFlagsBits.ViewChannel, label: 'View Channels' }
];

const targetChannelRequirements: readonly PermissionRequirement[] = [
  { bit: PermissionFlagsBits.ViewChannel, label: 'View Channels' },
  { bit: PermissionFlagsBits.SendMessages, label: 'Send Messages' },
  { bit: PermissionFlagsBits.EmbedLinks, label: 'Embed Links' },
  { bit: PermissionFlagsBits.ReadMessageHistory, label: 'Read Message History' },
  { bit: PermissionFlagsBits.ManageMessages, label: 'Manage Messages' }
];

function missingPermissions(
  permissions: Readonly<PermissionsBitField>,
  requirements: readonly PermissionRequirement[],
): string[] {
  return requirements
    .filter((requirement) => !permissions.has(requirement.bit))
    .map((requirement) => requirement.label);
}

function result(where: PermissionCheckResult['where'], missing: string[]): PermissionCheckResult {
  return {
    where,
    missing,
    ok: missing.length === 0
  };
}

async function fetchGuildChannel(guild: Guild, channelId: string): Promise<GuildBasedChannel | null> {
  const cached = guild.channels.cache.get(channelId);
  if (cached) {
    return cached;
  }

  return guild.channels.fetch(channelId);
}

export async function runPermissionsCheck(input: {
  guild: Guild;
  pairCategoryId?: string | null;
  targetChannelIds: string[];
}): Promise<PermissionCheckResult[]> {
  const me = input.guild.members.me ?? await input.guild.members.fetchMe();
  const checks: PermissionCheckResult[] = [];

  const guildMissing = missingPermissions(me.permissions, guildRequirements);
  checks.push(result('guild', guildMissing));

  if (input.pairCategoryId) {
    const category = await fetchGuildChannel(input.guild, input.pairCategoryId);

    if (!category || category.type !== ChannelType.GuildCategory) {
      checks.push(result(`category:${input.pairCategoryId}`, ['Category is missing or not a category']));
    } else {
      const categoryMissing = missingPermissions(me.permissionsIn(category.id), pairCategoryRequirements);
      checks.push(result(`category:${input.pairCategoryId}`, categoryMissing));
    }
  }

  const uniqueChannelIds = [...new Set(input.targetChannelIds.filter((value) => value.length > 0))];

  for (const channelId of uniqueChannelIds) {
    const channel = await fetchGuildChannel(input.guild, channelId);

    if (!channel) {
      checks.push(result(`channel:${channelId}`, ['Channel not found']));
      continue;
    }

    const missing = missingPermissions(me.permissionsIn(channel.id), targetChannelRequirements);
    checks.push(result(`channel:${channelId}`, missing));
  }

  for (const check of checks) {
    if (!check.ok) {
      logger.warn(
        {
          feature: 'permissions',
          action: 'permissions.missing',
          guild_id: input.guild.id,
          where: check.where,
          missing: check.missing
        },
        'Missing Discord permissions detected',
      );
    }
  }

  return checks;
}

export async function describePairCreatePermissionIssue(input: {
  guild: Guild;
  pairCategoryId?: string | null;
}): Promise<string | null> {
  const checks = await runPermissionsCheck({
    guild: input.guild,
    pairCategoryId: input.pairCategoryId,
    targetChannelIds: []
  });

  const categoryIssue = checks.find((check) => check.where.startsWith('category:') && !check.ok);
  if (categoryIssue) {
    return `Missing ${categoryIssue.missing.join(', ')} in configured pair category.`;
  }

  const guildIssue = checks.find((check) => check.where === 'guild' && !check.ok);
  if (guildIssue) {
    return `Missing ${guildIssue.missing.join(', ')} at server level.`;
  }

  return null;
}
