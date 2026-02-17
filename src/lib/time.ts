const MS_IN_DAY = 24 * 60 * 60 * 1000;

export function nowIso(): string {
  return new Date().toISOString();
}

export function startOfWeekIso(date: Date): string {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(utc).getUTCDay();
  const diff = (day + 6) % 7;
  const monday = utc - diff * MS_IN_DAY;
  return new Date(monday).toISOString().slice(0, 10);
}

export function dateOnly(input: Date): string {
  return input.toISOString().slice(0, 10);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_IN_DAY);
}
