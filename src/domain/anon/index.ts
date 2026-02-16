export function anonSubmissionKey(guildId: string, userId: string, day: string): string {
  return `anon:submit:${guildId}:${userId}:${day}`;
}