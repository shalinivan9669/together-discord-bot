import { PermissionFlagsBits, type ChatInputCommandInteraction, type CommandInteraction } from 'discord.js';

export function assertGuildOnly(
  interaction: ChatInputCommandInteraction | CommandInteraction,
): asserts interaction is ChatInputCommandInteraction<'cached'> {
  if (!interaction.inCachedGuild()) {
    throw new Error('This command can only be used in a guild.');
  }
}

export function hasAdminPermission(interaction: ChatInputCommandInteraction<'cached'>): boolean {
  return interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
}

export function hasModeratorRole(
  interaction: ChatInputCommandInteraction<'cached'>,
  moderatorRoleId?: string | null,
): boolean {
  if (!moderatorRoleId) {
    return false;
  }

  return interaction.member.roles.cache.has(moderatorRoleId);
}

export function assertAdminOrConfiguredModerator(
  interaction: ChatInputCommandInteraction<'cached'>,
  moderatorRoleId?: string | null,
): void {
  if (hasAdminPermission(interaction) || hasModeratorRole(interaction, moderatorRoleId)) {
    return;
  }

  throw new Error('Admin permission or configured moderator role is required.');
}