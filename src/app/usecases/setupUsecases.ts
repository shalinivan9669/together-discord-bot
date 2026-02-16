import { setGuildSettings } from '../services/setupService';

export async function setupSetChannelsUsecase(input: {
  guildId: string;
  duelPublicChannelId?: string | null;
  horoscopeChannelId?: string | null;
  questionsChannelId?: string | null;
  raidChannelId?: string | null;
}) {
  return setGuildSettings(input.guildId, {
    duelPublicChannelId: input.duelPublicChannelId,
    horoscopeChannelId: input.horoscopeChannelId,
    questionsChannelId: input.questionsChannelId,
    raidChannelId: input.raidChannelId
  });
}

export async function setupSetTimezoneUsecase(guildId: string, timezone: string) {
  return setGuildSettings(guildId, { timezone });
}

export async function setupSetModeratorRoleUsecase(guildId: string, moderatorRoleId: string | null) {
  return setGuildSettings(guildId, { moderatorRoleId });
}