import { upsertGuildSettings } from '../../infra/db/queries/guildSettings';

export type GuildSettingsPatch = Partial<{
  timezone: string;
  horoscopeChannelId: string | null;
  questionsChannelId: string | null;
  raidChannelId: string | null;
  duelPublicChannelId: string | null;
  hallChannelId: string | null;
  moderatorRoleId: string | null;
}>;

export async function setGuildSettings(guildId: string, patch: GuildSettingsPatch) {
  return upsertGuildSettings(guildId, patch);
}
