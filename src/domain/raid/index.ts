export function raidWeekKey(guildId: string, weekStart: string): string {
  return `raid:week:${guildId}:${weekStart}`;
}