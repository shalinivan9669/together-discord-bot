import { env } from './env';

export const featureFlags = {
  horoscope: env.PHASE2_HOROSCOPE_ENABLED,
  checkin: env.PHASE2_CHECKIN_ENABLED,
  anon: env.PHASE2_ANON_ENABLED,
  rewards: env.PHASE2_REWARDS_ENABLED,
  seasons: env.PHASE2_SEASONS_ENABLED,
  raid: env.PHASE2_RAID_ENABLED
} as const;

export type FeatureFlagKey = keyof typeof featureFlags;

export function isFeatureEnabled(feature: FeatureFlagKey): boolean {
  return featureFlags[feature];
}