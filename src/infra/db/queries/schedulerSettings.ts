import { eq } from 'drizzle-orm';
import { db } from '../drizzle';
import { schedulerSettings } from '../schema';

export async function listSchedulerSettings() {
  return db.select().from(schedulerSettings);
}

export async function getSchedulerSetting(scheduleName: string) {
  const rows = await db
    .select()
    .from(schedulerSettings)
    .where(eq(schedulerSettings.scheduleName, scheduleName))
    .limit(1);

  return rows[0] ?? null;
}

export async function upsertSchedulerSetting(scheduleName: string, enabled: boolean) {
  const [row] = await db
    .insert(schedulerSettings)
    .values({ scheduleName, enabled })
    .onConflictDoUpdate({
      target: schedulerSettings.scheduleName,
      set: {
        enabled,
        updatedAt: new Date()
      }
    })
    .returning();

  return row;
}
