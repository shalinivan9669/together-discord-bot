import { upsertGuildSettings } from '../../infra/db/queries/guildSettings';

export type GuildSettingsPatch = Partial<{
  timezone: string;
  pairCategoryId: string | null;
  oracleChannelId: string | null;
  publicPostChannelId: string | null;
  anonInboxChannelId: string | null;
  anonModRoleId: string | null;
  horoscopeEnabled: boolean;
  horoscopeChannelId: string | null;
  horoscopeEveryDays: number;
  horoscopeNextRunAt: Date | null;
  horoscopeLastPostAt: Date | null;
  horoscopePostMessageId: string | null;
  features: Record<string, boolean>;
  questionsChannelId: string | null;
  raidChannelId: string | null;
  duelPublicChannelId: string | null;
  hallChannelId: string | null;
  moderatorRoleId: string | null;
}>;

export async function setGuildSettings(guildId: string, patch: GuildSettingsPatch) {
  return upsertGuildSettings(guildId, patch);
}

