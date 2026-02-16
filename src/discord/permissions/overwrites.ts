import type { OverwriteResolvable } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';

export function buildPairRoomOverwrites(params: {
  guildId: string;
  botUserId: string;
  memberIds: [string, string];
  moderatorRoleId?: string | null;
}): OverwriteResolvable[] {
  const [user1, user2] = params.memberIds;
  const overwrites: OverwriteResolvable[] = [
    {
      id: params.guildId,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: user1,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },
    {
      id: user2,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },
    {
      id: params.botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels
      ]
    }
  ];

  if (params.moderatorRoleId) {
    overwrites.push({
      id: params.moderatorRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages]
    });
  }

  return overwrites;
}