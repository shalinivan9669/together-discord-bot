export const setupWizardTimezones = [
  'Asia/Almaty',
  'UTC',
  'Europe/Moscow',
  'Europe/Berlin',
  'Asia/Dubai',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles'
] as const;

export type SetupWizardTimezone = (typeof setupWizardTimezones)[number];

export function isSupportedSetupWizardTimezone(value: string): boolean {
  return setupWizardTimezones.includes(value as SetupWizardTimezone);
}

export function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
