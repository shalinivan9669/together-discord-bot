export function checkinWeekKey(pairId: string, weekStart: string): string {
  return `checkin:week:${pairId}:${weekStart}`;
}