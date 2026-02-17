import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type PermissionsBitField,
} from 'discord.js';
import { logger } from '../../lib/logger';
import { t, type AppLocale, type I18nKey } from '../../i18n';

export type PermissionCheckResult = {
  ok: boolean;
  missing: string[];
  where: 'guild' | `category:${string}` | `channel:${string}`;
};

type PermissionRequirement = {
  bit: bigint;
  key: I18nKey;
};

const guildRequirements: readonly PermissionRequirement[] = [
  { bit: PermissionFlagsBits.ManageChannels, key: 'permissions.manage_channels' },
  { bit: PermissionFlagsBits.ViewChannel, key: 'permissions.view_channels' },
  { bit: PermissionFlagsBits.SendMessages, key: 'permissions.send_messages' },
  { bit: PermissionFlagsBits.EmbedLinks, key: 'permissions.embed_links' },
  { bit: PermissionFlagsBits.ReadMessageHistory, key: 'permissions.read_history' }
];

const pairCategoryRequirements: readonly PermissionRequirement[] = [
  { bit: PermissionFlagsBits.ManageChannels, key: 'permissions.manage_channels' },
  { bit: PermissionFlagsBits.ViewChannel, key: 'permissions.view_channels' }
];

const targetChannelRequirements: readonly PermissionRequirement[] = [
  { bit: PermissionFlagsBits.ViewChannel, key: 'permissions.view_channels' },
  { bit: PermissionFlagsBits.SendMessages, key: 'permissions.send_messages' },
  { bit: PermissionFlagsBits.EmbedLinks, key: 'permissions.embed_links' },
  { bit: PermissionFlagsBits.ReadMessageHistory, key: 'permissions.read_history' },
  { bit: PermissionFlagsBits.ManageMessages, key: 'permissions.manage_messages' }
];

function missingPermissions(
  locale: AppLocale,
  permissions: Readonly<PermissionsBitField>,
  requirements: readonly PermissionRequirement[],
): string[] {
  return requirements
    .filter((requirement) => !permissions.has(requirement.bit))
    .map((requirement) => t(locale, requirement.key));
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
  locale?: AppLocale;
}): Promise<PermissionCheckResult[]> {
  const locale = input.locale ?? 'ru';
  const me = input.guild.members.me ?? await input.guild.members.fetchMe();
  const checks: PermissionCheckResult[] = [];

  const guildMissing = missingPermissions(locale, me.permissions, guildRequirements);
  checks.push(result('guild', guildMissing));

  if (input.pairCategoryId) {
    const category = await fetchGuildChannel(input.guild, input.pairCategoryId);

    if (!category || category.type !== ChannelType.GuildCategory) {
      checks.push(result(`category:${input.pairCategoryId}`, [t(locale, 'permissions.category_missing')]));
    } else {
      const categoryMissing = missingPermissions(locale, me.permissionsIn(category.id), pairCategoryRequirements);
      checks.push(result(`category:${input.pairCategoryId}`, categoryMissing));
    }
  }

  const uniqueChannelIds = [...new Set(input.targetChannelIds.filter((value) => value.length > 0))];

  for (const channelId of uniqueChannelIds) {
    const channel = await fetchGuildChannel(input.guild, channelId);

    if (!channel) {
      checks.push(result(`channel:${channelId}`, [t(locale, 'permissions.channel_not_found')]));
      continue;
    }

    const missing = missingPermissions(locale, me.permissionsIn(channel.id), targetChannelRequirements);
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
  locale?: AppLocale;
}): Promise<string | null> {
  const locale = input.locale ?? 'ru';
  const checks = await runPermissionsCheck({
    guild: input.guild,
    pairCategoryId: input.pairCategoryId,
    targetChannelIds: [],
    locale
  });

  const categoryIssue = checks.find((check) => check.where.startsWith('category:') && !check.ok);
  if (categoryIssue) {
    return t(locale, 'pair.permission.category_missing', { missing: categoryIssue.missing.join(', ') });
  }

  const guildIssue = checks.find((check) => check.where === 'guild' && !check.ok);
  if (guildIssue) {
    return t(locale, 'pair.permission.guild_missing', { missing: guildIssue.missing.join(', ') });
  }

  return null;
}
