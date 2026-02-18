type SetupTestFeature = 'oracle' | 'astro';
type SetupTestState = 'succeeded' | 'failed';

export type SetupTestStatus = {
  correlationId: string;
  guildId: string;
  userId?: string;
  feature: SetupTestFeature;
  state: SetupTestState;
  message: string;
  updatedAtMs: number;
};

const STATUS_TTL_MS = 10 * 60 * 1000;
const statuses = new Map<string, SetupTestStatus>();

function nowMs(): number {
  return Date.now();
}

function prune(now: number): void {
  for (const [key, value] of statuses.entries()) {
    if (now - value.updatedAtMs > STATUS_TTL_MS) {
      statuses.delete(key);
    }
  }
}

export function recordSetupTestStatus(input: Omit<SetupTestStatus, 'updatedAtMs'>): void {
  const now = nowMs();
  prune(now);
  statuses.set(input.correlationId, {
    ...input,
    updatedAtMs: now,
  });
}

export function getSetupTestStatus(correlationId: string): SetupTestStatus | null {
  const now = nowMs();
  prune(now);
  return statuses.get(correlationId) ?? null;
}

export async function waitForSetupTestStatus(
  correlationId: string,
  timeoutMs: number,
  pollMs: number,
): Promise<SetupTestStatus | null> {
  const startedAt = nowMs();
  while (nowMs() - startedAt < timeoutMs) {
    const value = getSetupTestStatus(correlationId);
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return null;
}
