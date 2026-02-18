import { eq } from 'drizzle-orm';
import { db } from '../drizzle';
import { guildSettings } from '../schema';

export async function getGuildSettings(guildId: string) {
  const rows = await db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertGuildSettings(
  guildId: string,
  patch: Partial<{
    locale: string;
    timezone: string;
    pairCategoryId: string | null;
    oracleChannelId: string | null;
    oracleMessageId: string | null;
    astroHoroscopeChannelId: string | null;
    astroHoroscopeMessageId: string | null;
    astroHoroscopeAnchorDate: string | null;
    publicPostChannelId: string | null;
    anonInboxChannelId: string | null;
    anonModRoleId: string | null;
    features: Record<string, boolean>;
    questionsChannelId: string | null;
    raidChannelId: string | null;
    duelPublicChannelId: string | null;
    hallChannelId: string | null;
    moderatorRoleId: string | null;
  }>,
) {
  const normalizedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as typeof patch;

  const [row] = await db
    .insert(guildSettings)
    .values({ guildId, ...normalizedPatch })
    .onConflictDoUpdate({
      target: guildSettings.guildId,
      set: {
        ...normalizedPatch,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

