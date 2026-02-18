import { setGuildSettings } from '../services/setupService';

export async function setupSetChannelsUsecase(input: {
  guildId: string;
  duelPublicChannelId?: string | null;
  duelsChannelId?: string | null;
  oracleChannelId?: string | null;
  questionsChannelId?: string | null;
  raidChannelId?: string | null;
}) {
  const duelsChannelId = input.duelsChannelId ?? input.duelPublicChannelId;
  return setGuildSettings(input.guildId, {
    duelPublicChannelId: duelsChannelId,
    duelsChannelId,
    oracleChannelId: input.oracleChannelId,
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
