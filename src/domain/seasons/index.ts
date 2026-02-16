export function seasonKey(guildId: string, season: string): string {
  return `season:${guildId}:${season}`;
}