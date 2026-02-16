import { isFeatureEnabled } from '../../config/featureFlags';

export function ensureRaidEnabled(): void {
  if (!isFeatureEnabled('raid')) {
    throw new Error('Raid feature is disabled');
  }
}