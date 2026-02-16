export function rewardLedgerKey(
  kind: string,
  key: string,
  sourceType: string,
  sourceId: string,
  userId: string
): string {
  return `${kind}:${key}:${sourceType}:${sourceId}:${userId}`;
}