import type { GuildConfig } from '../../app/services/guildConfigService';

const DRAFT_TTL_MS = 30 * 60 * 1000;

export type SetupWizardDraft = {
  guildId: string;
  userId: string;
  pairCategoryId: string | null;
  horoscopeChannelId: string | null;
  raidChannelId: string | null;
  hallChannelId: string | null;
  publicPostChannelId: string | null;
  anonInboxChannelId: string | null;
  anonModRoleId: string | null;
  timezone: string;
  updatedAtMs: number;
};

const drafts = new Map<string, SetupWizardDraft>();

function keyOf(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function nowMs(): number {
  return Date.now();
}

function pruneExpiredDrafts(now: number): void {
  for (const [key, draft] of drafts) {
    if (now - draft.updatedAtMs > DRAFT_TTL_MS) {
      drafts.delete(key);
    }
  }
}

function toDraft(guildId: string, userId: string, settings: GuildConfig): SetupWizardDraft {
  return {
    guildId,
    userId,
    pairCategoryId: settings.pairCategoryId,
    horoscopeChannelId: settings.horoscopeChannelId,
    raidChannelId: settings.raidChannelId,
    hallChannelId: settings.hallChannelId,
    publicPostChannelId: settings.publicPostChannelId,
    anonInboxChannelId: settings.anonInboxChannelId,
    anonModRoleId: settings.anonModRoleId,
    timezone: settings.timezone,
    updatedAtMs: nowMs()
  };
}

export function ensureSetupWizardDraft(
  guildId: string,
  userId: string,
  settings: GuildConfig,
): SetupWizardDraft {
  const now = nowMs();
  pruneExpiredDrafts(now);

  const key = keyOf(guildId, userId);
  const existing = drafts.get(key);
  if (existing) {
    existing.updatedAtMs = now;
    drafts.set(key, existing);
    return existing;
  }

  const created = toDraft(guildId, userId, settings);
  drafts.set(key, created);
  return created;
}

export function resetSetupWizardDraft(
  guildId: string,
  userId: string,
  settings: GuildConfig,
): SetupWizardDraft {
  const draft = toDraft(guildId, userId, settings);
  drafts.set(keyOf(guildId, userId), draft);
  return draft;
}

export function getSetupWizardDraft(guildId: string, userId: string): SetupWizardDraft | null {
  const now = nowMs();
  pruneExpiredDrafts(now);

  const draft = drafts.get(keyOf(guildId, userId)) ?? null;
  if (!draft) {
    return null;
  }

  draft.updatedAtMs = now;
  drafts.set(keyOf(guildId, userId), draft);
  return draft;
}

export function patchSetupWizardDraft(
  guildId: string,
  userId: string,
  patch: Partial<Omit<SetupWizardDraft, 'guildId' | 'userId' | 'updatedAtMs'>>,
): SetupWizardDraft {
  const current = drafts.get(keyOf(guildId, userId));
  if (!current) {
    throw new Error('Setup wizard draft not found. Run /setup first.');
  }

  const next: SetupWizardDraft = {
    ...current,
    ...patch,
    updatedAtMs: nowMs()
  };

  drafts.set(keyOf(guildId, userId), next);
  return next;
}

export function clearSetupWizardDraft(guildId: string, userId: string): void {
  drafts.delete(keyOf(guildId, userId));
}
