export function oracleWeekKey(guildId: string, weekStart: string): string {
  return `oracle:week:${guildId}:${weekStart}`;
}
