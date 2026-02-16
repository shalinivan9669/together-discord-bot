import { isFeatureEnabled } from '../../config/featureFlags';

export function ensureAnonEnabled(): void {
  if (!isFeatureEnabled('anon')) {
    throw new Error('Anonymous questions feature is disabled');
  }
}