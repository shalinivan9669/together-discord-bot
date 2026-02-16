import { isFeatureEnabled } from '../../config/featureFlags';

export function ensureCheckinEnabled(): void {
  if (!isFeatureEnabled('checkin')) {
    throw new Error('Check-in feature is disabled');
  }
}