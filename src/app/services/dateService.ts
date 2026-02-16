import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DateFilters, DateIdea } from '../../domain/date';
import { generateDateIdeas } from '../../domain/date';
import { db } from '../../infra/db/drizzle';
import { dateWeekendPlans } from '../../infra/db/schema';
import { addDays, dateOnly } from '../../lib/time';

export function upcomingWeekendDate(now: Date = new Date()): string {
  const utcDayStart = new Date(`${dateOnly(now)}T00:00:00.000Z`);
  const day = utcDayStart.getUTCDay();
  const daysUntilSaturday = (6 - day + 7) % 7;
  return dateOnly(addDays(utcDayStart, daysUntilSaturday));
}

export function buildDateIdeas(filters: DateFilters): DateIdea[] {
  return generateDateIdeas(filters);
}

export async function saveDateIdeasForWeekend(input: {
  guildId: string;
  userId: string;
  pairId: string | null;
  filters: DateFilters;
  ideas: DateIdea[];
  now?: Date;
}) {
  const weekendDate = upcomingWeekendDate(input.now);

  const inserted = await db
    .insert(dateWeekendPlans)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      userId: input.userId,
      pairId: input.pairId,
      weekendDate,
      energy: input.filters.energy,
      budget: input.filters.budget,
      timeWindow: input.filters.timeWindow,
      ideasJson: input.ideas
    })
    .onConflictDoNothing({
      target: [
        dateWeekendPlans.guildId,
        dateWeekendPlans.userId,
        dateWeekendPlans.weekendDate,
        dateWeekendPlans.energy,
        dateWeekendPlans.budget,
        dateWeekendPlans.timeWindow
      ]
    })
    .returning();

  if (inserted[0]) {
    return {
      created: true,
      row: inserted[0]
    };
  }

  const existing = await db
    .select()
    .from(dateWeekendPlans)
    .where(
      and(
        eq(dateWeekendPlans.guildId, input.guildId),
        eq(dateWeekendPlans.userId, input.userId),
        eq(dateWeekendPlans.weekendDate, weekendDate),
        eq(dateWeekendPlans.energy, input.filters.energy),
        eq(dateWeekendPlans.budget, input.filters.budget),
        eq(dateWeekendPlans.timeWindow, input.filters.timeWindow),
      ),
    )
    .limit(1);

  return {
    created: false,
    row: existing[0] ?? null
  };
}
