export function horoscopeWeekKey(guildId: string, weekStart: string): string {
  return `horoscope:week:${guildId}:${weekStart}`;
}