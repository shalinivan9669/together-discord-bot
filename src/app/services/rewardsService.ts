import { isFeatureEnabled } from '../../config/featureFlags';

export function ensureRewardsEnabled(): void {
  if (!isFeatureEnabled('rewards')) {
    throw new Error('Rewards feature is disabled');
  }
}