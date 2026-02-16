import { eq } from 'drizzle-orm';
import { db } from '../drizzle';
import { guildSettings } from '../schema';

export async function getGuildSettings(guildId: string) {
  const rows = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertGuildSettings(
  guildId: string,
  patch: Partial<{
    timezone: string;
    horoscopeChannelId: string | null;
    questionsChannelId: string | null;
    raidChannelId: string | null;
    duelPublicChannelId: string | null;
    hallChannelId: string | null;
    moderatorRoleId: string | null;
  }>,
) {
  const [row] = await db
    .insert(guildSettings)
    .values({ guildId, ...patch })
    .onConflictDoUpdate({
      target: guildSettings.guildId,
      set: {
        ...patch,
        updatedAt: new Date()
      }
    })
    .returning();

  return row;
}
